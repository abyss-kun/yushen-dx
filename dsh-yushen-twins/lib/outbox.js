// 递话：她产出的话 → 运行层 → 桥（手）发出去。
//
// 不是冒名：桥收到的不是一串外来文字，而是**一条有出处的决定**。
// 所以这里强制带 decisionId；没有出处的句子，桥直接拒。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { runtimeDir, safeRole, ensureRuntime } from './runtime.js'
import { isCanned } from './analyze.js'
import { identityLine } from './identity.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const TOKEN_FILE = path.join(DATA, 'bridge-token.json')
const BRIDGE = process.env.YUSHEN_BRIDGE_URL || 'http://127.0.0.1:3100'

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** 共享 token：鱼神和桥各读同一份；只在本地。 */
export function ensureToken() {
  try {
    const got = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
    if (got?.token) return got.token
  } catch { /* 还没建 */ }
  const token = crypto.randomBytes(24).toString('hex')
  fs.mkdirSync(DATA, { recursive: true })
  fs.writeFileSync(TOKEN_FILE, `${JSON.stringify({ token, at: new Date().toISOString(), note: '鱼神↔桥 共享；只在本机；换机器重新生成' }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return token
}

function logRow(role, row, now) {
  try {
    const dir = path.join(runtimeDir(role), 'outbox')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, `${dayKey(now)}.jsonl`), `${JSON.stringify(row)}\n`, 'utf8')
  } catch { /* 记不下不影响发送 */ }
}

/**
 * 把她的一句话递到桥。
 * @param {string} role
 * @param {{key:string, text:string, decisionId:string, via?:string, dry?:boolean, now?:number}} req
 */
export async function sendAs(role, { key = '', text = '', decisionId = '', via = 'local', dry = false, now = Date.now() } = {}) {
  ensureRuntime(role)
  const k = String(key || '')
  const body = String(text || '').trim()
  const id = String(decisionId || '')
  if (!/^(group|private):/.test(k)) throw new Error(`会话不对：${k || '空'}`)
  if (!body) throw new Error('没有话要发')
  if (isCanned(body)) throw new Error('这是自动回复模板，不是你说的话；要发就用你自己的话，或者不发')
  if (body.length > 300) throw new Error('太长了（>300 字）')
  if (!id) throw new Error('没有决定 id：这句必须能追到她的哪次决定，否则就是替她说话')

  const token = ensureToken()
  // 走查询参数：桥那边的请求体读取在某些情况下会被前面吃掉，参数是稳的。
  const u = new URL(`${BRIDGE}/api/dayu/send`)
  u.searchParams.set('key', k)
  u.searchParams.set('text', body)
  u.searchParams.set('decisionId', id)
  u.searchParams.set('via', via)
  if (dry) u.searchParams.set('dry', '1')
  let out = { ok: false }
  try {
    const r = await fetch(u, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-yushen-token': token },
      signal: AbortSignal.timeout(15000),
    })
    const data = await r.json().catch(() => ({}))
    out = { ok: r.ok && data?.ok === true, status: r.status, data }
  } catch (e) {
    out = { ok: false, error: String(e?.message || e) }
  }
  logRow(role, { at: new Date(now).toISOString(), role: safeRole(role), who: identityLine({ role: safeRole(role), channel: k.startsWith('group:') || k.startsWith('private:') ? 'qq' : 'workbench' }), key: k, text: body.slice(0, 200), decisionId: id, via, dry, ok: out.ok, error: out.error || out.data?.error || '' }, now)
  return out
}

/** 发一张本地图（宝藏/她的数据/插件素材目录内），可带一句说明。 */
export async function shareImage(role, { key = '', file = '', text = '', decisionId = '', via = 'local', dry = false, now = Date.now() } = {}) {
  ensureRuntime(role)
  const k = String(key || '')
  const f = String(file || '').trim()
  const body = String(text || '').trim()
  const id = String(decisionId || '')
  if (!/^(group|private):/.test(k)) throw new Error(`会话不对：${k || '空'}`)
  if (!f) throw new Error('没有图要发')
  if (!id) throw new Error('没有决定 id：这张图必须能追到她的哪次决定')
  const u = new URL(`${BRIDGE}/api/dayu/send`)
  u.searchParams.set('key', k)
  u.searchParams.set('image', f)
  if (body) u.searchParams.set('text', body)
  u.searchParams.set('decisionId', id)
  u.searchParams.set('via', via)
  if (dry) u.searchParams.set('dry', '1')
  const token = ensureToken()
  let out = { ok: false }
  try {
    const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-yushen-token': token }, signal: AbortSignal.timeout(20000) })
    const data = await r.json().catch(() => ({}))
    out = { ok: r.ok && data?.ok === true, status: r.status, data }
  } catch (e) {
    out = { ok: false, error: String(e?.message || e) }
  }
  logRow(role, { at: new Date(now).toISOString(), role: safeRole(role), who: identityLine({ role: safeRole(role), channel: k.startsWith('group:') || k.startsWith('private:') ? 'qq' : 'workbench' }), key: k, text: `[图] ${f}${body ? ` ${body.slice(0, 100)}` : ''}`, decisionId: id, via, dry, ok: out.ok, error: out.error || out.data?.error || '' }, now)
  return out
}

/** 今天的递话记录（复盘：她到底发了什么、走哪条嗓子）。 */
export function outboxToday(role, { day = '', now = Date.now() } = {}) {
  const file = path.join(runtimeDir(role), 'outbox', `${day || dayKey(now)}.jsonl`)
  let lines = []
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch { return [] }
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return rows
}
