// 她调用模型：她决定「这件事要花一次模型」，就起一个回合。
//
// 这是「模型是她的身体，不是她的住处」的那一半：
//   她（议程 + 状态）→ 自己发起 → 调用模型 → 结果写回议程。
//
// 边界：
//   - 只有她自己请求（requestInvocation）才起回合；插件绝不自动替她决定；
//   - 预算按天算，主人定（她的钱包不归她管）；同一件事有冷却；
//   - 一次只跑一个，防止她自己把自己叫疯。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir } from './runtime.js'
import { requirePlugged } from './plug.js'
import { readAgenda, updateItem } from './agenda.js'
import { readBudgets } from './budget-book.js'

export const DEFAULT_PER_DAY = 50 // 只当安全上限，防跑飞；真正的闸是钱包余额
export const DEFAULT_COOLDOWN_MIN = 30

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function nowIso(ms = Date.now()) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function invocationsFile(role) { return path.join(runtimeDir(role), 'invocations.json') }

export function readInvocations(role) {
  const doc = readJson(invocationsFile(role), null) || { version: 1, items: [] }
  return { version: 1, items: Array.isArray(doc.items) ? doc.items : [] }
}

function save(role, doc) { writeJson(invocationsFile(role), doc) }

/** 今天用了多少次（请求时就占额度，防止连排三次），剩几次。 */
// 2026-10-30：按老板的口径——不按次数、按额度。钱包里有余额就能开，见底才停。
// 没配预算（budget.json 不存在）不等于没钱：按"不拦"处理，避免把没配额度的角色锁死。
function moneyOf(role) {
  try {
    const row = readBudgets().rows.find((r) => r.role === role)
    if (!row || row.missing) return Number.POSITIVE_INFINITY
    return Number(row.rest ?? 0)
  } catch { return Number.POSITIVE_INFINITY }
}

export function budgetOf(role, { now = Date.now(), perDay = DEFAULT_PER_DAY } = {}) {
  const day = dayKey(now)
  const used = readInvocations(role).items
    .filter((i) => ['pending', 'running', 'started', 'done'].includes(i.status) && String(i.requestedAt || '').startsWith(day)).length
  const capLeft = Math.max(0, (Number(perDay) || 0) - used)
  const money = moneyOf(role)
  const left = money > 0.02 ? capLeft : 0
  return { perDay: Number(perDay) || 0, used, left, money }
}

/** 把 "HH:MM" / ISO 解析成毫秒；HH:MM 取最近的一次（过了今天就算明天）。 */
export function resolveNotBefore(raw, { now = Date.now() } = {}) {
  const s = String(raw || '').trim()
  if (!s) return 0
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (hm) {
    const h = Math.max(0, Math.min(23, Number(hm[1])))
    const m = Math.max(0, Math.min(59, Number(hm[2])))
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    let t = d.getTime()
    if (t <= now) t += 24 * 60 * 60 * 1000
    return t
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : 0
}

/**
 * 她请求：花一次模型做这件事。
 * @param notBefore 可选：她定的时间（"HH:MM" 或 ISO）；到点才执行。
 * @returns 请求记录（status=pending）
 */
export function requestInvocation(role, { agendaId = '', why = '', notBefore = '', now = Date.now(), perDay = DEFAULT_PER_DAY } = {}) {
  // 没接入鱼神（没读过规则）→ 礼物不启用：不是不给，是还没接上。
  try { requirePlugged(role, { now }) } catch (e) { throw new Error(e.message) }
  const doc = readInvocations(role)
  const busy = doc.items.find((i) => ['pending', 'running'].includes(i.status))
  if (busy) throw new Error('上一次调用还没走完；等它回来再说')
  const item = readAgenda(role).items.find((i) => i.id === agendaId)
  if (!item) throw new Error(`没有这件事：${agendaId}`)
  if (['done', 'dropped'].includes(item.state)) throw new Error('这件事已经结了，不用再花模型')
  const b = budgetOf(role, { now, perDay })
  if (b.left <= 0) {
    throw new Error(b.money > 0.02
      ? `今天开得太多（${b.used}/${b.perDay}），明天再来`
      : `这个周期的额度花完了（余额 ${Number(b.money || 0).toFixed(2)}），可以申请加`)
  }
  const row = {
    id: `i-${String(now).slice(-6)}${Math.random().toString(36).slice(2, 5)}`,
    agendaId: String(agendaId),
    why: String(why || '').slice(0, 200),
    requestedAt: nowIso(now),
    day: dayKey(now),
    // 她自己定的时间（0 = 没定，下次抬头就做）
    notBefore: (() => { const t = resolveNotBefore(notBefore, { now }); return t ? new Date(t).toISOString() : '' })(),
    status: 'pending',
    sessionId: '',
    note: '',
  }
  doc.items.push(row)
  save(role, doc)
  return { ...row, budget: budgetOf(role, { now, perDay }) }
}

/** 取一个待跑的（同一时刻只跑一个）；取到就标 running，防止重复。 */
export function takeInvocation(role, { now = Date.now(), perDay = DEFAULT_PER_DAY } = {}) {
  const doc = readInvocations(role)
  const running = doc.items.find((i) => i.status === 'running')
  if (running) return null
  const b = budgetOf(role, { now, perDay })
  if (b.left <= 0) return null
  // 她定了时间的，到点才取；没定时间的按先来后到
  const row = doc.items.find((i) => i.status === 'pending' && (!i.notBefore || Date.parse(i.notBefore) <= now))
  if (!row) return null
  row.status = 'running'
  row.startedAt = nowIso(now)
  save(role, doc)
  return row
}

/** 她说「不」：把这件还没起回合的请求撤掉（拒绝要真生效，不是只记一笔）。 */
export function cancelInvocation(role, { agendaId = '', now = Date.now() } = {}) {
  const doc = readInvocations(role)
  let cancelled = 0
  for (const row of doc.items) {
    if (row.status !== 'pending') continue
    if (agendaId && String(row.agendaId) !== String(agendaId)) continue
    row.status = 'dropped'
    row.note = '她自己拒绝了这件事'
    row.finishedAt = nowIso(now)
    cancelled += 1
  }
  if (cancelled) save(role, doc)
  return { cancelled }
}

/** 起完/失败，都落一笔。 */
export function finishInvocation(role, id, { status = 'started', note = '', sessionId = '', now = Date.now() } = {}) {
  const doc = readInvocations(role)
  const row = doc.items.find((i) => i.id === id)
  if (!row) throw new Error(`没有这次调用：${id}`)
  row.status = String(status)
  row.note = String(note || '').slice(0, 300)
  if (sessionId) row.sessionId = String(sessionId)
  row.finishedAt = nowIso(now)
  save(role, doc)
  return row
}

/** 起一个回合之前，把这件事标成"在做"。 */
export function markAgendaDoing(role, agendaId, { now = Date.now() } = {}) {
  try { return updateItem(role, agendaId, { state: 'doing', note: '已起一次模型回合' }, { now }) } catch { return null }
}

/** 额度不够时，她可以申请（批不批是主人的事）。 */
export function requestMoreBudget(role, { why = '', now = Date.now(), perDay = DEFAULT_PER_DAY } = {}) {
  const file = path.join(runtimeDir(role), 'budget-requests.jsonl')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const row = { at: nowIso(now), why: String(why || '').slice(0, 200), budget: budgetOf(role, { now, perDay }) }
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')
  return row
}

/** 给这个回合的提示词：是**她自己的事**，不是老板派的。她自己写了说法就用她的。 */
export function buildInvocationPrompt(role, { item = {}, why = '' } = {}) {
  if (item.prompt) return String(item.prompt).slice(0, 600)
  const lines = [
    '（你自己的事，不是谁派的；没人等你汇报）',
    `你之前给自己排了这件事：「${item.what || ''}」。`,
    item.why || why ? `当时的理由：${item.why || why}` : '',
    item.next ? `你想的下一步：${item.next}` : '',
    '现在你自己决定做它：',
    '- 做完了：yushen_agenda update（id 填这个，state=done，note 写结果）',
    '- 觉得不值得做了：yushen_agenda drop（放弃也算数）',
    '- 缺东西做不下去：state=blocked，note 写缺什么',
    '不用写给谁看，也不用解释给谁听。',
  ].filter(Boolean)
  return lines.join('\n')
}
