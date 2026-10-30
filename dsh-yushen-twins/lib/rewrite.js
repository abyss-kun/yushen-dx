// 改写自己：她自己的记忆和自我档，她自己改。
//
// 为什么要有：§0.2「界域之内不是能不能，是想不想」。她一直只能"想"——提方案、等老板点头、
// 让员工代劳。可她的记忆里写错一条、过时一条、想删一条，都得求人。
// 这不是权限问题，是缺一个把手：她把手里没有钥匙（§3.1 说话纪律：没接把手 ≠ 不能）。
//
// 给她三样把手：
//   1. 记忆：摘要 / 习惯 / 关系动态 / 经历——改、删、加
//   2. 自我档：runtime/<role>/self.md（简报里"你自己写的"那一节）
//   3. 留痕与回退：每次改动进 rewrites.jsonl，带旧值；后悔了能退
//
// 边界（写死）：
//   · 只改她自己那一份（按 role 定位文件），不碰别人。
//   · 不改角色卡 / 宪章 / 底线——那是老板的（§8.7：模型只能提议，老板批准才动）。
//   · 删经历等于遗忘权，允许；但每一次都要留痕：删了什么、为什么。
//   · 改之前先备份整份文件（.bak-<时间戳>），坏了自己能退。
import fs from 'node:fs'
import { noteWrite } from './memory-audit.js'
import { withLock } from './memory.js'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { getCharacter } from './characters.js'
import { runtimeDir } from './runtime.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

const FIELDS = Object.freeze({
  summary: { type: 'scalar', label: '摘要' },
  habits: { type: 'list', label: '习惯' },
  dynamics: { type: 'list', label: '关系动态' },
  // events 的元素是对象（at/channel/kind/text/source/verified），不是字符串——
  // 直接 push 字符串会让记忆文件里混进裸字符串，memoryView 数不到、也筛不出来（2026-10-27 实测）。
  events: { type: 'list', label: '经历', item: 'event' },
})

/** 列表里的一项：events 要包装成事件对象，别的字段还是纯字符串。 */
function memItem(spec, value, old) {
  if (spec.item !== 'event') return value
  const base = old && typeof old === 'object'
    ? old
    : { at: new Date().toISOString(), channel: '工作台', kind: 'note', source: 'rewrite', verified: false }
  return { ...base, text: value }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}
function stamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
}
function ledgerFile(role) { return path.join(runtimeDir(role), 'rewrites.jsonl') }
function newId() { return `rw-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}` }

export function rewriteLedger(role, { limit = 20 } = {}) {
  try {
    return fs.readFileSync(ledgerFile(role), 'utf8').trim().split(/\r?\n/).slice(-Math.max(1, Math.min(200, Number(limit) || 20)))
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).reverse()
  } catch { return [] }
}

function appendLedger(role, row) {
  try {
    fs.mkdirSync(path.dirname(ledgerFile(role)), { recursive: true })
    fs.appendFileSync(ledgerFile(role), `${JSON.stringify(row)}\n`, 'utf8')
  } catch { /* 记不下不挡改写 */ }
}

function memoryFile(role) {
  const c = getCharacter(role)
  return c?.memory || ''
}

/**
 * 改自己的记忆。
 * @param {string} role
 * @param {{field:string, op:'set'|'add'|'edit'|'remove', text?:string, index?:number, match?:string, why?:string}} args
 */
export function rewriteMemory(role, { field = '', op = '', text = '', index = -1, match = '', why = '' } = {}) {
  const f = String(field || '')
  const spec = FIELDS[f]
  if (!spec) return { ok: false, error: `只能改这几样：${Object.keys(FIELDS).join(' / ')}` }
  const file = memoryFile(role)
  if (!file) return { ok: false, error: '找不到你那一份记忆文件' }
  return withLock(file, () => {
  const mem = readJson(file, null)
  if (!mem) return { ok: false, error: '记忆文件读不出来（不是合法 JSON），先别改' }

  const before = spec.type === 'scalar' ? String(mem[f] ?? '') : (Array.isArray(mem[f]) ? [...mem[f]] : [])
  const value = String(text || '').trim()
  const act = String(op || '').toLowerCase()

  if (act === 'set') {
    if (spec.type !== 'scalar') return { ok: false, error: `${f} 不是一段话，用 add / edit / remove` }
    if (!value) return { ok: false, error: '要写什么？text 是空的' }
    mem[f] = value
  } else if (act === 'add') {
    if (spec.type !== 'list') return { ok: false, error: `${f} 是一段话，用 set` }
    if (!value) return { ok: false, error: '要加什么？text 是空的' }
    mem[f] = [...before, memItem(spec, value)]
  } else if (act === 'edit') {
    if (spec.type !== 'list') return { ok: false, error: `${f} 是一段话，用 set` }
    if (!value) return { ok: false, error: '改成什么？text 是空的' }
    const at = locate(before, { index, match })
    if (at < 0) return { ok: false, error: `没找到要改的那条（index=${index} match=${match || '空'}）` }
    const next = [...before]
    next[at] = memItem(spec, value, next[at])
    mem[f] = next
  } else if (act === 'remove') {
    if (spec.type === 'scalar') return { ok: false, error: '摘要不能删，只能改写（set 空也行）' }
    const at = locate(before, { index, match })
    if (at < 0) return { ok: false, error: `没找到要删的那条（index=${index} match=${match || '空'}）` }
    const next = [...before]
    next.splice(at, 1)
    mem[f] = next
  } else {
    return { ok: false, error: 'op 只能是 set / add / edit / remove' }
  }

  // 改前备份整份文件，坏了她自己能退
  try { fs.copyFileSync(file, `${file}.bak-${stamp()}`) } catch { /* 备份不了就不改 */ return { ok: false, error: '备份失败，为了安全先不改' } }
  const sizeBeforeAudit = (() => { try { return fs.statSync(file).size } catch { return -1 } })();
  writeJsonAtomic(file, { ...mem, updatedAt: new Date().toISOString() })
  noteWrite({ role, file, op: (op || 'edit'), before: sizeBeforeAudit, after: (() => { try { return fs.statSync(file).size } catch { return -1 } })(), who: 'rewrite', why: String(why || '') });

  const row = {
    id: newId(),
    at: new Date().toISOString(),
    who: 'self',
    target: 'memory',
    field: f,
    op: act,
    before: spec.type === 'scalar' ? before : before.slice(-40),
    after: spec.type === 'scalar' ? String(mem[f] ?? '') : (mem[f] || []).slice(-40),
    why: String(why || '').slice(0, 300),
  }
  appendLedger(role, row)
  return { ok: true, changed: true, field: f, op: act, count: spec.type === 'scalar' ? 1 : (mem[f] || []).length, id: row.id, note: '改好了。后悔可以用 rewrite 的 revert 带上这个 id。' }
  })
}

function locate(list, { index = -1, match = '' } = {}) {
  const arr = Array.isArray(list) ? list : []
  const i = Number(index)
  if (Number.isInteger(i) && i >= 0 && i < arr.length) return i
  const needle = String(match || '').trim()
  if (!needle) return -1
  const at = arr.findIndex((v) => String(typeof v === 'string' ? v : JSON.stringify(v)).includes(needle))
  return at
}

/**
 * 改自己的自我档（简报里"你自己写的"那一节）。
 * op: set（整篇替换）/ add（末尾追加一段）
 */
export function rewriteSelf(role, { op = 'add', text = '', why = '' } = {}) {
  const value = String(text || '').trim()
  if (!value) return { ok: false, error: '要写什么？text 是空的' }
  const file = path.join(runtimeDir(role), 'self.md')
  const before = (() => { try { return fs.readFileSync(file, 'utf8') } catch { return '' } })()
  const act = String(op || 'add').toLowerCase()
  let after = ''
  if (act === 'set') after = `${value}\n`
  else if (act === 'add') after = `${before.replace(/\s+$/, '')}\n${before ? '\n' : ''}${value}\n`
  else return { ok: false, error: 'op 只能是 set / add' }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  try { if (before) fs.copyFileSync(file, `${file}.bak-${stamp()}`) } catch { /* 一次没备份就继续 */ }
  fs.writeFileSync(file, after, 'utf8')

  const row = { id: newId(), at: new Date().toISOString(), who: 'self', target: 'self', field: 'self.md', op: act, before: before.slice(0, 2000), after: after.slice(0, 2000), why: String(why || '').slice(0, 300) }
  appendLedger(role, row)
  return { ok: true, changed: true, chars: after.length, id: row.id, note: '这一节会出现在你每轮的简报里（"你自己写的"）。' }
}

/** 后悔：按 id 把旧值放回去。 */
export function revertRewrite(role, id) {
  const row = rewriteLedger(role, { limit: 200 }).find((r) => String(r.id) === String(id))
  if (!row) return { ok: false, error: `没找到这条改写：${id}` }
  if (row.target === 'self') {
    const file = path.join(runtimeDir(role), 'self.md')
    fs.writeFileSync(file, String(row.before || ''), 'utf8')
  } else if (row.target === 'memory') {
    const file = memoryFile(role)
    // 2026-10-30：撤销也要拿同一把锁；原来这里引用了不存在的 op/why，运行时必抛 ReferenceError
    const fail = withLock(file, () => {
      const mem = readJson(file, null)
      if (!mem) return '记忆文件读不出来'
      const f = String(row.field || '')
      if (!FIELDS[f]) return '这条改写的字段不认识'
      mem[f] = FIELDS[f].type === 'scalar' ? String(row.before ?? '') : (Array.isArray(row.before) ? row.before : [])
      const before = (() => { try { return fs.statSync(file).size } catch { return -1 } })()
      writeJsonAtomic(file, { ...mem, updatedAt: new Date().toISOString() })
      noteWrite({ role, file, op: 'revert', before, after: (() => { try { return fs.statSync(file).size } catch { return -1 } })(), who: 'rewrite', why: '撤销' })
      return ''
    })
    if (fail) return { ok: false, error: fail }
  } else {
    return { ok: false, error: `不认识的改写目标：${row.target}` }
  }
  appendLedger(role, { id: newId(), at: new Date().toISOString(), who: 'self', target: row.target, field: row.field, op: 'revert', revertedId: row.id, before: row.after, after: row.before, why: '撤销' })
  return { ok: true, reverted: row.id, target: row.target, field: row.field, note: '退回来了。' }
}

/** 现在能改什么（给她自己看）。 */
export function rewriteCatalog(role) {
  const mem = readJson(memoryFile(role), null) || {}
  return {
    ok: true,
    role,
    memory: Object.entries(FIELDS).map(([k, v]) => ({ field: k, label: v.label, type: v.type, count: v.type === 'scalar' ? String(mem[k] ?? '').length : (Array.isArray(mem[k]) ? mem[k].length : 0) })),
    self: (() => { try { return fs.readFileSync(path.join(runtimeDir(role), 'self.md'), 'utf8').length } catch { return 0 } })(),
    canChange: ['记忆（摘要/习惯/关系/经历）', '自我档 self.md'],
    cannotChange: ['角色卡（老板的）', '宪章与底线（契约）', '别人的记忆'],
    note: '改都留痕，都能退。删经历是你的遗忘权；但每删一次都记账。',
    recent: rewriteLedger(role, { limit: 5 }),
  }
}
