// 鱼神双子星 · 本机 DSH HTTP RPC 客户端
// 用途：宿主的 agents.create 不认 agentOptions、sessions 服务又选不了模型时，
// 直接走 DSH 自己的 HTTP RPC（session/create → selectModel → prompt），
// 和 QQ 桥接同一条路；鉴权用本机密钥离线铸造 cookie，不依赖启动 token。
//
// 端口不写死：宿主收到任意请求时把 Host 头记下来（setDshHost），这里按需拼 baseUrl。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
let host = ''
try {
  const saved = fs.readFileSync(path.join(HOME, 'dayu', 'base-url'), 'utf8').trim()
  if (/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(saved)) host = saved
} catch { /* 还没记过 */ }

/** 宿主 Web 服务收到请求时调用；只认回环地址。 */
export function setDshHost(value) {
  const text = String(value || '').trim()
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(text)) return
  host = text
  try { fs.writeFileSync(path.join(HOME, 'dayu', 'base-url'), text, 'utf8') } catch { /* 记不下不挡 */ }
}
export function dshBaseUrl() {
  return host ? `http://${host}` : ''
}

const b64 = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function secretKey() {
  try {
    const text = fs.readFileSync(path.join(HOME, '.credentials.yaml'), 'utf8')
    const at = text.indexOf('client-connection/browser-session:')
    if (at < 0) return null
    const m = text.slice(at, at + 500).match(/secret:\s*([A-Za-z0-9_-]+)/)
    if (!m) return null
    const key = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    return key.byteLength === 32 ? key : null
  } catch { return null }
}

function cookieFor(baseUrl) {
  const key = secretKey()
  if (!key) throw new Error('读不到 DSH 会话密钥（.credentials.yaml）')
  const authority = new URL(baseUrl).host
  const now = Date.now()
  const body = b64(JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 3600 * 1000 }))
  const sig = b64(crypto.createHmac('sha256', key).update(body).digest())
  return 'dsh-auth-' + b64(crypto.createHash('sha256').update(authority).digest()) + '=v1.' + body + '.' + sig
}

const WRAP = {
  'session/list': '_request',
  'session/create': 'request',
  'session/selectModel': 'request',
  'session/prompt': 'request',
  'session/rename': 'request',
}

let rpcSeq = 0
async function rpc(method, payload = {}) {
  const base = dshBaseUrl()
  if (!base) throw new Error('还不知道 DSH 的地址（宿主还没收到过请求）')
  const endpoint = method.replace(/\./g, '/')
  const wrapper = WRAP[endpoint]
  const args = wrapper ? { [wrapper]: payload } : payload
  const rpcId = `ys-${++rpcSeq}-${Math.random().toString(36).slice(2, 8)}`
  const res = await fetch(`${base}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieFor(base) },
    body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}: ${text.slice(0, 160)}`)
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON */ }
  if (!json?.result) throw new Error(`${endpoint} 没有 result: ${text.slice(0, 160)}`)
  return json.result
}

/** 建一条会话；返回 sessionId。 */
export async function createSessionRpc({ cwd, agentPreset } = {}) {
  // 2026-10-30：带上预设名，让新会话直接挂上「鱼神」预设（否则工具和注入都不全）
  const payload = {}
  if (cwd) payload.cwd = cwd
  // 2026-10-30 实测：字段名 agentPreset 会被拒（不返回 sessionId）；等价字段 preset 可以建会话。
  if (agentPreset) payload.preset = agentPreset
  const out = await rpc('session/create', payload)
  const id = out?.value?.sessionId
  if (!id) throw new Error('session/create 没给 sessionId')
  return id
}

/** 给会话选模型。 */
export async function selectModelRpc({ sessionId, provider = 'deepseek-account', model = 'deepseek-flash', reasoningEffort = 'high' } = {}) {
  return rpc('session/selectModel', { sessionId, provider, model, reasoningEffort })
}

/** 投一条消息（队列模式）。 */
export async function promptRpc({ sessionId, text, content } = {}) {
  const parts = Array.isArray(content) && content.length
    ? content
    : [{ type: 'text', text: String(text || '') }]
  return rpc('session/prompt', { sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: parts })
}

/** 查会话摘要（用来确认 cwd / 运行状态）。 */
export async function findSessionRpc(sessionId) {
  const out = await rpc('session/list', {})
  return (out?.value?.items || []).find((it) => it.sessionId === sessionId) || null
}

/** 列全部会话（id、标题、是否空白、是否在跑）。 */
export async function listSessionsRpc() {
  const out = await rpc('session/list', {})
  return (out?.value?.items || []).map((it) => ({
    sessionId: String(it.sessionId || ''),
    title: String(it.projections?.values?.title || ''),
    blank: Boolean(it.blank),
    running: Boolean(it.running),
    cwd: String(it.cwd || ''),
  }))
}

/** 改会话标题（老会话退役、空会话打标都靠它）。 */
export async function renameSessionRpc(sessionId, title) {
  return rpc('session/rename', { sessionId, title })
}
