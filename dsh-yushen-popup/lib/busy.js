// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
// 改｜2026-11-02 23:20｜大鱼·子会话（工作台；父会话 session-bef06908 委派）｜授权：老板（本次任务书：桌宠右键能看到所有后台运行的任务，方便判断该不该重启）｜lib/busy.js:1-330｜新增：busySnapshot() / busyText()——把「本会话 / 子代理 / QQ 桥 / 定时任务 / 后台作业」五件事拼成一句句大白话，最后一行直接回答能不能重启；只读，不落任何文件｜为什么：老板重启前只能靠猜，桌宠身上没有任何地方能看到"现在到底有什么在跑"｜验证：node scripts/test-busy.mjs 三种状态全过（全闲/子代理在跑/桥在回消息），跑完临时家里一个文件没动；node scripts/regression.mjs 全绿｜可改：可改（加一条来源要同时改 test-busy.mjs 的断言）
// 「现在在忙什么」——桌宠右键弹的那个面板，数据都在这儿拼。
//
// 为什么要它（2026-11-02 老板）：「再加一个桌宠右键点击能看到所有后台运行的任务，
// 方便我知道应不应该重启，要显示大白话。」
//
// 三条规矩（照任务书）：
//   1. **只读**：这里只读文件、只数事件，绝不写任何状态（连缓存文件都不落）；
//   2. **不新造状态**：数据全部来自已有的东西——会话事件（lib/watch.js 的内存表）、
//      桥的 lock + 活动日志、宿主的 schedule.json、当天的事件账本；
//   3. **拿不到就写"看不到"**：不猜、不拿"看起来正常"冒充"没事"。
//      每一条都带 `known` 字段：false = 这一条没读到，面板上要画成灰的问号。
//
// 返回形状（给前端和测试用，稳定）：
//   {
//     at: ISO 时间,
//     items: [ { kind, what, busy, known, since?, hint?, detail? }, … , { kind:'建议', … } ],
//     verdict: { canRestart: boolean, text: '大白话结论' }
//   }
// `items` 最后那条「建议」就是底部那行结论（面板渲染时会跳过它，单独画在底部）。
import fs from 'node:fs'
import path from 'node:path'
import { dshHome, qqBridgeState } from './paths.js'
import { liveSessions, sourceOf } from './watch.js'

// 「在忙」的窗口：跟桌宠气泡（client.js 的 pollLiveNow）同一个口径，3 分钟。
const BUSY_WINDOW_MS = 3 * 60 * 1000
// 一轮结束后宿主会发 turn/end；最后一条是它，就说明这轮已经跑完了，不算忙。
const IDLE_TYPES = new Set(['turn/end', 'session/idle', 'session/end'])

const pad2 = (n) => String(n).padStart(2, '0')
const hhmm = (ms) => {
  const d = new Date(Number(ms) || Date.now())
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** 多久以前：给大白话用（"3 分钟前"、"2 小时前"）。 */
function agoText(ms, now) {
  const diff = Math.max(0, now - Number(ms || 0))
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

/** 相对今天说时间：今天 22:30 / 明天 08:00 / 后天 09:00。 */
function whenText(ms, now) {
  const d = new Date(Number(ms))
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date(now)
  const dk = (x) => `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const off = Math.round((day - base) / 86400000)
  const clock = hhmm(d.getTime())
  if (off === 0) return `今天 ${clock}`
  if (off === 1) return `明天 ${clock}`
  if (off === 2) return `后天 ${clock}`
  if (off === -1) return `昨天 ${clock}`
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${clock}`
}

/** 标题能不能直接给老板看：像 uuid / session-xxxx 的就不给（面板里不许出现技术 id）。 */
function humanTitle(row) {
  const raw = String(row?.title || '').trim()
  const bad = !raw
    || /^session-?/i.test(raw)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw)
    || /^[0-9a-f]{12,}$/i.test(raw)
  if (bad) {
    const src = String(row?.source || '').trim()
    return src && src !== '本机会话' ? src : '没起名字的一单'
  }
  // 标题尾巴上挂着的 uuid 剪掉（有过 "改记忆 a1b2c3d4" 这种）
  return raw.replace(/\s*[0-9a-f]{8}-[0-9a-f-]{8,}$/i, '').slice(0, 18)
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

// ── ① 会话 / 子代理：lib/watch.js 的内存表（跟 yushen_live 同源） ──────────────
// 内存表是**进程内**的：插件刚重启那几分钟它是空的，面板就会显示"闲着"——
// 那是"看起来正常、其实不知道"，比报错还坏。所以内存里没有的，回落到当天的事件账本
// （~/.dsh/dayu/events/YYYY-MM-DD.jsonl，本来就在记，不是新造状态）。
const TAIL_BYTES = 400 * 1024

function liveFromLedger(home, now) {
  const file = path.join(home, 'dayu', 'events', `${dayKey(new Date(now))}.jsonl`)
  let text = ''
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const size = fs.fstatSync(fd).size
      const start = Math.max(0, size - TAIL_BYTES)
      const buf = Buffer.alloc(Math.min(size, TAIL_BYTES))
      fs.readSync(fd, buf, 0, buf.length, start)
      text = buf.toString('utf8')
      // 从中间切进去的第一行可能是半截，丢掉
      if (start > 0) text = text.slice(text.indexOf('\n') + 1)
    } finally { fs.closeSync(fd) }
  } catch { return null }

  const byId = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line || !line.includes('"id"')) continue
    let row = null
    try { row = JSON.parse(line) } catch { continue }
    const id = String(row?.id || '')
    if (!id) continue
    const prev = byId.get(id)
    const at = String(row.at || '')
    if (prev && prev.lastAt > at) continue
    byId.set(id, { id, title: String(row.title || prev?.title || ''), lastAt: at, lastType: String(row.type || ''), cwd: String(row.cwd || prev?.cwd || ''), parentId: prev?.parentId || '' })
  }
  return [...byId.values()].map((row) => ({ ...row, source: sourceOf(row), reason: '' }))
}

function safeLive(home, now) {
  let mem = null
  try { mem = liveSessions(60) } catch { mem = null }
  const ledger = liveFromLedger(home, now)
  if (mem == null && ledger == null) return null
  if (!mem || !ledger) return mem || ledger
  const byId = new Map()
  for (const row of ledger) byId.set(String(row.id), row)
  for (const row of mem) {
    const old = byId.get(String(row.id))
    // 内存里的更新（也有 parentId 反推）；账本里只有事件，谁新听谁的
    byId.set(String(row.id), old && String(old.lastAt) > String(row.lastAt) ? { ...row, ...old, parentId: row.parentId || old.parentId } : { ...old, ...row })
  }
  return [...byId.values()]
}

function sessionRows(live, now) {
  if (!Array.isArray(live)) {
    return {
      known: false,
      main: [],
      subs: [],
      why: '宿主还没上报会话事件（插件刚起来，或者这一版不给这个事件）',
    }
  }
  const busy = live.filter((row) => {
    const at = Date.parse(String(row?.lastAt || ''))
    if (!Number.isFinite(at)) return false
    if (now - at > BUSY_WINDOW_MS) return false
    if (IDLE_TYPES.has(String(row?.lastType || ''))) return false
    return true
  })
  const isSub = (row) => Boolean(row?.parentId) || String(row?.id || '').startsWith('dayu-job-')
  return {
    known: true,
    main: busy.filter((row) => !isSub(row)),
    subs: busy.filter(isSub),
    why: '',
  }
}

function mainItem(rows, known, why, now) {
  if (!known) {
    return { kind: '本会话', what: '看不到：' + why, busy: false, known: false }
  }
  if (!rows.length) {
    return { kind: '本会话', what: '闲着（这一页没有正在跑的一轮）', busy: false, known: true }
  }
  const first = rows[0]
  const at = Date.parse(String(first.lastAt || ''))
  // 2026-11-02 老板：要能直接看出「哪一个会话在干什么」，不是一个数字。
  const names = [...new Set(rows.map((r) => {
    const doing = String(r.lastText || '').replace(/\s+/g, ' ').trim().slice(0, 18)
    return doing ? `${humanTitle(r)}（${doing}…）` : humanTitle(r)
  }))].slice(0, 3)
  const what = rows.length === 1
    ? `${names[0]}：正在跑（这轮跑完就闲了）`
    : `${rows.length} 条会话在跑：${names.join('、')}${rows.length > names.length ? ' 等' : ''}`
  return {
    kind: '本会话',
    what,
    busy: true,
    known: true,
    since: Number.isFinite(at) ? hhmm(at) : '',
    hint: '这轮跑完就闲了',
  }
}

function subItem(rows, known, why) {
  if (!known) {
    return { kind: '子代理', what: '看不到：' + why, busy: false, known: false, count: 0 }
  }
  const count = rows.length
  if (!count) return { kind: '子代理', what: '没有在跑的', busy: false, known: true, count: 0 }
  const names = [...new Set(rows.map(humanTitle))].slice(0, 3)
  const more = rows.length > names.length ? ` 等 ${rows.length} 个` : ''
  return {
    kind: '子代理',
    what: `${count} 个在干活：${names.join('、')}${more}`,
    busy: true,
    known: true,
    count,
  }
}

// ── ② QQ 桥：state/bridge.lock（PID）+ state/qq-activity.log 的最后一行 ────────
function bridgeItem(stateDir, now) {
  const dir = String(stateDir || '')
  if (!dir || !fs.existsSync(dir)) {
    return { kind: 'QQ 桥', what: '看不到（没找到桥的状态目录）', busy: false, known: false }
  }

  // 活着没有：lock 里是 PID，文件 mtime 是它启动的时刻
  let alive = null
  let startedAt = 0
  const lock = path.join(dir, 'bridge.lock')
  try {
    const text = fs.readFileSync(lock, 'utf8').trim()
    startedAt = fs.statSync(lock).mtimeMs
    const pid = Number(text)
    if (Number.isFinite(pid) && pid > 0) {
      try { process.kill(pid, 0); alive = true } catch { alive = false }
    }
  } catch { alive = null }

  // 最近动静：qq-activity.log 里最后一条带 [HH:MM:SS] 的行；不带 [reserved2] 的那条是她真往外发的
  let lastAny = 0
  let lastSend = 0
  try {
    const file = path.join(dir, 'qq-activity.log')
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/).filter(Boolean).slice(-80)
    for (const line of lines) {
      const m = /^\[(\d{2}):(\d{2}):(\d{2})\]/.exec(line)
      if (!m) continue
      const d = new Date(now)
      d.setHours(Number(m[1]), Number(m[2]), Number(m[3]), 0)
      let at = d.getTime()
      if (at > now + 60 * 1000) at -= 86400000 // 跨零点的日志
      if (at > lastAny) lastAny = at
      if (!line.includes('[reserved2]') && at > lastSend) lastSend = at
    }
  } catch { /* 没活动日志就只知道它活着 */ }

  const fresh = (t) => t > 0 && now - t <= BUSY_WINDOW_MS
  if (alive === false) {
    return {
      kind: 'QQ 桥',
      what: lastAny ? `没在跑（上次有动静是 ${agoText(lastAny, now)}）` : '没在跑（进程已经不在了）',
      busy: false,
      known: true,
      since: startedAt ? hhmm(startedAt) : '',
      hint: '重启不动它',
    }
  }
  if (alive === null) {
    return { kind: 'QQ 桥', what: '看不到（读不到桥的 lock）', busy: false, known: false }
  }
  if (fresh(lastSend)) {
    return {
      kind: 'QQ 桥',
      what: `活着，${agoText(lastSend, now)}刚回过群消息`,
      busy: true,
      known: true,
      since: hhmm(startedAt),
      hint: '别在它说话的时候重启',
    }
  }
  if (fresh(lastAny)) {
    return {
      kind: 'QQ 桥',
      what: `活着，${agoText(lastAny, now)}群里有人说话（它还没回）`,
      busy: false,
      known: true,
      since: hhmm(startedAt),
    }
  }
  return {
    kind: 'QQ 桥',
    what: lastSend
      ? `活着，最近一次回群是 ${agoText(lastSend, now)}`
      : (lastAny ? `活着，最近有动静是 ${agoText(lastAny, now)}` : '活着，这边一时没人说话'),
    busy: false,
    known: true,
    since: startedAt ? hhmm(startedAt) : '',
  }
}

// ── ③ 定时任务：宿主自己算好的 ~/.dsh/storages/schedule.json ──────────────────
function scheduleItem(home, now) {
  const file = path.join(home, 'storages', 'schedule.json')
  if (!fs.existsSync(file)) {
    return { kind: '定时任务', what: '看不到（宿主没把定时任务写到磁盘上）', busy: false, known: false }
  }
  const raw = readJson(file)
  const tasks = raw?.tables?.tasks
  if (!tasks || typeof tasks !== 'object') {
    return { kind: '定时任务', what: '看不到（定时任务表读不出来）', busy: false, known: false }
  }
  const active = []
  for (const entry of Object.values(tasks)) {
    if (String(entry?.status || '') !== 'active') continue
    const rec = entry?.record || {}
    const at = Date.parse(String(rec.scheduledAt || ''))
    active.push({ title: String(rec.title || '').trim() || '没起名字的一件', at: Number.isFinite(at) ? at : 0 })
  }
  if (!active.length) return { kind: '定时任务', what: '没有排着的', busy: false, known: true }
  active.sort((a, b) => (a.at || Infinity) - (b.at || Infinity))
  const next = active[0]
  return {
    kind: '定时任务',
    what: next.at
      ? `下一次：${whenText(next.at, now)}「${next.title}」`
      : `排着 ${active.length} 件，但下一次是几时说不好`,
    busy: false,
    known: true,
    detail: active.length > 1 ? `还有 ${active.length - 1} 件排在后面` : '',
  }
}

// ── ④ 后台作业：当天事件账本里的 job/registered 与 job/settled ────────────────
// 说明：宿主不把作业清单落盘（job_list 只在进程内存里），能读到的只有事件账本里
// 登记/收尾这两条。所以这里只说"账上还差几个没结"，不假装知道它们在干什么。
function jobItem(home, now) {
  // 2026-11-02 老板：「后台还有两个，是哪两个我都不知道重要不重要」——
  // 原来按字符串包含计数（job/registered 会命中正文），把 31 条数成 2549 条，报出假的「2 个没见收尾」。
  // 现在按 JSON 的 type 精确配对，并且：说不清名字的，一个字都不显示。
  const file = path.join(home, 'dayu', 'events', `${dayKey(new Date(now))}.jsonl`)
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch {
    return { kind: '后台作业', what: '没有', busy: false, known: true, count: 0 }
  }
  const open = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.indexOf('job/') < 0) continue
    let e = null
    try { e = JSON.parse(line) } catch { continue }
    const type = String(e?.type || e?.data?.type || '')
    if (type !== 'job/registered' && type !== 'job/settled') continue
    const d = e.data || e
    const id = String(d.id || d.jobId || '')
    if (!id) continue
    // session-* 的作业就是「本会话」那条，不重复列
    if (type === 'job/registered') {
      if (id.startsWith('session-')) continue
      const ttl = String(d.title || d.label || d.brief || '').trim()
      open.set(id, ttl || '一个派出去的活（没起名）')
    }
    else open.delete(id)
  }
  if (!open.size) return { kind: '后台作业', what: '没有（今天开过的都收尾了）', busy: false, known: true, count: 0 }
  const names = [...open.entries()].slice(0, 2).map(([id, title]) => title || id.slice(0, 8))
  return {
    kind: '后台作业',
    what: `还有 ${open.size} 个没结：${names.join('、')}`,
    busy: true,
    known: true,
    count: open.size,
    detail: open.size > 2 ? `另外 ${open.size - 2} 个没名字` : '',
  }
}

/** 底部那行大白话结论：先看她是不是正在说话，再看桥，最后才轮到能不能重启。 */
function conclusion({ main, bridge, subs, jobs }) {
  if (main?.busy) {
    return { canRestart: false, text: '先别重启：你正跟她说话，这一轮还没跑完' }
  }
  if (bridge?.busy) {
    return { canRestart: false, text: '先别重启：桥正在回消息，重启会让她说到一半断掉' }
  }
  if (subs?.busy) {
    return { canRestart: true, text: `现在可以重启：只有 ${subs.count} 个子代理在跑，重启会打断它们` }
  }
  if (jobs?.busy) {
    return { canRestart: true, text: `现在可以重启：只有 ${jobs.count} 个后台作业开着，重启会把它们打断` }
  }
  return { canRestart: true, text: '现在可以重启：手头没事，重启只是把这一页刷新一下' }
}

/**
 * 现在在忙什么（只读）。
 * @param {object} [opts]
 * @param {number} [opts.now]         当前时刻（测试用）
 * @param {string} [opts.home]        DSH 家目录（默认 dshHome()）
 * @param {Array}  [opts.live]        会话行（默认 liveSessions(60)；传 null 表示"读不到"）
 * @param {string} [opts.bridgeState] 桥的状态目录（默认 qqBridgeState()）
 */
export function busySnapshot(opts = {}) {
  const now = Number(opts.now) || Date.now()
  const home = String(opts.home || dshHome())
  const live = Object.prototype.hasOwnProperty.call(opts, 'live') ? opts.live : safeLive(home, now)
  const bridgeState = Object.prototype.hasOwnProperty.call(opts, 'bridgeState') ? opts.bridgeState : qqBridgeState()

  const rows = sessionRows(live, now)
  const main = mainItem(rows.main, rows.known, rows.why, now)
  const subs = subItem(rows.subs, rows.known, rows.why)
  const bridge = bridgeItem(bridgeState, now)
  const schedule = scheduleItem(home, now)
  const jobs = jobItem(home, now)

  // 2026-11-02 老板：「后台还有两个，是哪两个我都不知道」——作业和子代理其实是同一件事的两条来源，
  // 分两行只会让人猜。这里合并：子代理那行没数据、但作业账上有，就用作业那边的话顶上；不再单列「后台作业」。
  const subsMerged = (subs && (subs.count || subs.busy))
    ? subs
    : (jobs && jobs.busy
      ? { kind: '子代理', what: String(jobs.what).replace(/^还有s*/, ''), busy: true, known: true, count: jobs.count || 1, detail: jobs.detail || '' }
      : subs)
  const verdict = conclusion({ main, bridge, subs: subsMerged, jobs: { busy: false } })
  const items = [
    main,
    subsMerged,
    bridge,
    schedule,
    { kind: '建议', what: verdict.text, busy: verdict.canRestart, known: true },
  ]
  return { at: new Date(now).toISOString(), items, verdict }
}

/** 把快照拍成一段纯文字（面板上「复制」拷走的就是它）。 */
export function busyText(snap) {
  const s = snap && Array.isArray(snap.items) ? snap : busySnapshot()
  const dot = (it) => (it?.known === false ? '⚠️' : (it?.busy ? '🔴' : '⚪'))
  const lines = s.items
    .filter((it) => it.kind !== '建议')
    .map((it) => `${dot(it)} ${it.kind}：${it.what}`)
  lines.push('', s.verdict.text)
  return lines.join('\n')
}

export const __test__ = { BUSY_WINDOW_MS, whenText, agoText, humanTitle }
