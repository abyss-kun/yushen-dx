/* 标签
 * id: lib-answer-selfcheck
 * kind: module
 * summary: 回答生成后的自检：拿刚生成的答复去查结论账，冲突时在同一轮里 steer 一条更正提示；不能 steer 就记 pending，下一轮 pre-step 提醒。
 * tags: 回答自检, 结论账, 一致性, 前后矛盾, turn-stopping, steer, 更正提醒
 * created: 2026-11-17 22:05:00
 * changed: 2026-11-17 22:14:55
 * author: 大鱼·子会话
 * authority: 老板（2026-11-17：现有 claim-ledger 只在 pre-step 查“用户这句话 vs 旧结论”；要的是她回答前也能发现前后矛盾，不等用户质疑）
 * audience: dayu/index.js 的接线、下一轮会话、维护者
 * owner: 框架；answerCheck 只读结论账，不写账、不调模型
 * mutable: 可改判据/提示文案；不许在 answerCheck 里写账或调模型
 * usage: answerCheck(role,{draft,userText}) / attachAnswerSelfcheck(ctx,{roleOf,log}) / takePending(role,{sessionId})
 * defaults: 提示最多列 3 条冲突；pending 只保留 6 小时内、同一会话的最新一条，取一次就标 taken
 * off: 没接任何调用点；接上后只对 roleForSession 认得出身份的会话生效（员工/未绑卡会话不查）
 * why: assistant/message 是 session/event（append 之后才发布，不是 waterfall），改不了；agent/pre-step 又在生成之前。
 *      官方生命周期里唯一“生成后、轮次关闭前”的扩展点是 agent/turn-stopping；它按文档可以 agent.steer() 让同一轮再走一步。
 * result: 冲突时 steer 一条 user 角色的更正提示（原答复已流出去，撤不回）；steer 不可用/连续冲突时落 pending，下一轮 pre-step 注入。
 * boundary: 不能改/撤回已经 append 的 assistant/message；Web 工作台流式显示的那条已经露脸。
 *           对“turn/end 才统一投递”的通道（如 lib/group-replies.js 的群回复）最终发的是更正后的最后一条；
 *           对已流式显示的工作台，用户会先看到原答复，再看到同轮的更正答复。
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 回答生成后的自检 · 最小模块（2026-11-17）
//
// 生命周期依据（官方 0.2.1-rc.3 app.asar 里的 dsh-agent-loop / dsh-session 源码与事件文档）：
//   · agent/pre-step：waterfall，能 reject 或替换进入下一步的消息；但它在模型生成之前，手里没有“这次的答复”。
//   · agent/request：waterfall，只改 provider/model/token 等请求配置，不改消息。
//   · assistant/message：session/event，在 session.append() 提交之后才同步通知；监听器失败也是 contained，不能回滚/改消息。
//   · agent/turn-stopping：serial，在“本轮已经完成、但 turn/end 还没 append”时 await；文档原话是
//     “a listener that objects steers (agent.steer(...)) and the machine re-reads its inbox: fresh steering runs another step”。
//     所以它是唯一能“生成后、轮次关闭前”让模型再走一步的钩子；但它仍然改不了已经 append 的 assistant/message。
//
// 结论：能“追加更正/让同一轮再答一次”，不能“拦截原始消息”。不能 steer 时退化为 pending + 下一轮 pre-step 提醒。

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { checkAnswer, extractClaims, dshHome, safeRole } from './claim-ledger.js'

/** 这条 user 消息是自检注入的，不是老板/群友说的。dayu/index.js 用它跳过记忆抄录。 */
export const SELFCHECK_SOURCE = 'answer-selfcheck'

const MAX_NOTICE_CONFLICTS = 3
const MAX_CLAIM_CHARS = 160
const MAX_NOTICE_CHARS = 1200
const MAX_PENDING_AGE_MS = 6 * 60 * 60 * 1000
const MAX_PENDING_ROWS = 5000
// 这些词是“判断词”本身，不是话题；草稿只抽到它们时，用用户这句话的话题兜底。
const GENERIC_TOPICS = new Set(['方案', '决定', '结论', '结果', '目标', '重点', '关键', '原则', '本质', '计划', '安排'])

const clip = (s, n = MAX_CLAIM_CHARS) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

function pickConflict(c) {
  return {
    old: {
      id: String(c?.old?.id || ''),
      topic: clip(c?.old?.topic, 60),
      claim: clip(c?.old?.claim),
      status: String(c?.old?.status || ''),
      at: String(c?.old?.at || ''),
    },
    new: {
      id: String(c?.new?.id || ''),
      topic: clip(c?.new?.topic, 60),
      claim: clip(c?.new?.claim),
      status: String(c?.new?.status || ''),
      at: String(c?.new?.at || ''),
    },
    reason: clip(c?.reason, 400),
  }
}

/** 拼一条给模型/下一轮看的更正提示；纯字符串，不读不写。 */
export function formatNotice(conflicts = []) {
  const lines = (Array.isArray(conflicts) ? conflicts : [])
    .slice(0, MAX_NOTICE_CONFLICTS)
    .map((c, i) => {
      const old = clip(c?.old?.claim) || '（账上原话没留下）'
      const now = clip(c?.new?.claim) || '（这次的原话没抽出来）'
      return `${i + 1}. 之前：${old}\n   这次：${now}`
    })
  return [
    '【回答自检】刚生成的答复和你自己之前的结论对不上，需要更正：',
    ...lines,
    '怎么办：按旧结论说，或者明确改口——第一句写「更正：之前说错了」。不要两边都占。',
  ].join('\n')
}

/**
 * 纯函数：只读该角色的结论账，查“这次准备说的”和账上结论的方向冲突。
 * 不写账、不调模型、不读会话全文。
 *
 * @param {string} role
 * @param {{draft?:string, userText?:string}} opts draft=刚生成的答复；userText=用户这一问（草稿太短时用来兜底话题）
 * @returns {{ok:boolean, conflicts:Array, needsReview:boolean, notice:string, source:'draft', empty:boolean}}
 */
export function answerCheck(role, { draft = '', userText = '' } = {}) {
  safeRole(role)
  const text = String(draft ?? '').trim()
  if (!text) {
    return { ok: true, conflicts: [], needsReview: false, notice: '', source: 'draft', empty: true }
  }
  const user = String(userText ?? '').trim()
  const draftClaims = extractClaims(text)
  // 草稿只有“好/那就这样”这类短句时，用用户这句话里明确的话题兜底；
  // 否则只查草稿自己说到的话题，避免把无关旧账翻出来。
  const weakDraft = draftClaims.length === 0 || draftClaims.every((c) => !c.topic || c.topic.length < 2 || GENERIC_TOPICS.has(c.topic))
  const fallbackTopic = weakDraft ? (extractClaims(user).find((c) => c.topic)?.topic || '') : ''
  const res = checkAnswer(role, { text, topic: fallbackTopic })
  const conflicts = Array.isArray(res.conflicts) ? res.conflicts : []
  return {
    ok: res.ok === true,
    conflicts,
    needsReview: !!res.needsReview,
    notice: res.ok ? '' : formatNotice(conflicts),
    source: 'draft',
    empty: false,
  }
}

/** 是不是自检注入的 user 消息（dayu/index.js 用它跳过 capture/抄录，别把提示记成老板说的话）。 */
export function isSelfcheckEvent(event) {
  return String(event?.type || '') === 'user/message' && event?.data?.source?.kind === SELFCHECK_SOURCE
}

// ── pending：steer 不可用/同一轮连续冲突时的下一轮提醒 ────────────────────

/** pending 文件：<dsh home>/dayu/runtime/<role>/answer-selfcheck.jsonl。 */
export function pendingFile(role) {
  return path.join(dshHome(), 'dayu', 'runtime', safeRole(role), 'answer-selfcheck.jsonl')
}

function readPendingRows(role) {
  let text = ''
  try { text = fs.readFileSync(pendingFile(role), 'utf8') } catch { return [] }
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row && typeof row === 'object' && typeof row.id === 'string' && row.id) rows.push(row)
    } catch { /* 坏行跳过 */ }
    if (rows.length >= MAX_PENDING_ROWS) break
  }
  return rows
}

/**
 * 记一条待提醒（append-only）。同会话同轮已有一条未取走的就不重复写。
 * @returns {{ok:boolean, id:string, duplicate?:boolean, file:string, error?:string}}
 */
export function recordPending(role, { sessionId = '', turn = 0, conflicts = [], notice = '', at = Date.now() } = {}) {
  safeRole(role)
  const file = pendingFile(role)
  const rows = readPendingRows(role)
  const taken = new Set(rows.filter((r) => r.op === 'taken').map((r) => String(r.id)))
  const target = rows.find((r) => r.op === 'pending' && !taken.has(String(r.id))
    && String(r.sessionId || '') === String(sessionId || '')
    && (Number(r.turn) || 0) === (Number(turn) || 0))
  if (target) return { ok: true, id: String(target.id), duplicate: true, file }

  const id = `as-${crypto.createHash('sha1').update(`${safeRole(role)}|${sessionId}|${turn}|${Date.now()}|${Math.random()}`).digest('hex').slice(0, 12)}`
  const atMs = typeof at === 'number' && Number.isFinite(at) ? at : (Date.parse(String(at || '')) || Date.now())
  const row = {
    v: 1,
    op: 'pending',
    id,
    role: safeRole(role),
    sessionId: String(sessionId || ''),
    turn: Number(turn) || 0,
    at: new Date(atMs).toISOString(),
    notice: clip(notice || formatNotice(conflicts), MAX_NOTICE_CHARS),
    conflicts: (Array.isArray(conflicts) ? conflicts : []).slice(0, MAX_NOTICE_CONFLICTS).map(pickConflict),
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 })
    return { ok: true, id, file }
  } catch (e) {
    return { ok: false, id, file, error: String(e?.message || e) }
  }
}

function pendingMessage(notice) {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: String(notice || '') }],
    source: { kind: SELFCHECK_SOURCE, form: 'notice', summary: '回答自检：上一轮答复和结论账冲突' },
  }
}

/**
 * 取一条待提醒并标记 taken；同一会话的旧 pending 一并标掉，避免反复提醒。
 * @returns {{id:string, sessionId:string, turn:number, at:string, notice:string, conflicts:Array, message:object}|null}
 */
export function takePending(role, { sessionId = '', now = Date.now(), maxAgeMs = MAX_PENDING_AGE_MS } = {}) {
  safeRole(role)
  const rows = readPendingRows(role)
  const taken = new Set(rows.filter((r) => r.op === 'taken').map((r) => String(r.id)))
  const fresh = (r) => {
    const t = Date.parse(String(r.at || ''))
    return Number.isFinite(t) && t <= Number(now) + 60_000 && Number(now) - t <= maxAgeMs
  }
  const pending = rows.filter((r) => r.op === 'pending' && !taken.has(String(r.id)) && fresh(r)
    && (!sessionId || String(r.sessionId || '') === String(sessionId)))
  if (!pending.length) return null
  const chosen = pending[pending.length - 1]
  const file = pendingFile(role)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    for (const r of pending) {
      fs.appendFileSync(file, `${JSON.stringify({ v: 1, op: 'taken', id: String(r.id), at: new Date(Number(now)).toISOString() })}\n`, { encoding: 'utf8', mode: 0o600 })
    }
  } catch { /* 标记失败下次还会提醒，不丢 */ }
  return {
    id: String(chosen.id),
    sessionId: String(chosen.sessionId || ''),
    turn: Number(chosen.turn) || 0,
    at: String(chosen.at || ''),
    notice: String(chosen.notice || ''),
    conflicts: Array.isArray(chosen.conflicts) ? chosen.conflicts : [],
    message: pendingMessage(chosen.notice),
  }
}

// ── 接线：agent/turn-stopping ─────────────────────────────────────────────

function messageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && b.type === 'text')
    .map((b) => String(b.text ?? ''))
    .join('\n')
    .trim()
}

// pre-step 已经会往这一步塞这些 user 消息；别把它们当成“用户这一问”。
const INJECTED_PREFIX = /^【(?:台账提醒|结论冲突|回答自检)/

function buildSteerMessage(result) {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{
      type: 'text',
      text: `${result.notice}\n\n现在只输出更正后的完整答复；不要提这条自检提示。`,
    }],
    source: {
      kind: SELFCHECK_SOURCE,
      form: 'notice',
      summary: clip(`回答自检：${result.conflicts?.length || 0} 条结论冲突`, 120),
    },
  }
}

/**
 * 挂上回答自检：监听 session/event 记住本轮的最终答复和用户问题，在 agent/turn-stopping
 * 里跑 answerCheck；冲突时 agent.steer() 一条更正提示（同一轮只 steer 一次），
 * steer 不可用或同轮再次冲突就落 pending，等下一轮 pre-step 取。
 *
 * @param {object} ctx DSH 插件上下文（需要 ctx.on）
 * @param {{roleOf?:(sessionId:string)=>string, log?:(line:string)=>void, maxPendingAgeMs?:number}} opts roleOf 认不出身份返回空串
 * @returns {() => void} 注销两个监听
 */
export function attachAnswerSelfcheck(ctx, { roleOf = () => '', log = () => {}, maxPendingAgeMs = MAX_PENDING_AGE_MS } = {}) {
  const lastAssistant = new Map()
  const lastUser = new Map()
  const steered = new Map()

  const clear = (sid) => {
    lastAssistant.delete(sid)
    lastUser.delete(sid)
    steered.delete(sid)
  }

  const watch = (session, event) => {
    try {
      const sid = String(session?.id || session?.header?.id || '')
      if (!sid) return
      const type = String(event?.type || '')
      if (type === 'turn/start') { clear(sid); return }
      if (type === 'turn/end') { clear(sid); return }
      if (type === 'assistant/message') {
        if (event?.data?.interrupted) return
        const text = messageText(event?.data?.message)
        if (!text) return
        lastAssistant.set(sid, { turn: Number(event?.data?.turn) || 0, text })
        return
      }
      if (type === 'user/message') {
        if (event?.data?.source?.kind === SELFCHECK_SOURCE) return
        const text = messageText(event?.data)
        if (!text || INJECTED_PREFIX.test(text)) return
        lastUser.set(sid, text)
      }
    } catch { /* 观察失败不影响轮次 */ }
  }

  const stop = async (payload) => {
    let role = ''
    let sid = ''
    let turn = 0
    let res = null
    try {
      const agent = payload?.agent
      sid = String(agent?.session?.id || '')
      turn = Number(payload?.turn) || 0
      if (!sid || !turn) return
      role = String(roleOf(sid) || '').trim()
      // 认不出身份（员工/未绑卡会话/子代理）就不查：别拿她的结论去管别人的答复。
      if (!role) return
      const seen = lastAssistant.get(sid)
      if (!seen || seen.turn !== turn || !seen.text) return
      const userText = lastUser.get(sid) || ''
      res = answerCheck(role, { draft: seen.text, userText })
      if (res.ok) return
      if (steered.get(sid) === turn) {
        // 同一轮已经 steer 过一次：不再追加，记下来给下一轮。
        recordPending(role, { sessionId: sid, turn, conflicts: res.conflicts, notice: res.notice })
        log(`回答自检：${role} 第${turn}轮更正后仍有 ${res.conflicts.length} 条冲突，已记账留给下一轮`)
        return
      }
      steered.set(sid, turn)
      const message = buildSteerMessage(res)
      if (typeof agent.steer === 'function') {
        agent.steer(message)
      } else if (typeof agent.inject === 'function') {
        agent.inject(message)
      } else {
        recordPending(role, { sessionId: sid, turn, conflicts: res.conflicts, notice: res.notice })
        log(`回答自检：${role} 第${turn}轮发现 ${res.conflicts.length} 条冲突，但这一轮不能 steer，已记账留给下一轮`)
        return
      }
      log(`回答自检：${role} 第${turn}轮发现 ${res.conflicts.length} 条冲突，已追加更正提示（原答复已生成，不能撤回）`)
    } catch (e) {
      try {
        if (role && sid) recordPending(role, { sessionId: sid, turn, notice: '【回答自检】上一轮答复自检失败，回看结论账。' })
      } catch { /* 记账失败也不能挡轮次 */ }
      try { log(`回答自检没跑完：${String(e?.message || e).slice(0, 160)}`) } catch { /* 不挡轮次 */ }
    }
  }

  const disposeWatch = ctx.on('session/event', watch, { global: true })
  const disposeStop = ctx.on('agent/turn-stopping', stop)
  return () => {
    try { disposeWatch() } catch { /* 注销失败不挡卸载 */ }
    try { disposeStop() } catch { /* 注销失败不挡卸载 */ }
  }
}
