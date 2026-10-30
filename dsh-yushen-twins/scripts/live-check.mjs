// 真机验收：只打真实接口，不看代码、不看文档。
// 用法：node scripts/live-check.mjs [baseUrl]
// 两条路都试：x-yushen-token；不行就现签一张 DSH 浏览器 Cookie（v1，带 issuedAt）。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
/** 「主机:端口」没有 scheme 时补 http://；不然 fetch 直接 Failed to parse URL。 */
function withScheme(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`
}
// 命令行的 baseUrl 也可能是「主机:端口」；补完 scheme 再交给 fetch / new URL(base).host。
function baseFromDisk() {
  try { return fs.readFileSync(path.join(HOME, 'dayu', 'base-url'), 'utf8').trim() } catch { return '' }
}
const base = withScheme(process.argv[2] || process.env.YUSHEN_BASE || baseFromDisk() || 'http://127.0.0.1:50111').replace(/\/$/, '')
const token = (() => { try { return fs.readFileSync(path.join(HOME, 'dayu', 'api-token'), 'utf8').trim() } catch { return '' } })()

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 现签一张浏览器会话 Cookie：新版 DSH 的网关只认这个（v1 = 带 issuedAt）。 */
function mintCookie() {
  try {
    const yaml = fs.readFileSync(path.join(HOME, '.credentials.yaml'), 'utf8')
    const at = yaml.indexOf('client-connection/browser-session:')
    const m = yaml.slice(at, at + 500).match(/secret:\s*([A-Za-z0-9_-]+)/)
    if (!m) return ''
    const key = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    const authority = new URL(base).host
    const issuedAt = Date.now()
    const payload = { version: 1, authority, issuedAt, expiresAt: issuedAt + 3600 * 1000 }
    const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
    const sig = b64url(crypto.createHmac('sha256', key).update(body).digest())
    const name = 'dsh-auth-' + b64url(crypto.createHash('sha256').update(authority).digest())
    return `${name}=v1.${body}.${sig}`
  } catch { return '' }
}

const cookie = mintCookie()
const headers = { ...(token ? { 'x-yushen-token': token } : {}), ...(cookie ? { cookie } : {}) }

let pass = 0
let fail = 0
async function get(name, p, check) {
  try {
    const r = await fetch(base + p, { headers })
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* 非 JSON */ }
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const detail = check ? check(json) : ''
    pass += 1
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    fail += 1
    console.error(`✗ ${name} — ${e?.message || e}`)
  }
}

await get('健康', '/api/dayu/health', (j) => `${j.plugins ?? '?'} 插件 / ${(j.sessions || []).length} 会话`)
await get('状态', '/api/yushen/status', (j) => `开关 ${Object.keys(j.switches || {}).length} 个`)
await get('活会话', '/api/dayu/live', (j) => `${(j.sessions || []).length} 条`)
await get('派活单', '/api/dayu/jobs', (j) => `${(j.jobs || []).length} 单`)
await get('事故', '/api/dayu/incidents', (j) => `${(j.incidents || []).length} 张`)
await get('员工档案', '/api/dayu/employees', (j) => `${(j.plugins || []).length} 居民 / ${(j.sessions || []).length} 会话`)
await get('成长', '/api/dayu/growth', (j) => `${j.stage || '?'}·${j.name || '?'} xp ${j.xp}`)
await get('能力表', '/api/dayu/authority', (j) => `开 ${(j.granted || []).length}/${(j.caps || []).length}`)
await get('分身池', '/api/dayu/pool', (j) => `${(j.workers || []).length} 个待命`)
await get('内置清单', '/api/dayu/builtin', (j) => `${j.count} 个模块`)
await get('插件本事', '/api/dayu/capabilities', (j) => `${(j.plugins || []).length} 个插件`)
await get('档案目录', '/api/xiaoyu/catalog', (j) => `${(j.entries || []).length} 本账`)
await get('全知', '/api/dayu/omni', (j) => `活 ${j.work?.jobs ?? '?'} 单 / 风险 ${j.risk?.risk || '?'}`)

console.log(`\n真机验收：通过 ${pass}，失败 ${fail}（${base}）`)
process.exit(fail ? 1 : 0)
