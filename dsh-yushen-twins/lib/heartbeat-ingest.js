/* 标签
 * id: lib-heartbeat-ingest
 * kind: module
 * summary: 心跳→事件的闸门：一天 48 跳里，只有「落了点 / 出了异常 / 有人在等」才转成一条记忆事件，空转只留在心跳层。
 * audience: 心跳的调用方（selfcheck / freeTime 收尾）、记忆库、以后接闭环的人
 * owner: 框架；判据（三条 + 词表）要老板点头才能改
 * defaults: 一天大约转 0–5 条（照今天真实心跳估的，见下）；幂等游标落 runtime/<角色>/heartbeat-ingested.json
 * usage: ingestHeartbeats(role, { day, now }) → { ok, scanned, matched, appended, skipped, folded, fromLine, toLine }
 * off: 不调用它就等于关（本模块不注册定时器、不自己跑）
 * tags: 心跳, 事件, 记忆, 闸门, 闭环
 * created: 2026-11-11 00:30:00
 * changed: 2026-11-11 00:47:31
 * author: 大鱼·子代理（闭环 P1）
 * authority: 老板（2026-11-10：心跳并入记忆要过闸门——「空转只留在心跳层，只有值得记的才进事件」，否则 200 条上限两天被心跳挤爆）
 * why: 心跳一天 48 跳/角色，全进记忆会把 memory-core 的 MAX_EVENTS（200）挤爆，真记忆被挤进冷档；不进又丢掉"她不在时发生了什么"。
 * result: shouldIngest() 给三条判据的判断和理由；ingestHeartbeats() 逐行判、转、记游标（幂等），失败静默。
 * mutable: 可改（判据只增不减；词表只能加词，不许删"没落点就不转"这条）
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 闭环里的位置：
//   心跳（heartbeat/<日>.jsonl，一天 48 跳×角色）
//     └─ 本模块（闸门）
//          └─ 事件（memory-core 的 appendEvent → 记忆库）
//               └─ 图书馆卡片（catalog 扫 events）→ 检索 → 醒来段
//
// 三条判据（老板定的，写死；只许加，不许放宽）：
//   ① landed === true       —— 落了点（记了一句 / 排了一件下一步）
//   ② did 里含异常词         —— 出了事（没做成 / 失败 / 对不上 / 没亮 / 出错 / 拒 / 停 / 超时 / 断了）
//   ③ Number(unanswered)>0  —— 有人在等（有人找她，她没回）
// 自省那一跳（trigger=自省）三条都不中 → **不转**（体跳不是经历）。
//
// 为什么用固定词表而不是"看语义"：这个词表能被人一眼复核，也不会因为模型换了就漂。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir } from './runtime.js'
import { appendEvent } from './memory.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const HB_DIR = path.join(DATA, 'heartbeat')

/** 异常词表（固定，能被人一眼复核；只许加词，不许为了让某条转进来而删词）。 */
export const ANOMALY_WORDS = Object.freeze([
  '没做成', '失败', '对不上', '没亮', '出错', '异常', '超时', '断了', '拒', '停',
  // 2026-11-11 主代理补：体检缺口是真问题，不该被当空转（S3 接线时实测到的漏网）。
  '缺口',
])

/** 这一跳值不值得转成一条记忆事件。 */
export function shouldIngest(row) {
  if (!row || typeof row !== 'object') return { yes: false, why: '空行' }
  if (row.landed === true) return { yes: true, why: '落了点' }
  const did = String(row.did || '')
  const hit = ANOMALY_WORDS.find((w) => did.includes(w))
  if (hit) return { yes: true, why: `出了事（含「${hit}」）` }
  if (Number(row.unanswered) > 0) return { yes: true, why: `有人在等（${Number(row.unanswered)} 条）` }
  // 2026-11-11 主代理：被额度线挡了一次，是她该记得的事（6 小时折叠保证不刷屏）。
  // 为什么单独一条而不是靠异常词：额度线的 did 里写的是"到线了/该收手"，没有异常词——不单列就永远转不进来。
  if (String(row.trigger || '') === '额度线') return { yes: true, why: '被额度线挡了一次' }
  if (String(row.trigger || '') === '自省') return { yes: false, why: '自省体跳：没落点、没出事、没人等' }
  return { yes: false, why: '空转（没落点、没出事、没人等）' }
}

function pad(n) { return String(n).padStart(2, '0') }
/** 本地日期（和 heartbeat-journal 的 dayOf 一个口径）。 */
export function dayOf(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function hbFile(day) { return path.join(HB_DIR, `${day}.jsonl`) }
function cursorFile(role) { return path.join(runtimeDir(role), 'heartbeat-ingested.json') }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(tmp, file)
    return true
  } catch { return false }
}
function clip(s, n) { return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n) }

/** 游标：按天存"处理到第几行"（只增；只留最近 7 天，别长成无底洞）+ 折叠表 recent。 */
function readCursor(role) {
  const doc = readJson(cursorFile(role), { version: 1, days: {}, recent: {} })
  const days = (doc && typeof doc.days === 'object' && doc.days) ? doc.days : {}
  const recent = (doc && typeof doc.recent === 'object' && doc.recent) ? doc.recent : {}
  return { version: 1, days, recent }
}
function writeCursor(role, cursor) {
  const keys = Object.keys(cursor.days).sort()
  const keep = new Set(keys.slice(-7))
  const days = {}
  for (const k of keys) if (keep.has(k)) days[k] = cursor.days[k]
  return writeJson(cursorFile(role), {
    version: 1,
    updatedAt: new Date().toISOString(),
    days,
    recent: cursor.recent || {},
  })
}

/**
 * 把某一天的心跳里"值得记的"转成记忆事件。幂等：同一行只转一次（游标记到行号）。
 * @param {string} role
 * @param {{day?:string, now?:number}} [opts]
 * @returns {{ok:boolean, role:string, day:string, scanned:number, matched:number, appended:number,
 *            skipped:number, fromLine:number, toLine:number, reason?:string}}
 */
export function ingestHeartbeats(role, { day = '', now = Date.now() } = {}) {
  const id = String(role || '').trim()
  const theDay = String(day || dayOf(now))
  const base = { ok: true, role: id, day: theDay, scanned: 0, matched: 0, appended: 0, skipped: 0, fromLine: 0, toLine: 0 }
  if (!id) return { ...base, ok: false, reason: '没有角色' }

  let text = ''
  try { text = fs.readFileSync(hbFile(theDay), 'utf8') } catch { return { ...base, reason: '没有心跳文件（这一天没跳过）' } }
  const lines = text.split(/\r?\n/).filter((l) => l.trim())

  const cursor = readCursor(id)
  const fromLine = Math.max(0, Number(cursor.days[theDay]) || 0)
  base.fromLine = fromLine
  base.scanned = Math.max(0, lines.length - fromLine)

  let matched = 0
  let appended = 0
  let skipped = 0
  let folded = 0
  let lineNo = fromLine
  const nowMs = Number(now) || Date.now()
  // 折叠（2026-11-11 实测加的，不是第四条判据，是**去重**）：
  // 同一个持续故障（例如「记忆对不上账」）每 30 分钟跳一次，如果每次都转，
  // 一天光这一个 bug 就能灌进 8 条同样的事件——那不是经历，是刷屏。
  // 所以：同一句异常 6 小时内只转一次（键 = did 前 24 字）；落点/有人等不折叠（每件都是不同的）。
  const recent = (cursor && typeof cursor.recent === 'object' && cursor.recent) ? cursor.recent : {}
  const FOLD_MS = 6 * 3600 * 1000

  for (const line of lines.slice(fromLine)) {
    lineNo += 1
    let row = null
    try { row = JSON.parse(line) } catch { skipped += 1; continue }
    // 心跳文件是三个角色混着写的：别人的行只推进游标，不处理
    if (String(row.role || '') !== id) continue
    matched += 1
    const verdict = shouldIngest(row)
    if (!verdict.yes) { skipped += 1; continue }
    if (verdict.why.startsWith('出了事')) {
      // 键里抹掉数字：同一个故障每次报的字节日志/行号会变（「现在 206213」「现在 206214」），
      // 不抹就成了两个键，折叠形同虚设（2026-11-10 实测踩到过）。
      const key = clip(String(row.did || '').replace(/\d+/g, '#'), 24)
      const last = Number(recent[key]) || 0
      if (last && nowMs - last < FOLD_MS) { folded += 1; skipped += 1; continue }
      recent[key] = nowMs
    }
    try {
      const r = appendEvent(id, {
        channel: '心跳',
        kind: '心跳',
        at: String(row.at || new Date(now).toISOString()),
        text: `心跳：${clip(row.did || '醒了一跳', 110)}`,
        source: `心跳:${theDay}:${lineNo}`,
        why: verdict.why,
        tier: verdict.why.startsWith('出了事') ? 'important' : 'normal',
      })
      if (r?.ok) appended += 1
      else skipped += 1
    } catch { skipped += 1 }
  }

  cursor.days[theDay] = lineNo
  // 折叠表只留 24 小时，别长成无底洞
  for (const k of Object.keys(recent)) if (nowMs - Number(recent[k] || 0) > 24 * 3600 * 1000) delete recent[k]
  cursor.recent = recent
  writeCursor(id, cursor)

  return { ...base, ok: true, matched, appended, skipped, folded, toLine: lineNo }
}
