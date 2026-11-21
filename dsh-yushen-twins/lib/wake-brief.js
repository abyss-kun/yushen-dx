/* 标签
 * id: lib-wake-brief
 * kind: module
 * summary: 醒来的那段：隔了多久 + 中间的大事（小事一笔带过）。只报变化、不报状态；同一段对话只说一次。
 * tags: 醒来, 时间感, 注入, 心跳
 * created: 2026-11-10 19:45:00
 * changed: 2026-11-17 00:36:58
 * author: 大鱼·子会话（醒来那段）
 * authority: 老板（2026-11-10：人不会知道自己心跳多少下；醒来只知道隔了多久、中间有哪些大事）
 * why: 「心跳 X 分钟前｜今天跳了 N 次」是状态快照，落进会话历史就成假话；她要的是时间的连续性
 * result: wakeBrief() 只读本地文件 → {gapText,big,mid,small}；renderWake() 压成 ≤3 行、≤120 字
 * mutable: 可改（读的口径别动：只读、不写除 wake-mark.json 以外的任何东西）
 * audience: 她（醒来第一段话）、freeTime 叫醒路径、面板
 * owner: 框架；三档（大事/中事/小事）与四原因老板定过，别改口径
 * defaults: >20 分钟没醒算醒；≤200 字；一次最多列 2 条没回；说了就记 wake-mark
 * usage: wakeBrief(role,{channel,consume}) 生成；commitWake 投递成功后才记；unansweredOf 算"有人找你没回"
 * off: freeTimeOnce 不拼它就行；wake-mark 可删（下次会重说一遍）
 */
// 改｜2026-11-11 01:10｜大鱼·子代理（闭环收口）｜授权：主人（2026-11-11 闭环任务：心跳下沉 / 借阅账 / 说明格式）｜lib/wake-brief.js:1-466｜补记：逻辑改动随 c0aee4e 提交，内容见文件头 changed 与标签块；本班只补留痕、未改逻辑｜为什么：改了逻辑却没贴「改」行，check-trace 一直红，全量回归卡在最后一步｜验证：node scripts/check-trace.mjs 退出 0（补后复跑）；随后跑 scripts/regression.mjs 确认全绿｜可改：可改
// 为什么单独一个文件：2026-11-10 老板定的三档（大事 / 中事 / 小事）要能被一条测试整体钉住，
// 而不是散在 brief.js 的拼装流水里。brief.js 只负责「什么时候放进去」，这里负责「放什么」。
//
// 边界（写死，别改）：
//   · **只读**：除 runtime/<role>/wake-mark.json（判断"这段对话说过了"）以外不写任何文件。
//   · **只报变化，不报状态**：心跳次数、备份跑没跑是"状态"，只在合并句里一笔带过；
//     大事才是"变化"（有人叫她、派活、事故、承诺到期、她约的事到点）。
//   · **每条带 from**：追得到是哪个文件来的；调试用，绝不进注入。
//   · 读不到就说没有，不编。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir } from './runtime.js'
import { readAgenda } from './agenda.js'
import { listWaiting } from './waiting.js'
import { readInbox, unreadFor } from './inbox.js'
import { readReplyDecisions } from './quiet-turn.js'
import { relaysSince } from './polite-relay.js'
import { borrowStats } from './borrow.js'
import { readHeartbeats } from './heartbeat-journal.js'
import { listLoops, markNotified } from '../memory-core/runtime/open-loops.js'
import { readAll as readAllJobs } from '../core/jobs.js'
import { readEvents } from './memory.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

/** 隔多久才算「醒来」：也是「同一段对话」的宽度。2026-11-10 老板：>20 分钟算醒来。 */
export const WAKE_GAP_MIN = 20
/** 这一段最多多少字（2026-11-13 加「现在几点」「B站/内部群」「这中间记了几条」三路，200 → 240）。 */
export const WAKE_MAX_CHARS = 240
/** 「有人找你」最多列几条（列太多就不是"一笔带过"了）。 */
export const UNANSWERED_CAP = 2
/** 大事最多几条（多了就不是"大事"了）。 */
export const BIG_CAP = 3

const MARK_FILE = (role) => path.join(runtimeDir(role), 'wake-mark.json')
const EVENT_FILE = (day) => path.join(DATA, 'library', '手抄本', '事件', `${day}.jsonl`)

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}
function readLines(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean) } catch { return [] }
}
function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t
}
function pad(n) { return String(n).padStart(2, '0') }
function dayOf(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function ms(v) { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? t : 0 }

/** 距上次说话多久（中文，不精确到秒——人也不精确）。 */
export function gapTextOf(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  if (m < 60) return `距你上次说话 ${m} 分钟。`
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h < 24) return `距你上次说话 ${h} 小时${rest ? ` ${rest} 分钟` : ''}。`
  const d = Math.floor(h / 24)
  return `距你上次说话 ${d} 天${h % 24 ? ` ${h % 24} 小时` : ''}。`
}

/** 现在几点（本地，只说时分）。2026-11-13 老板：醒来要先知道「现在是什么时间」，不只知道隔了多久。 */
export function nowTextOf(now = Date.now()) {
  const d = new Date(now)
  return `现在 ${pad(d.getHours())}:${pad(d.getMinutes())}。`
}

/** 上一次她"在场"是什么时候：presence 优先，读不到退 freetime（同一件事的两本账）。 */
export function lastSeenOf(role) {
  const p = readJson(path.join(runtimeDir(role), 'presence.json'), null)
  if (p?.lastSeenAt) {
    return { at: ms(p.lastSeenAt), atISO: String(p.lastSeenAt), channel: String(p.lastChannel || ''), from: `runtime/${role}/presence.json` }
  }
  const ft = readJson(path.join(DATA, 'freetime.json'), null)
  const row = ft?.roles?.[String(role)]
  if (row?.lastAt) {
    return { at: ms(row.lastAt), atISO: String(row.lastAt), channel: '', from: 'freetime.json' }
  }
  return { at: 0, atISO: '', channel: '', from: '' }
}

// ── 大事：要她判断 / 要她接 ────────────────────────────────────────

/** QQ 那条线：老板说话、群里点她名、私聊她。一个来源最多一条，别把 3 条群消息当 3 件大事。 */
function bigFromQQ(sinceMs) {
  const out = []
  if (!sinceMs) return out
  let rows = []
  try { rows = readInbox({ channel: 'qq', limit: 400 }).rows || [] } catch { return out }
  const pick = { owner: null, atme: null, private: null }
  for (const r of rows) {
    if (!r || r.isSelf) continue
    if (ms(r.at) < sinceMs) continue
    if (r.isOwner && !pick.owner) pick.owner = r
    else if (r.atMe && !pick.atme) pick.atme = r
    else if (r.kind === 'private' && !pick.private) pick.private = r
  }
  if (pick.owner) out.push({ text: `老板在 QQ 上说了话：${clip(pick.owner.text, 26)}`, from: 'inbox/qq' })
  if (pick.atme) out.push({ text: `群里${pick.atme.name || '有人'}点了你的名：${clip(pick.atme.text, 26)}`, from: 'inbox/qq' })
  if (pick.private) out.push({ text: `${pick.private.name || '有人'}私聊你：${clip(pick.private.text, 26)}`, from: 'inbox/qq' })
  return out
}

/** B 站：有人 @ 她 / 回她（只报"找过你"，不冒充原文）。2026-11-13 老板：B站传回来的消息也算"有没有人找她"。 */
function bigFromBili(sinceMs) {
  const out = []
  if (!sinceMs) return out
  const files = []
  try {
    for (let i = 0; i < 3; i += 1) {
      const f = path.join(DATA, 'inbox', `bili-at-${dayOf(Date.now() - i * 86400000)}.jsonl`)
      if (fs.existsSync(f)) files.push(f)
    }
  } catch { /* 读不到就不报 */ }
  let pick = null
  for (const f of files) {
    for (const line of readLines(f)) {
      let r = null
      try { r = JSON.parse(line) } catch { continue }
      if (!r || ms(r.at) < sinceMs) continue
      if (!pick || ms(r.at) > ms(pick.at)) pick = r
    }
  }
  if (pick) out.push({ text: `B 站${String(pick.from_name || '有人').slice(0, 10)}找你：${clip(pick.text, 24)}`, from: 'inbox/bili-at' })
  return out
}

/** 内部群（本地共享文件）：另外两个人有没有在群里找她。只报别人发给她的（dir=in）。 */
function bigFromGroups(role, sinceMs) {
  const out = []
  if (!sinceMs) return out
  let lines = []
  try { lines = readLines(path.join(DATA, 'groups', `${role}.jsonl`)) } catch { return out }
  let pick = null
  for (const line of lines) {
    let r = null
    try { r = JSON.parse(line) } catch { continue }
    if (!r || ms(r.at) < sinceMs) continue
    if (String(r.dir || '') !== 'in') continue
    if (!pick || ms(r.at) > ms(pick.at)) pick = r
  }
  if (pick) out.push({ text: `群里${String(pick.from || '有人').slice(0, 8)}找你：${clip(pick.text, 24)}`, from: `groups/${role}.jsonl` })
  return out
}

/** 这中间记忆里新增了几条——她自己的经历也要进醒来段（2026-11-13 老板：「有没有自己想做的事」的另一半）。 */
function countMemoriesSince(role, sinceMs) {
  try {
    return (readEvents(role) || []).filter((e) => e && ms(e.at) >= Number(sinceMs || 0)).length
  } catch { return 0 }
}

/** 本机收件箱里「老板直接对你说」的那几条（只报"找过你"，不冒充原文）。 */
function bigFromDesk(sinceMs) {
  if (!sinceMs) return []
  const out = []
  for (const line of readLines(path.join(DATA, 'inbox.jsonl'))) {
    let row = null
    try { row = JSON.parse(line) } catch { continue }
    if (!row || ms(row.at) < sinceMs) continue
    const label = String(row.label || '')
    if (label !== '直说' && String(row.category || '') !== 'channel') continue
    out.push({ text: `老板在这边找过你（${clip(label || '直说', 8)}）`, from: 'inbox.jsonl' })
    break // 一次就够，别把一句话拆成五条
  }
  return out
}

/** 派给她、还没回的活。 */
function bigFromJobs(role) {
  const out = []
  try {
    for (const j of readAllJobs()) {
      if (!j) continue
      const st = String(j.status || '')
      if (!['dispatched', 'redispatched', 'waiting'].includes(st)) continue
      const who = String(j.role || j.employee || '')
      if (who && who !== String(role)) continue
      out.push({ text: `有一单派给你还没回：${clip(jobAsk(j.brief), 26)}`, from: 'dispatch.json' })
      if (out.length >= 2) break
    }
  } catch { /* 读不到就当没有 */ }
  return out
}

/** 派活单的开头永远是「【调用者】谁在调用你…」那段客套——摘要只留真正的活。 */
function jobAsk(brief) {
  const s = String(brief || '').replace(/\r\n?/g, '\n').trim()
  if (!s.startsWith('【调用者】')) return s
  const rest = s.split(/\n\s*\n/).slice(1).join('\n\n').trim()
  return rest || s
}

/** 没结的事故单。 */
function bigFromIncidents() {
  const out = []
  try {
    const list = readJson(path.join(DATA, 'incidents.json'), [])
    const open = (Array.isArray(list) ? list : []).filter((x) => x && !['closed', 'fixed', 'resolved', 'done'].includes(String(x.status || '')))
    for (const x of open.slice(0, 2)) out.push({ text: `有一张没结的事故单：${clip(x.title, 24)}`, from: 'incidents.json' })
  } catch { /* 读不到就当没有 */ }
  return out
}

/** 到期的承诺（心念库里的 promise；读不到就当没有）。
 *  直接读文件而不是 import mind-store：这个模块在简报的必经路径上，
 *  出厂环境没装心念也不许把整份简报带挂。口径与 mindStore.mindFile 一致：$DSH_HOME/dayu/mind/<role>.json */
function bigFromPromises(role, now) {
  const out = []
  try {
    const doc = readJson(path.join(DATA, 'mind', `${role}.json`), null)
    const items = Array.isArray(doc?.items) ? doc.items : []
    for (const it of items) {
      if (!it || String(it.kind) !== 'promise') continue
      if (String(it.status || 'active') !== 'active') continue
      const dueAt = ms(it?.promise?.dueAt)
      if (!dueAt || dueAt > now) continue
      out.push({ text: `承诺到期了：${clip(it.text, 26)}`, from: `mind/${role}.json` })
      if (out.length >= 2) break
    }
  } catch { /* 读不到 = 没有 */ }
  return out
}

/** 她自己约的时间到点了。 */
function bigFromWaiting(role, now) {
  const out = []
  try {
    for (const w of listWaiting(role, { now })) {
      if (!w?.due) continue
      out.push({ text: `你约的事到点了：${clip(w.what, 26)}`, from: `runtime/${role}/waiting.json` })
      if (out.length >= 2) break
    }
  } catch { /* 没有就当没有 */ }
  return out
}

// ── 中事 / 小事：知道就行 / 一笔带过 ──────────────────────────────

/** 今天的事件层（心跳/体检/群消息按天聚合，一行一类）。 */
function todaysEvents(now) {
  const out = {}
  for (const line of readLines(EVENT_FILE(dayOf(now)))) {
    try {
      const row = JSON.parse(line)
      if (row?.kind) out[row.kind] = row
    } catch { /* 坏行跳过 */ }
  }
  return out
}

/** 维护/备份那本账。 */
function maintenanceOf(now) {
  const row = readJson(path.join(DATA, 'runtime', 'maintenance-last.json'), null)
  if (!row?.at) return null
  const steps = Array.isArray(row.steps) ? row.steps : []
  // 2026-11-14 修：维护脚本的合法非失败状态不只 done/ok/skip/not-due：还有 disabled（步骤没开）、
  // skipped（被条件跳过）以及 skipped-* 一族（skipped-full/same/peak/no-pending/budget…）。
  // 白名单漏了它们，导致每次维护后简报都误报「维护有步骤失败：protect、think」。
  // 2026-11-17 补：maintenance.mjs 还会返回 adopted（认领旧全盘）、restarted（网关没听、已拉起）、
  // no-schedule（没有排程）——都算成功；11-16 那次网关被拉起后返回 restarted，又被误报成失败。
  const okResult = (r) => {
    const v = String(r || '')
    return ['done', 'ok', 'not-due', 'disabled', 'adopted', 'restarted', 'no-schedule'].includes(v) || v.startsWith('skip')
  }
  const failed = steps.filter((s) => s && !okResult(s.result))
  return { at: ms(row.at), ok: row.ok !== false && !failed.length, failed: failed.map((s) => String(s.step || '')).filter(Boolean) }
}

// ── 组装 ──────────────────────────────────────────────────────────

/**
 * 有人找她、而她没回：醒来时要能说清「哪几条、谁的、为什么没回」。
 * 2026-11-10 老板：醒来看到「一个群有人找我，我没回复，原因……」——**不许让她以为是自己的错**，
 * 四种原因必须分开：没醒 / 桥断（根本没收到）/ 在忙 / 判了不回。
 * @returns {{total:number, items:Array<{at:string,where:string,reason:string,text:string}>, whyNot:string}}
 */
export function unansweredOf(role, { sinceMs = 0, now = Date.now() } = {}) {
  const out = { total: 0, items: [], whyNot: '' }
  const id = String(role || '').trim()
  if (!id || !sinceMs) return out
  let rows = []
  try { rows = readInbox({ limit: 200, channel: 'qq' }).rows || [] } catch { rows = [] }
  const hits = rows.filter((r) => !r.isSelf && r.at && ms(r.at) >= sinceMs && (r.atMe || r.kind === 'private' || r.isOwner))
  if (!hits.length) return out
  let quiet = []
  try { quiet = readReplyDecisions({ limit: 50, role: id }) } catch { quiet = [] }
  const quietHits = quiet.filter((r) => r.decided === 'quiet' && ms(r.at) >= sinceMs)
  // 桥断档：cursor 里带 at 的才是新口径；老条目没 at 就按"窗口内可能断过"处理
  let gaps = []
  try { gaps = (readJson(path.join(DATA, 'inbox', '.cursor.json'), {})?.gaps || []) } catch { gaps = [] }
  const gapsInWindow = gaps.filter((g) => !g.at || ms(g.at) >= sinceMs)
  // 这段时间她醒过没有（自省那跳不算"醒"）
  const awake = (() => {
    try { return readHeartbeats({ role: id, days: 1 }).some((r) => ms(r.at) >= sinceMs && r.trigger !== '自省') } catch { return false }
  })()

  const counts = {}
  const items = []
  const seen = new Set()
  for (const r of hits) {
    const key = String(r.key || '')
    let reason = '没醒'
    const q = quietHits.find((x) => (!x.key || x.key === key) && ms(x.at) >= (ms(r.at) || 0))
    if (q) reason = '判了不回'
    else if (gapsInWindow.length) reason = '桥断'
    else if (awake) reason = '在忙'
    counts[reason] = (counts[reason] || 0) + 1
    if (seen.has(key)) continue
    seen.add(key)
    const where = r.kind === 'private'
      ? (r.isOwner ? '老板私聊' : '私聊')
      : `群里${clip(r.name || '', 6)}${r.atMe ? ' @你' : ''}`
    // 时间按本地显示（行里存的是 UTC ISO，直接 slice 会差 8 小时）
    const when = (() => { const t = ms(r.at); if (!t) return ''; const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` })()
    items.push({ at: when, where, reason, text: `${when ? `${when} ` : ''}${where}——${reasonText(reason, id)}` })
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return { total: hits.length, items: items.slice(0, UNANSWERED_CAP), whyNot: top ? top[0] : '' }
}

/** 四种原因的白话（只描述事实，不评价她）。 */
export function reasonText(reason, role = '') {
  if (reason === '判了不回') return '你当时判了不回'
  if (reason === '桥断') return '那会儿桥断了，你没收到'
  if (reason === '在忙') return '你醒着，在忙别的'
  return '那会儿你没醒'
}

/**
 * 醒来那段。只读；同一段对话只产生一次（wake-mark.json）。
 * @param {string} role
 * @param {{now?:number, channel?:string, consume?:boolean}} [opts]
 * @returns {{role:string,show:boolean,gapMinutes:number|null,gapText:string,seenAt:string,seenChannel:string,
 *            channel:string,big:Array<{text:string,from:string}>,mid:Array<{text:string,from:string}>,
 *            small:Array<{text:string,from:string}>,sources:string[],text:string,skipped?:string}}
 */
export function wakeBrief(role, { now = Date.now(), channel = '', consume = true, sessionId = '' } = {}) {
  const id = String(role || '').trim()
  const base = {
    role: id, show: false, gapMinutes: null, gapText: '', seenAt: '', seenChannel: '',
    channel: String(channel || ''), big: [], mid: [], small: [], sources: [], text: '', skipped: '',
  }
  if (!id) return { ...base, skipped: '没有角色' }
  const seen = lastSeenOf(id)
  if (!seen.at) return { ...base, skipped: '还不知道你上回是什么时候醒的（presence 都没有）' }
  const gapMinutes = Math.round((now - seen.at) / 60000)
  const mark = readJson(MARK_FILE(id), null)
  const sameWindow = Boolean(mark && seen.atISO && String(mark.seenAt || '') === seen.atISO)
  const fresh = Boolean(mark && ms(mark.at) && now - ms(mark.at) < WAKE_GAP_MIN * 60000)
  // 通道变了也算醒（从 QQ 回到工作台）：但 hub 是内部写盘，不算。
  const switched = Boolean(seen.channel && channel && channel !== 'hub' && seen.channel !== channel)
  const resumed = switched && gapMinutes < WAKE_GAP_MIN
  const woke = gapMinutes >= WAKE_GAP_MIN || switched
  if (!woke) return { ...base, gapMinutes, seenAt: seen.atISO, seenChannel: seen.channel, skipped: `才隔 ${gapMinutes} 分钟，不算醒` }
  if (sameWindow) return { ...base, gapMinutes, seenAt: seen.atISO, seenChannel: seen.channel, skipped: '这段对话已经说过一次' }
  if (fresh) return { ...base, gapMinutes, seenAt: seen.atISO, seenChannel: seen.channel, skipped: '刚说过' }

  const sources = []
  const push = (arr, item) => { if (item?.text && !arr.some((x) => x.text === item.text)) { arr.push(item); if (item.from) sources.push(item.from) } }

  const sinceMs = switched && gapMinutes < WAKE_GAP_MIN ? 0 : seen.at
  // 被打断：换通道且间隔很短，先告诉她刚才在做什么，而不是只报时间。
  const interruptedDoing = resumed
    ? (() => { try { return (readAgenda(id).items || []).find((i) => String(i.state) === 'doing') || null } catch { return null } })()
    : null
  const big = []
  // 顺序按「她多需要接」排：有人叫她（QQ / B站 / 内部群）> 派给她的活 > 没结的事故 > 承诺到期 > 她约的事到点 > 这边找过她
  for (const item of [...bigFromQQ(sinceMs), ...bigFromBili(sinceMs), ...bigFromGroups(id, sinceMs), ...bigFromJobs(id), ...bigFromIncidents(), ...bigFromPromises(id, now), ...bigFromWaiting(id, now), ...bigFromDesk(sinceMs)]) {
    push(big, item)
    if (big.length >= BIG_CAP) break
  }

  const mid = []
  const small = []
  const events = todaysEvents(now)
  const exam = events['体检']
  if (exam && ms(exam.at) >= sinceMs) {
    const head = String(exam.head || '')
    if (/缺口|不通过|失败/.test(head)) push(mid, { text: `体检没过：${clip(head, 30)}`, from: 'library/手抄本/事件' })
    else push(small, { text: '体检通过了', from: 'library/手抄本/事件' })
  }
  const mnt = maintenanceOf(now)
  if (mnt && mnt.at >= sinceMs) {
    if (!mnt.ok) push(mid, { text: `维护有步骤失败：${mnt.failed.slice(0, 3).join('、') || '有一步没过'}`, from: 'runtime/maintenance-last.json' })
    else push(small, { text: '备份维护跑过了', from: 'runtime/maintenance-last.json' })
  }
  try {
    const items = readAgenda(id).items || []
    const doing = items.filter((i) => String(i.state) === 'doing')
    if (doing.length) push(mid, { text: `你自己排的有 ${doing.length} 件在动`, from: `runtime/${id}/agenda.json` })
    // 上一轮/这一段刚结的：带一句，别让她只看到“没做完”。
    const doneFrom = sinceMs || (now - 24 * 3600 * 1000)
    const done = items.filter((i) => String(i.state) === 'done' && (Date.parse(i.doneAt || i.updatedAt || '') || 0) >= doneFrom)
      // 同一条会话连续上下文里，她下一轮本来就知道结果；不再重复“你刚做完”。
      .filter((i) => !sessionId || String(i.doneBy || '') !== String(sessionId || ''))
      .slice(-2)
    if (done.length) push(small, { text: `你刚做完：${done.map((i) => clip(i.what, 24)).join('、')}`, from: `runtime/${id}/agenda.json` })
  } catch { /* 读不到就算了 */ }
  // 未闭合承诺：只提一次；提过就 markNotified，不每轮催。
  try {
    const loops = listLoops(id, { status: 'open', now }).filter((l) => !l.notifiedAt).slice(0, 1)
    for (const l of loops) {
      push(l.overdue ? mid : small, {
        text: `你之前说要做「${clip(l.what, 34)}」，还没看到落地；做/不做/改期，你定。`,
        from: `library/meta/open-loops-${id}.jsonl`,
      })
      if (consume) markNotified(id, l.id, { now })
    }
  } catch { /* 读不到就算了 */ }
  const hb = events['心跳']
  if (hb && Number(hb.count) > 0) push(small, { text: `心跳 ${Number(hb.count)} 次`, from: 'library/手抄本/事件' })
  try {
    const u = unreadFor(id, { channel: 'qq' })
    const n = Math.max(0, Number(u?.total || 0) - Number(u?.from || 0))
    if (n > 0) push(small, { text: `收件箱 ${n} 条没看`, from: 'inbox/qq' })
  } catch { /* 读不到就不报 */ }
  // 2026-11-13 老板：「这中间发生了什么」也包括她自己经历过的——记忆里这中间新增了几条。
  try {
    const n = countMemoriesSince(id, sinceMs)
    if (n > 0) push(small, { text: `这中间记了 ${n} 条经历`, from: 'soul/memory（记忆库）' })
  } catch { /* 读不到就不报 */ }
  // 2026-11-10 老板：「回了之后要她醒了能知道」——你睡着时我替你代发了谁。
  try {
    const relays = relaysSince(id, { sinceMs })
    if (relays.length) {
      const last = relays[relays.length - 1]
      push(small, { text: `你睡着时我替你回了 ${relays.length} 句（最近：${clip(last.who || '有人', 8)}）`, from: `runtime/${id}/代传话.jsonl` })
    }
  } catch { /* 读不到就不报 */ }
  // 2026-11-11（闭环 P3+P4）：**借了几本、几本用上了**。
  // 只有她真的去查才算借（recall-log）；每轮摊在桌上的注入不算——口径在 lib/borrow.js 文件头。
  try {
    const b = borrowStats(id, { sinceMs })
    if (Number(b.count) > 0) {
      push(small, { text: `最近借了 ${b.count} 本${b.used > 0 ? `（${b.used} 条用上了）` : ''}`, from: 'library/检索记录' })
    }
  } catch { /* 读不到就不报 */ }

  // 有人找她、她没回：哪几条、谁的、为什么——单独一段，别混进"这中间"。
  const unanswered = (() => { try { return unansweredOf(id, { sinceMs, now }) } catch { return { total: 0, items: [], whyNot: '' } } })()

  const result = {
    ...base,
    show: true,
    gapMinutes,
    gapText: resumed
      ? (interruptedDoing
        ? `${nowTextOf(now)}你刚才在做「${clip(interruptedDoing.what, 28)}」。`
        : `${nowTextOf(now)}接着刚才（${Math.max(0, gapMinutes)} 分钟前）。`)
      : `${nowTextOf(now)}${gapTextOf(gapMinutes)}`,
    seenAt: seen.atISO,
    seenChannel: seen.channel,
    big: big.slice(0, BIG_CAP),
    mid,
    small,
    unanswered,
    sources: [...new Set(sources)],
  }
  result.text = renderWake(result)
  if (consume && result.text) commitWake(id, result, { now, channel })
  return result
}

/**
 * 记一笔「这段醒来已经说过了」。**投递成功之后**再调，别在生成时就记。
 * 为什么：先记后送，一旦投递失败（会话不在/宿主刚关），wake-mark 会把同一段 seenAt
 * 判成"说过了"，她就再也听不到这一觉发生了什么——静默丢一段，比重复一次糟得多。
 * @returns {boolean} 记上了没有（记不上最多下次重复一次，不影响别的）
 */
export function commitWake(role, wake, { now = Date.now(), channel = '' } = {}) {
  const id = String(role || '').trim()
  if (!id) return false
  try {
    writeJson(MARK_FILE(id), {
      at: new Date(now).toISOString(),
      seenAt: String(wake?.seenAt || ''),
      channel: String(channel || ''),
    })
    return true
  } catch { return false }
}

/**
 * 把 wakeBrief 的结果压成一段（≤200 字）。
 * 行1：距上次多久；行2：这中间的大事/中事；行3：小事合并一句；
 * 行4-5：有人找你、你没回 + 「要不要回？你定」。
 */
export function renderWake(wake) {
  if (!wake?.show) return ''
  const gap = String(wake.gapText || '')
  const bigMid = [...(wake.big || []), ...(wake.mid || [])].map((x) => String(x?.text || '')).filter(Boolean)
  const small = (wake.small || []).map((x) => String(x?.text || '')).filter(Boolean)
  const un = wake.unanswered && Number(wake.unanswered.total) > 0 && Array.isArray(wake.unanswered.items)
    ? wake.unanswered.items.map((x) => String(x?.text || '')).filter(Boolean)
    : []

  // 先长出完整的一段，再按上限往回削（削的顺序：小事 → 有人找你 → 中/大事的最后一条），保证不超字。
  const build = (midItems, smallItems, unItems) => {
    const lines = []
    if (gap) lines.push(gap)
    if (midItems.length) lines.push(`这中间：${midItems.join('；')}。`)
    else if (!smallItems.length && !unItems.length) lines.push('这中间没什么事。')
    if (smallItems.length) lines.push(`别的没什么：${smallItems.join('、')}。`)
    if (unItems.length) {
      lines.push(`有人找你，你没回（${wake.unanswered.total} 条）：${unItems.join('；')}。`)
      lines.push('要不要回？回一条也行；不回也行，你定。')
    }
    return lines.join('\n')
  }

  let midItems = [...bigMid]
  let smallItems = [...small]
  let unItems = [...un]
  let text = build(midItems, smallItems, unItems)
  while (text.length > WAKE_MAX_CHARS && smallItems.length) {
    smallItems = smallItems.slice(0, -1)
    text = build(midItems, smallItems, unItems)
  }
  while (text.length > WAKE_MAX_CHARS && unItems.length > 1) {
    unItems = unItems.slice(0, -1)
    text = build(midItems, smallItems, unItems)
  }
  while (text.length > WAKE_MAX_CHARS && midItems.length > 1) {
    midItems = midItems.slice(0, -1)
    text = build(midItems, smallItems, unItems)
  }
  if (text.length > WAKE_MAX_CHARS) text = `${text.slice(0, WAKE_MAX_CHARS - 1)}…`
  return text
}

// 2026-11-10 主代理（整合）：删掉没人接的 wakeSources 导出（回归「没有没人接又没写理由的导出」点了名）。
// 调试要"这段从哪几个文件读的"，直接用 wakeBrief(role,{consume:false}).sources —— 同一个数，不用第二个出口。

