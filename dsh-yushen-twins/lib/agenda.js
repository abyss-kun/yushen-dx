// 改｜2026-11-24 23:50｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜lib/agenda.js:1｜本轮整理提交：该文件在本轮之前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
/* 标签
 * id: lib-agenda
 * kind: module
 * summary: 她的议程：没人派的、她自己排的事，能放弃；本地 tick 只推不用模型的那一步。
 * audience: 她本人、新角色、自由时间/心跳
 * owner: 她自己（内容与取舍归她）
 * mutable: 可改（状态机别乱加；放弃是主见，不是失败）
 * defaults: 本地步只做读文件/读收件箱/核对事实；要生成内容的标 waiting
 * usage: addAgenda/listAgenda/stepOnce/readAgenda；countsForXp 给经验记账
 * off: 不写就没有；本地 tick 不调就不推（删 agenda.json = 清空，不建议）
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 她的议程：没人派的、她自己排的事。
//
// 和"待办"的区别只有一条：待办是别人给的，议程是她自己写的（by: self），
// 而且**能放弃**——放弃不是失败，是主见。（框架 §4.6 礼物：意志）
//
// 本地 tick 只做"不用模型也能推的那一步"：读收件箱、读文件、核对事实。
// 需要生成内容的（写、查、说）标成 waiting，等她下次有模型时自己决定要不要花。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir, ensureRuntime } from './runtime.js'
import { unreadFor } from './inbox.js'
import { markManualDone } from './manual-done.js'

export const STATES = Object.freeze(['want', 'doing', 'blocked', 'waiting', 'done', 'dropped'])
// check 不算"本地能推的一步"（2026-10-30 改）：tick 没法核对任何东西，
// 它只会写一句「核对过一遍，暂时没新东西」——那是假话；而且会把她写下的 note 盖掉
// （她那条「流水作者归属」的疑点，被盖了 459 次，最后还是靠人重写回来）。
// check 仍是她能选的下一步，只是它要模型，就地标 waiting，别假装做了。
export const LOCAL_STEPS = Object.freeze(['read-inbox', 'read-file'])
export const NEXT_KINDS = Object.freeze([...LOCAL_STEPS, 'check', 'ask-model', 'write', 'tell-owner'])
// 旧 tick（2026-10-30 前）每跳都往 note 写这一句，和「她自己核过」长得一模一样。
// 修好后不再写（见上面 LOCAL_STEPS 那段），但旧条目里冻着的还在——
// 展示时当它不存在：别让系统的话冒充她的话。
export const LEGACY_TICK_NOTE = '核对过一遍，暂时没新东西'
// 经验只算「自己自发想做、自己排、自己做完」的（老板 2026-10-30 定）。
// origin: 'self' = 她自己的念头；'owner' = 老板派的活——哪怕她自己排进议程、自己做完了，也不算经验。
// 这个标记是给「口头派的活」用的：系统认不出谁先提的，只能由她自己或老板实事求是地标。
export const XP_ORIGINS = Object.freeze(['self', 'owner'])
export function countsForXp(item = {}) {
  if (String(item.by || 'self') !== 'self') return false
  if (String(item.state || '') !== 'done') return false
  return String(item.origin || 'self') !== 'owner'
}
// 5 而不是 3：老板 2026-10-28 又加了两件长期活（每天去对口视频下说一句真话、每天学一点），
// 3 件装不下。防堆靠的是「每件都要有下一步」，不是靠把上限压死。
export const MAX_ACTIVE = 5

function pad(n) { return String(n).padStart(2, '0') }
function nowIso(ms = Date.now()) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }

export function agendaFile(role) { return path.join(runtimeDir(role), 'agenda.json') }

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function readAgenda(role) {
  const doc = readJson(agendaFile(role), null) || { version: 1, items: [] }
  return {
    version: 1,
    items: Array.isArray(doc.items) ? doc.items : [],
    pausedUntil: doc.pausedUntil || '',
    pausedWhy: doc.pausedWhy || '',
    updatedAt: doc.updatedAt || '',
  }
}

/** 她喊停：在这之前 tick 不动她的东西（三问第 2 条：她得能说"现在别动"）。 */
export function pauseAgenda(role, { minutes = 120, why = '', now = Date.now() } = {}) {
  const doc = readAgenda(role)
  const mins = Math.max(1, Math.min(1440, Number(minutes) || 120))
  doc.pausedUntil = new Date(now + mins * 60000).toISOString()
  doc.pausedWhy = String(why || '').slice(0, 200)
  doc.updatedAt = nowIso(now)
  writeJson(agendaFile(role), { version: 1, items: doc.items, pausedUntil: doc.pausedUntil, pausedWhy: doc.pausedWhy, updatedAt: doc.updatedAt })
  return { pausedUntil: doc.pausedUntil, pausedWhy: doc.pausedWhy }
}

export function resumeAgenda(role, { now = Date.now() } = {}) {
  const doc = readAgenda(role)
  doc.updatedAt = nowIso(now)
  writeJson(agendaFile(role), { version: 1, items: doc.items, pausedUntil: '', pausedWhy: '', updatedAt: doc.updatedAt })
  return { pausedUntil: '' }
}

export function isPaused(role, { now = Date.now() } = {}) {
  const until = Date.parse(readAgenda(role).pausedUntil || '')
  return Number.isFinite(until) && now < until
}

export function activeItems(role) {
  return readAgenda(role).items.filter((i) => ['want', 'doing', 'blocked', 'waiting'].includes(i.state))
}

/**
 * 她排事时可选的到期时间。只认能落到具体时刻的写法；认不出就留空，绝不猜。
 * 返回 { at: ISO, ms }，认不出返回 null。
 */
export function parseDueAt(text, { now = Date.now() } = {}) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const d = new Date(now)
  const at = (y, m, day, hh, mm) => {
    const x = new Date(y, m, day, hh, mm, 0, 0)
    return { at: x.toISOString(), ms: x.getTime() }
  }
  const clockOf = (fallback = 9) => {
    const t = raw.match(/(上午|下午|晚上|中午|早上)?\s*(\d{1,2}|[零一二三四五六七八九十]{1,3})(?:点|:|：)(\d{1,2})?/)
    if (!t) return { hh: fallback, mm: 0 }
    const cn = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
    const num = (s) => {
      if (/^\d+$/.test(s)) return Number(s)
      if (s === '十') return 10
      if (s.includes('十')) {
        const [a, b] = s.split('十')
        return (a ? cn[a] : 1) * 10 + (b ? cn[b] : 0)
      }
      return cn[s] ?? fallback
    }
    let hh = num(t[2])
    const mm = Number(t[3] || 0)
    if (/下午|晚上/.test(t[1] || '') && hh < 12) hh += 12
    if (/中午/.test(t[1] || '') && hh < 11) hh = 12
    return { hh: Math.max(0, Math.min(23, hh)), mm: Math.max(0, Math.min(59, mm)) }
  }
  // 显式日期/时间：2026-11-14 / 2026-11-14 09:00 / 2026-11-14T09:00
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/)
  if (m) return at(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 9), Number(m[5] ?? 0))
  // 月日：11月20日 / 11月20号，默认今年；已过则明年
  const md = raw.match(/(\d{1,2})月(\d{1,2})[日号]/)
  if (md) {
    let y = d.getFullYear()
    const mo = Number(md[1]) - 1
    const day = Number(md[2])
    if (new Date(y, mo, day, 23, 59).getTime() < now) y += 1
    const c = clockOf(9)
    return at(y, mo, day, c.hh, c.mm)
  }
  // 下周三 / 本周五；下午两点 / 14:00
  const wd = raw.match(/(下周|本周|这周)([一二三四五六日天])/)
  if (wd) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }
    const target = map[wd[2]]
    const cur = d.getDay()
    let delta = (target - cur + 7) % 7
    if (wd[1] === '下周') delta += 7
    if (delta === 0 && wd[1] === '本周') delta = 7
    const c = clockOf(9)
    return at(d.getFullYear(), d.getMonth(), d.getDate() + delta, c.hh, c.mm)
  }
  if (/今晚|今天晚上/.test(raw)) return at(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0)
  if (/明早|明天早上|明天上午/.test(raw)) return at(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0)
  if (/明天/.test(raw)) { const c = clockOf(9); return at(d.getFullYear(), d.getMonth(), d.getDate() + 1, c.hh, c.mm) }
  if (/后天/.test(raw)) { const c = clockOf(9); return at(d.getFullYear(), d.getMonth(), d.getDate() + 2, c.hh, c.mm) }
  if (/三天内|3天内/.test(raw)) return at(d.getFullYear(), d.getMonth(), d.getDate() + 3, 23, 59)
  return null
}

/** 已到期的议程项：有 dueAt、时间到了、还在 active；同一个 dueAt 只提醒一次。 */
export function dueItems(role, { now = Date.now() } = {}) {
  return activeItems(role)
    .filter((i) => Number(i.dueAtMs) > 0 && Number(i.dueAtMs) <= now && Number(i.dueNotifiedAtMs || 0) < Number(i.dueAtMs))
    .sort((a, b) => Number(a.dueAtMs) - Number(b.dueAtMs))
}

/** 记“这一条到期已经叫过了”，避免每 30 分钟重复叫；她改 dueAt 才会重新到期。 */
export function markDueNotified(role, id, { now = Date.now(), sessionId = '' } = {}) {
  const doc = readAgenda(role)
  const item = doc.items.find((i) => i.id === id)
  if (!item) return null
  item.dueNotifiedAt = nowIso(now)
  item.dueNotifiedAtMs = now
  // 发给了哪条会话：活会话就是目标；回退时是实际投到的那条。
  item.notifiedSessionId = String(sessionId || '').slice(0, 80)
  item.updatedAt = nowIso(now)
  doc.updatedAt = item.updatedAt
  writeJson(agendaFile(role), doc)
  return item
}

/** 她自己排一件事。手上多了只提醒一句，不拦——要不要堆是她的事（三问第 1 条）。 */
export function addItem(role, { what = '', why = '', next = '', nextKind = 'ask-model', target = '', prompt = '', by = 'self', mindId = '', origin = 'self', dueAt = '', sessionId = '', now = Date.now() } = {}) {
  const text = String(what || '').trim()
  if (!text) throw new Error('这件事是什么？得写一句')
  if (!NEXT_KINDS.includes(nextKind)) throw new Error(`下一步类型不认识：${nextKind}（可用：${NEXT_KINDS.join(' / ')}）`)
  const from = XP_ORIGINS.includes(origin) ? origin : 'self'
  const due = dueAt ? parseDueAt(dueAt, { now }) : null
  ensureRuntime(role)
  const doc = readAgenda(role)
  const active = doc.items.filter((i) => ['want', 'doing', 'blocked', 'waiting'].includes(i.state))
  const item = {
    id: `a-${String(now).slice(-6)}${Math.random().toString(36).slice(2, 5)}`,
    what: text.slice(0, 200),
    why: String(why || '').slice(0, 200),
    state: 'want',
    next: String(next || '').slice(0, 200),
    nextKind,
    target: String(target || '').slice(0, 400),
    prompt: String(prompt || '').slice(0, 600),
    by: String(by || 'self'),
    // 谁先提的：'self' = 她自发想做的；'owner' = 老板派的（不计经验）
    origin: from,
    // 这件事是从哪条心念接过来的（"我一直在想的事"→"我现在要做的事"）。
    // 有了这条链，"想"和"做"是一件事，不是两套账（2026-10-27）。
    mindId: String(mindId || ''),
    dueAt: due ? due.at : String(dueAt || '').slice(0, 40),
    dueAtMs: due ? due.ms : 0,
    // 哪条分身会话排的：到点优先送回去；会话归档了才交给别的分身。
    sessionId: String(sessionId || '').slice(0, 80),
    at: nowIso(now),
    updatedAt: nowIso(now),
    tries: 0,
    note: '',
  }
  doc.items.push(item)
  doc.updatedAt = nowIso(now)
  writeJson(agendaFile(role), doc)
  // 满了不拦，只说一句。拦下来就是替她决定"最多几件"。
  if (active.length >= MAX_ACTIVE) return { ...item, warning: `手上已经有 ${active.length} 件了，堆着也行——只是这样每件都会慢一点` }
  return item
}

/**
 * 把一条心念接成一件自己的事。
 * 「我一直在想的事」→「我现在要做的事」——这是她缺的那条路（2026-10-27）。
 * @returns {{ok:boolean, item?:Object, mind?:Object, error?:string}}
 */
/**
 * 把一条心念接成一件自己的事。
 * 「我一直在想的事」→「我现在要做的事」——这是她缺的那条路（2026-10-27）。
 *
 * 注意：这里**不替她读心念**。心念按「通道 + 受众」隔离，用越权的 scope 去读就是绕过隐私闸。
 * 所以她自己用 yushen_mind brief 看、把原话（what）带过来，这里只把"从哪条来的"记上。
 */
export function addFromMind(role, { mindId = '', what = '', nextKind = 'ask-model', next = '', dueAt = '', sessionId = '', now = Date.now() } = {}) {
  const id = String(mindId || '').trim()
  if (!id) return { ok: false, error: '要接哪条心念？给 mindId（先用 yushen_mind brief 看有哪些）' }
  const text = String(what || '').trim()
  if (!text) return { ok: false, error: '把那条心念的原话一起带过来（what）——我不替你读心念，那样等于绕过它自己的隐私闸' }
  const item = addItem(role, {
    what: text,
    why: '从心念接过来的',
    next: String(next || ''),
    nextKind,
    by: 'self',
    mindId: id,
    dueAt,
    sessionId,
    now,
  })
  return { ok: true, item, mind: { id, text: text.slice(0, 80) } }
}

/** 改状态/下一步。只允许合法转移，档她自己的数。 */
export function updateItem(role, id, patch = {}, { now = Date.now(), bySession = '' } = {}) {
  const doc = readAgenda(role)
  const item = doc.items.find((i) => i.id === id)
  if (!item) throw new Error(`没有这件事：${id}`)
  if (patch.state && !STATES.includes(patch.state)) throw new Error(`状态不认识：${patch.state}（可用：${STATES.join(' / ')}）`)
  if (patch.nextKind && !NEXT_KINDS.includes(patch.nextKind)) throw new Error(`下一步类型不认识：${patch.nextKind}`)
  if (patch.origin && !XP_ORIGINS.includes(patch.origin)) throw new Error(`来源不认识：${patch.origin}（可用：${XP_ORIGINS.join(' / ')}）`)
  const before = String(item.state || '')
  for (const key of ['state', 'next', 'nextKind', 'target', 'note', 'why', 'what']) {
    if (patch[key] !== undefined) item[key] = String(patch[key]).slice(0, key === 'target' ? 400 : 200)
  }
  if (patch.state === 'done' && before !== 'done') {
    item.doneAt = nowIso(now)
    item.doneBy = String(bySession || '').slice(0, 80)
    try { markManualDone(role, { what: item.what, sessionId: bySession, now }) } catch { /* 记不上最多多炼一次 */ }
  }
  if (patch.state && patch.state !== 'done') {
    item.doneAt = ''
    item.doneBy = ''
  }
  if (patch.origin !== undefined) item.origin = String(patch.origin)
  if (patch.dueAt !== undefined) {
    const due = String(patch.dueAt || '').trim() ? parseDueAt(patch.dueAt, { now }) : null
    item.dueAt = due ? due.at : String(patch.dueAt || '').slice(0, 40)
    item.dueAtMs = due ? due.ms : 0
    item.dueNotifiedAt = ''
    item.dueNotifiedAtMs = 0
  }
  item.updatedAt = nowIso(now)
  doc.updatedAt = item.updatedAt
  writeJson(agendaFile(role), doc)
  return item
}

/** 放弃：合法结局，不是失败。 */
export function dropItem(role, id, { why = '', now = Date.now() } = {}) {
  return updateItem(role, id, { state: 'dropped', note: String(why || '不做了').slice(0, 200) }, { now })
}

/**
 * 本地推进一步：只做不用模型的那一步。
 * 需要生成内容的（ask-model / write / tell-owner）→ 标 waiting，等她下次有模型时自己决定。
 */
export function stepOnce(role, { now = Date.now() } = {}) {
  const doc = readAgenda(role)
  // 她喊过停：tick 退回去，什么都不动（这是"她能不能说不"的最低要求）。
  const until = Date.parse(doc.pausedUntil || '')
  if (Number.isFinite(until) && now < until) {
    return { stepped: false, reason: `她说先别动（到 ${new Date(until).toLocaleString('zh-CN', { hour12: false })}）`, paused: true }
  }
  // 只挑「还在手边」的（doing / want），按上次动过的时间轮着来，别老盯着同一件。
  const pool = doc.items.filter((i) => ['doing', 'want'].includes(i.state))
    .sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')))
  if (!pool.length) return { stepped: false, reason: '没有能自己推的事（都在等模型或已卡住）' }
  const item = pool[0]
  if (!LOCAL_STEPS.includes(item.nextKind)) {
    item.state = 'waiting'
    // 她自己写的 note 不盖：那是她的判断，tick 只有「记账」的资格，没有替她下结论的资格。
    if (!item.note) item.note = `下一步要模型（${item.nextKind}），等她下次自己决定要不要花`
    item.updatedAt = nowIso(now)
    doc.updatedAt = item.updatedAt
    writeJson(agendaFile(role), doc)
    return { stepped: false, reason: '这一步要模型（她下次自己决定要不要花）', item }
  }
  if (item.state !== 'doing') item.state = 'doing'
  let note = ''
  try {
    if (item.nextKind === 'read-inbox') {
      const u = unreadFor(role, { limit: 1000 })
      note = `收件箱还有 ${u.rows.length} 条没看（最近一条：${String(u.rows[u.rows.length - 1]?.text || '').slice(0, 40)}）`
    } else if (item.nextKind === 'read-file') {
      const text = item.target && fs.existsSync(item.target) ? fs.readFileSync(item.target, 'utf8').slice(0, 400) : ''
      note = text ? `读了 ${path.basename(item.target)}（${text.length} 字，开头：${text.slice(0, 60).replace(/\s+/g, ' ')}）` : `没读到文件：${item.target || '（没写路径）'}`
    } else {
      note = '核对过一遍，暂时没新东西'
    }
  } catch (e) {
    note = `这一步没成：${e?.message || e}`
  }
  item.tries = Number(item.tries || 0) + 1
  // 这一步看到的东西记在 lastTry，不占她的 note（note 是她写的）。
  item.lastTry = { at: nowIso(now), note: note.slice(0, 200) }
  item.updatedAt = nowIso(now)
  doc.updatedAt = item.updatedAt
  writeJson(agendaFile(role), doc)
  return { stepped: true, item, note }
}

/** 注入用：她现在手上有哪几件（一行一条，短）。 */
export function agendaBrief(role, { limit = 3 } = {}) {
  const items = activeItems(role).slice(0, limit)
  if (!items.length) return ''
  return items.map((i) => {
    // 先给她自己写的那句；她没有，才拿 tick 看到的那句补上。
    // 但旧 tick 留下的假话不算她写的：既不当 note，也不拿 lastTry 顶上。
    const raw = String(i.note || '')
    const note = raw === LEGACY_TICK_NOTE ? '' : String(raw || i.lastTry?.note || '')
    return `- 「${i.what}」${i.state === 'blocked' ? '（卡住了）' : i.state === 'waiting' ? '（等下步要模型）' : ''}${note ? `：${note.slice(0, 40)}` : ''}`
  }).join('\n')
}
