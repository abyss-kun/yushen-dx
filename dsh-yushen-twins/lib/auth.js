// 鱼神双子星 · 本地接口的门锁
// 两条路能进来：
//   1) 浏览器：DSH 自己的登录 Cookie（dsh-auth-*），用本机密钥验签——浏览器天然带着；
//   2) 脚本/外部软件：`x-yushen-token` 头，或 `?token=`，值在 ~/.dsh/dayu/api-token。
// 都没有 → 401。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const TOKEN_FILE = path.join(DATA, 'api-token')

let cached = ''

function b64urlToBuf(text) {
  return Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 本机 token：没有就生成一个（32 字节 hex），存 0600。 */
export function apiToken() {
  if (cached) return cached
  try {
    const text = fs.readFileSync(TOKEN_FILE, 'utf8').trim()
    if (/^[A-Za-z0-9_-]{32,}$/.test(text)) { cached = text; return cached }
  } catch { /* 还没生成 */ }
  const token = crypto.randomBytes(32).toString('hex')
  fs.mkdirSync(DATA, { recursive: true })
  fs.writeFileSync(TOKEN_FILE, token, { encoding: 'utf8', mode: 0o600 })
  try { fs.chmodSync(TOKEN_FILE, 0o600) } catch { /* Windows 上尽力而为 */ }
  cached = token
  return token
}

function secretKey() {
  try {
    const text = fs.readFileSync(path.join(HOME, '.credentials.yaml'), 'utf8')
    const at = text.indexOf('client-connection/browser-session:')
    if (at < 0) return null
    const m = text.slice(at, at + 500).match(/secret:\s*([A-Za-z0-9_-]+)/)
    if (!m) return null
    const key = b64urlToBuf(m[1])
    return key.byteLength === 32 ? key : null
  } catch { return null }
}

function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  }
  return out
}

/** 校验 DSH 自己的登录 Cookie：名字对得上、签名对、没过期。 */
export function verifyDshCookie(req) {
  const key = secretKey()
  if (!key) return false
  const authority = String(req.headers?.host || '')
  const name = 'dsh-auth-' + b64url(crypto.createHash('sha256').update(authority).digest())
  const raw = parseCookies(req.headers?.cookie)[name]
  if (!raw) return false
  const m = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(raw)
  if (!m) return false
  const expected = b64url(crypto.createHmac('sha256', key).update(m[1]).digest())
  if (expected !== m[2]) return false
  try {
    const payload = JSON.parse(b64urlToBuf(m[1]).toString('utf8'))
    if (payload.authority !== authority) return false
    if (!(Number(payload.expiresAt) > Date.now())) return false
    return true
  } catch { return false }
}

/** 请求能不能进。 */
export function isAllowed(req) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const given = String(req.headers?.['x-yushen-token'] || url.searchParams.get('token') || '')
  const token = apiToken()
  if (given && (given.length === token.length)) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token))) return true
    } catch { /* 长度不同直接失败 */ }
  }
  return verifyDshCookie(req)
}

export function unauthorized(res) {
  res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, error: 'unauthorized：带上 x-yushen-token，或用浏览器（DSH 登录态）访问' }))
}
