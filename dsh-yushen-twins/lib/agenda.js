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

export const STATES = Object.freeze(['want', 'doing', 'blocked', 'waiting', 'done', 'dropped'])
export const LOCAL_STEPS = Object.freeze(['read-inbox', 'read-file', 'check'])
export const NEXT_KINDS = Object.freeze([...LOCAL_STEPS, 'ask-model', 'write', 'tell-owner'])
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

/** 她自己排一件事。手上多了只提醒一句，不拦——要不要堆是她的事（三问第 1 条）。 */
export function addItem(role, { what = '', why = '', next = '', nextKind = 'ask-model', target = '', prompt = '', by = 'self', mindId = '', now = Date.now() } = {}) {
  const text = String(what || '').trim()
  if (!text) throw new Error('这件事是什么？得写一句')
  if (!NEXT_KINDS.includes(nextKind)) throw new Error(`下一步类型不认识：${nextKind}（可用：${NEXT_KINDS.join(' / ')}）`)
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
    // 这件事是从哪条心念接过来的（"我一直在想的事"→"我现在要做的事"）。
    // 有了这条链，"想"和"做"是一件事，不是两套账（2026-10-27）。
    mindId: String(mindId || ''),
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
export function addFromMind(role, { mindId = '', what = '', nextKind = 'ask-model', next = '', now = Date.now() } = {}) {
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
    now,
  })
  return { ok: true, item, mind: { id, text: text.slice(0, 80) } }
}

/** 改状态/下一步。只允许合法转移，档她自己的数。 */
export function updateItem(role, id, patch = {}, { now = Date.now() } = {}) {
  const doc = readAgenda(role)
  const item = doc.items.find((i) => i.id === id)
  if (!item) throw new Error(`没有这件事：${id}`)
  if (patch.state && !STATES.includes(patch.state)) throw new Error(`状态不认识：${patch.state}（可用：${STATES.join(' / ')}）`)
  if (patch.nextKind && !NEXT_KINDS.includes(patch.nextKind)) throw new Error(`下一步类型不认识：${patch.nextKind}`)
  for (const key of ['state', 'next', 'nextKind', 'target', 'note', 'why', 'what']) {
    if (patch[key] !== undefined) item[key] = String(patch[key]).slice(0, key === 'target' ? 400 : 200)
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
    item.note = `下一步要模型（${item.nextKind}），等她下次自己决定要不要花`
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
  item.note = note.slice(0, 200)
  item.updatedAt = nowIso(now)
  doc.updatedAt = item.updatedAt
  writeJson(agendaFile(role), doc)
  return { stepped: true, item, note }
}

/** 注入用：她现在手上有哪几件（一行一条，短）。 */
export function agendaBrief(role, { limit = 3 } = {}) {
  const items = activeItems(role).slice(0, limit)
  if (!items.length) return ''
  return items.map((i) => `- 「${i.what}」${i.state === 'blocked' ? '（卡住了）' : i.state === 'waiting' ? '（等下步要模型）' : ''}${i.note ? `：${i.note.slice(0, 40)}` : ''}`).join('\n')
}
