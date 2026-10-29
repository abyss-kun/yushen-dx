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

export const DEFAULT_PER_DAY = 12 // 不给枷锁：默认放开，钱的事靠"告诉她"而不是靠拦
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
export function budgetOf(role, { now = Date.now(), perDay = DEFAULT_PER_DAY } = {}) {
  const day = dayKey(now)
  const used = readInvocations(role).items
    .filter((i) => ['pending', 'running', 'started', 'done'].includes(i.status) && String(i.requestedAt || '').startsWith(day)).length
  return { perDay: Number(perDay) || 0, used, left: Math.max(0, (Number(perDay) || 0) - used) }
}

/**
 * 她请求：花一次模型做这件事。
 * @returns 请求记录（status=pending）
 */
export function requestInvocation(role, { agendaId = '', why = '', now = Date.now(), perDay = DEFAULT_PER_DAY } = {}) {
  // 没接入鱼神（没读过规则）→ 礼物不启用：不是不给，是还没接上。
  try { requirePlugged(role, { now }) } catch (e) { throw new Error(e.message) }
  const doc = readInvocations(role)
  const busy = doc.items.find((i) => ['pending', 'running'].includes(i.status))
  if (busy) throw new Error('上一次调用还没走完；等它回来再说')
  const item = readAgenda(role).items.find((i) => i.id === agendaId)
  if (!item) throw new Error(`没有这件事：${agendaId}`)
  if (['done', 'dropped'].includes(item.state)) throw new Error('这件事已经结了，不用再花模型')
  const b = budgetOf(role, { now, perDay })
  if (b.left <= 0) throw new Error(`今天的额度用完了（${b.used}/${b.perDay}）；可以申请加，或者等明天`)
  const row = {
    id: `i-${String(now).slice(-6)}${Math.random().toString(36).slice(2, 5)}`,
    agendaId: String(agendaId),
    why: String(why || '').slice(0, 200),
    requestedAt: nowIso(now),
    day: dayKey(now),
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
  const row = doc.items.find((i) => i.status === 'pending')
  if (!row) return null
  row.status = 'running'
  row.startedAt = nowIso(now)
  save(role, doc)
  return row
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
