/* 标签
 * id: lib-turn-capture
 * kind: module
 * summary: 逐轮抄录：turn/end 当场把「你问 / 她答 / 当时在想 / 工具」写成一块，段、句、轮都有标记。
 * audience: 她（看当时的自己）、维护者
 * owner: 框架；只读事件、只追加 live，不调模型
 * mutable: 可改；三条不许破：原文不改写、思考与 step 对应、同一轮不重复
 * usage: createTurnCapture({ log, roleOf }).handle(session, event)；recover() 补漏
 * created: 2026-11-12 01:2x
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 为什么：主人要「思考和原文对应逐轮抄录，每句每段每轮分别做好对应标记」。
// 做法：每个会话当前轮先在内存攒，同时逐条写 WAL（崩了也不丢）；turn/end 时一次渲染成块，
// 追加进 live（与逐条抄录同一棵树），另写一份结构化 JSONL 给以后检索。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { appendTurnBlock, turnBlockState } from './projection.js'
import { tasksFromRaw, writeTaskFrom } from './tasks.js'
import { incidentsFromRaw, writeIncidentCard } from './incidents.js'
import { analyzeTurn } from './usage.js'
import { createLoop } from './open-loops.js'
import { effectiveFor, shouldSaveSource } from './control.js'
import {
  walDir as sourceWalDir, walFile as sourceWalFile, appendWal as sourceAppendWal,
  writeWalHead as sourceWriteWalHead, archiveWal as sourceArchiveWal, updateSession as sourceUpdateSession,
} from './source.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

import {
  renderTurn, hhmmss, boundRoleOf, splitParagraphs, splitSentences,
  splitThinkSentences, thinkScore, digestThinks, toolPurpose,
} from './transcript.js'
export {
  renderTurn, hhmmss, boundRoleOf, splitParagraphs, splitSentences,
  splitThinkSentences, thinkScore, digestThinks, toolPurpose,
} from './transcript.js'

function safeRm(file) { try { fs.rmSync(file, { force: true }) } catch { /* 删不掉下次覆盖 */ } }

export function createTurnCapture({ log = () => {}, bodyOf = null, enabled = () => true, home = HOME, onCard = null } = {}) {
  const walDir = sourceWalDir(home)
  const open = new Map() // sessionId → { turn, events, title, cwd, startedAt }
  const roleOfBody = (sid) => String((bodyOf ? bodyOf(sid) : boundRoleOf(sid, home)) || '')
  // 这一场里见过的身份注入：卡/规矩的 seq。只记“真的进了上下文”的证据，不靠自称。
  const evidence = new Map()
  function noteEvidence(sid, event) {
    if (String(event?.type || '') !== 'user/message') return
    const s = (event?.data?.content || []).map((p) => String(p?.text || '')).join('\n')
    const cur = evidence.get(sid) || { cardSeqs: [], rulesSeqs: [] }
    if (event.seq != null && /## 你是谁（[^\n]*本体卡|# 角色卡：/.test(s) && !cur.cardSeqs.includes(event.seq)) {
      cur.cardSeqs.push(event.seq)
      // 2026-11-13 老板：加载了谁的卡，就给这条会话备注上是谁——这里把「看到了卡」交给 鱼神 层去认凭据。
      try { onCard?.(sid, s, event) } catch { /* 认不出/写不进不挡抄录 */ }
    }
    if (event.seq != null && /## 鱼神的规矩（你的那一本/.test(s) && !cur.rulesSeqs.includes(event.seq)) cur.rulesSeqs.push(event.seq)
    evidence.set(sid, cur)
  }

  // 事件身份键：宿主事件序号为主；没有序号才退回时间+类型。内容哈希只做完整性，不当主键。
  function eventKeyOf(sid, event) {
    if (event?.seq != null) return `${sid}:${event.seq}:${event.type}`
    return `${sid}:${Number(event?.time) || 0}:${event.type}`
  }

  const walFile = (sid, turn) => sourceWalFile(home, sid, turn)
  const appendWal = (sid, turn, event, eventKey) => sourceAppendWal(home, sid, turn, event, eventKey)
  const writeWalHead = (sid, turn, meta) => sourceWriteWalHead(home, sid, turn, meta)
  const updateSession = (sid, info) => sourceUpdateSession(home, sid, info)
  const archiveWal = (sid, turn) => sourceArchiveWal(home, sid, turn)

  function flush(sid, { status = 'completed', outcome = '' } = {}) {
    const cur = open.get(sid)
    if (!cur) return { ok: false, why: '没有当前轮' }
    open.delete(sid)
    const role = String(roleOfBody(sid) || '')
    const rendered = renderTurn({
      sessionId: sid, turn: cur.turn, events: cur.events, role,
      body: role ? 'bound' : 'unbound', status, outcome, evidence: evidence.get(sid) || {},
    })
    if (!rendered.markdown.trim()) { safeRm(walFile(sid, cur.turn)); return { ok: false, why: '空轮' } }
    // 后台开关：本源关掉 / 直接从投影开始，就不落 raw；投影和 turns 仍然写。
    const cap = effectiveFor(role)
    const wantSource = shouldSaveSource(role)
    rendered.json.source.sourceEnabled = wantSource
    rendered.json.source.captureFrom = cap.captureFrom
    // 先归档原始事件（不可变，按轮一份），再落视图；这样宿主清理后仍能回原现场。
    const archived = wantSource ? archiveWal(sid, cur.turn) : null
    if (archived) {
      const rel = path.relative(home, archived.file).replace(/\\/g, '/')
      rendered.json.source.rawFile = rel
      rendered.json.source.rawHash = archived.hash
      rendered.markdown = `${rendered.markdown.trimEnd()}\n<!-- raw=${rel} hash=${archived.hash} -->\n`
    } else {
      rendered.json.source.rawFile = ''
      rendered.json.source.rawHash = ''
    }
    let out = null
    try {
      out = appendTurnBlock({
        sessionId: sid,
        title: cur.title || `未命名-${hhmmss(cur.startedAt).slice(0, 5)}`,
        cwd: cur.cwd,
        role,
        at: new Date(cur.startedAt || Date.now()),
        turn: cur.turn,
        markdown: rendered.markdown,
        json: rendered.json,
        summaryText: rendered.summaryText,
        status,
      })
      log(`轮次抄录：${role || '未绑定'} 第 ${cur.turn} 轮 ${status}（${rendered.stats.userSents} 句问 / ${rendered.stats.saySents} 句答 / ${rendered.stats.thinkSents} 句思考 / ${rendered.stats.tools} 次工具）`)
    } catch (e) {
      log(`轮次抄录失败：${e?.message || e}`)
    }
    // 块落盘成功才删 WAL；失败保留，下次补抄（raw 已有一份原件）。
    let rawBytes = 0
    try { if (archived?.file) rawBytes = fs.statSync(archived.file).size } catch { /* 读不到就算了 */ }
    updateSession(sid, {
      role, cwd: cur.cwd, title: cur.title,
      startedAt: cur.startedAt || 0,
      endedAt: rendered.json.endedAt ? Date.parse(rendered.json.endedAt) : Date.now(),
      turn: cur.turn, status, rawFile: archived?.file || '', bytes: rawBytes,
    })
    if (out?.ok !== false) {
      // 逐轮自动挂待办/错题：用户消息里明确的“要做/答应”或“失败+原因/修法”才写；
      // 只读用户消息，不扫助手文档；同一 fromRef 幂等，不会每轮重复。
      try {
        const rawRef = String(rendered.json?.source?.rawFile || '')
        if (rawRef) {
          const row = {
            turnId: `${sid}#${cur.turn}`, sessionId: sid, role, channel: '本机',
            at: new Date(cur.startedAt || Date.now()).toISOString(),
            ref: String(out?.row?.ref || ''), rawRef,
          }
          for (const d of tasksFromRaw(rawRef, { limit: 3, includeAssistant: true })) {
            const t = writeTaskFrom(row, d)
            // 只有“确定答应/说好”的承诺进未闭合；推测的先不进，避免把随口一说当欠账。
            if (t?.card && d.strong) {
              createLoop(role, {
                what: t.card.head, due: d.due || '', sourceTurnId: `${sid}#${cur.turn}`,
                sourceRef: t.card.ref || '', sessionId: sid, confidence: d.confidence || '确定',
              })
            }
          }
          for (const d of incidentsFromRaw(rawRef, { limit: 3 })) writeIncidentCard(row, d)
          // 抄录后本地对比整轮：用到了哪张卡；用上才记，没证据不扣。
          const userText = (rendered.json?.user || []).map((u) => u.text || '').join('\n')
          const answerText = (rendered.json?.steps || [])
            .flatMap((s) => (s.say || []).map((x) => x.text || '')).join('\n')
          const us = analyzeTurn({ turnId: `${sid}#${cur.turn}`, userText, answerText, now: Date.now() })
          if (us.marked) log(`本地对照：${us.marked} 张卡记用上了（本轮命中 ${us.hits} 张）`)
        }
      } catch (e) { log(`待办/错题自动挂载跳过：${e?.message || e}`) }
    }
    if (out?.ok !== false) safeRm(walFile(sid, cur.turn))
    return out || { ok: false }
  }

  function handle(session, event) {
    try {
      if (!enabled()) return
      const sid = String(session?.header?.id ?? session?.id ?? '')
      if (!sid) return
      const type = String(event?.type || '')
      const title = String(session?.header?.title ?? session?.meta?.title ?? '')
      const cwd = String(session?.meta?.cwd ?? session?.header?.cwd ?? '')
      const at = Number(event?.time) || Date.now()
      noteEvidence(sid, event)

      if (type === 'turn/start') {
        const turn = Number(event?.data?.turn) || 0
        const prev = open.get(sid)
        if (prev && prev.turn !== turn) flush(sid, { status: 'incomplete', outcome: '下一轮开始了，这一轮没收到 turn/end' })
        const key = eventKeyOf(sid, event)
        open.set(sid, { turn, events: [], seen: new Set([key]), title, cwd, startedAt: at })
        safeRm(walFile(sid, turn))
        writeWalHead(sid, turn, { title, cwd, role: String(roleOfBody(sid) || ''), startedAt: new Date(at).toISOString() })
        appendWal(sid, turn, event, key)
        return
      }

      const turn = Number(event?.data?.turn) || open.get(sid)?.turn || 0
      if (!open.has(sid)) {
        // 进程中途起来，先有消息后有 turn/start：按事件的 turn 开一轮
        if (!['user/message', 'assistant/message', 'tool/call', 'tool/result', 'turn/end'].includes(type)) return
        open.set(sid, { turn, events: [], seen: new Set(), title, cwd, startedAt: at })
        writeWalHead(sid, turn, { title, cwd, role: String(roleOfBody(sid) || ''), startedAt: new Date(at).toISOString() })
      }
      const cur = open.get(sid)
      if (turn && cur.turn !== turn) {
        flush(sid, { status: 'incomplete', outcome: '轮次号变了，上一轮没收到 turn/end' })
        open.set(sid, { turn, events: [], seen: new Set(), title, cwd, startedAt: at })
        writeWalHead(sid, turn, { title, cwd, role: String(roleOfBody(sid) || ''), startedAt: new Date(at).toISOString() })
      }
      const row = open.get(sid)
      row.title = title || row.title
      row.cwd = cwd || row.cwd
      const key = eventKeyOf(sid, event)
      if (!row.seen) row.seen = new Set()
      if (row.seen.has(key)) return // 同一事件重复投递：不重复进 WAL/现场
      row.seen.add(key)
      row.events.push({ ...event, _eventKey: key })
      appendWal(sid, row.turn, event, key)
      if (type === 'turn/end') {
        const outcome = String(event?.data?.reason?.kind || 'unknown')
        const status = outcome === 'completed' ? 'completed' : outcome === 'error' ? 'error' : 'aborted'
        flush(sid, { status, outcome })
      }
    } catch (e) {
      log(`轮次抄录异常：${e?.message || e}`)
    }
  }

  async function recover({ maxAgeMs = 5 * 60 * 1000 } = {}) {
    let dirs = []
    try { dirs = fs.readdirSync(walDir, { withFileTypes: true }).filter((d) => d.isDirectory()) } catch { return { recovered: 0 } }
    let recovered = 0
    for (const d of dirs) {
      const sid = d.name
      let files = []
      try { files = fs.readdirSync(path.join(walDir, sid)).filter((f) => f.endsWith('.jsonl')) } catch { continue }
      for (const f of files) {
        const file = path.join(walDir, sid, f)
        let st
        try { st = fs.statSync(file) } catch { continue }
        if (Date.now() - st.mtimeMs < maxAgeMs) continue
        let events = []
        let meta = {}
        try {
          for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
            const o = JSON.parse(line)
            if (o?._meta) meta = o._meta
            else events.push(o)
          }
        } catch { continue }
        if (!events.length) { safeRm(file); continue }
        const turn = Number(f.replace(/\.jsonl$/, '')) || 0
        // 已经落过块：也要把原始事件归档，再清 WAL，不丢原件。
        if (turnBlockState(`${sid}#${turn}`)) {
          const role0 = String(roleOfBody(sid) || '')
          const arch = shouldSaveSource(role0) ? archiveWal(sid, turn) : null
          if (arch) safeRm(file)
          continue
        }
        const role = String(roleOfBody(sid) || '')
        const cap = effectiveFor(role)
        const wantSource = shouldSaveSource(role)
        const rendered = renderTurn({ sessionId: sid, turn, events, role, body: role ? 'bound' : 'unbound', status: 'recovered', outcome: '进程中断，补抄' })
        rendered.json.source.sourceEnabled = wantSource
        rendered.json.source.captureFrom = cap.captureFrom
        const archived = wantSource ? archiveWal(sid, turn) : null
        if (archived) {
          const rel = path.relative(home, archived.file).replace(/\\/g, '/')
          rendered.json.source.rawFile = rel
          rendered.json.source.rawHash = archived.hash
          rendered.markdown = `${rendered.markdown.trimEnd()}\n<!-- raw=${rel} hash=${archived.hash} -->\n`
        } else {
          rendered.json.source.rawFile = ''
          rendered.json.source.rawHash = ''
        }
        try {
          appendTurnBlock({
            sessionId: sid, title: meta.title || `未完成-${hhmmss(rendered.json.startedAt ? Date.parse(rendered.json.startedAt) : Date.now())}`,
            cwd: meta.cwd || '', role, at: new Date(rendered.json.startedAt || Date.now()), turn,
            markdown: rendered.markdown, json: rendered.json, summaryText: rendered.summaryText, status: 'recovered',
          })
          recovered += 1
          let rawBytes = 0
          try { if (archived?.file) rawBytes = fs.statSync(archived.file).size } catch { /* 忽略 */ }
          updateSession(sid, {
            role, cwd: meta.cwd || '', title: meta.title || '',
            startedAt: rendered.json.startedAt ? Date.parse(rendered.json.startedAt) : 0,
            endedAt: rendered.json.endedAt ? Date.parse(rendered.json.endedAt) : Date.now(),
            turn, status: 'recovered', rawFile: archived?.file || '', bytes: rawBytes,
          })
          if (archived) safeRm(file)
        } catch (e) { log(`补抄失败：${e?.message || e}`) }
      }
    }
    if (recovered) log(`轮次抄录：补抄 ${recovered} 个中断轮`)
    return { recovered }
  }

  return { handle, flush, recover, enabled, _open: open }
}

export const TURN_MARKS = Object.freeze({
  turn: /<!-- turn=(\d+) /,
  msg: /<!-- msg=(\d+|—) /,
  say: /<!-- say=(\d+|—) step=(\d+) -->/,
  think: /<!-- think=(\d+|—) step=(\d+) part=(\d+) -->/,
  para: /<!-- p=(\d+) -->/,
  sentence: /<!-- s=(\d+) -->/,
  thinkPara: /<!-- kp=(\d+) -->/,
  thinkSentence: /<!-- ks=(\d+) -->/,
})

