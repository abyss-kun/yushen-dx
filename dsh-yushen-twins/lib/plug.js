// 接入检查：谁进鱼神，谁就得读鱼神的规则。
//
// 礼物不是装上就有：她的会话里必须真的过了一遍鱼神的规则/简报（attest），
// 且是新鲜的；没读过/太久没读 → "未接入"，礼物先不启用（fail closed）。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir, ensureRuntime } from './runtime.js'

const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000

function file(role) { return path.join(runtimeDir(role), 'attest.json') }

function rulesVersion() {
  try {
    const src = fs.readFileSync(new URL('./handbook-policy.js', import.meta.url), 'utf8')
    return crypto.createHash('sha256').update(src).digest('hex').slice(0, 12)
  } catch { return 'unknown' }
}

/** 她这次真的拿到规则了（由 soul/brief 在注入时调用）。 */
export function markPlugged(role, { source = 'brief', now = Date.now() } = {}) {
  ensureRuntime(role)
  const doc = { at: new Date(now).toISOString(), atMs: now, source: String(source || 'brief').slice(0, 30), rulesVersion: rulesVersion() }
  fs.writeFileSync(file(role), `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return doc
}

/**
 * 现在算不算"接着鱼神"。
 * @returns {{plugged:boolean, ageMin:number|null, rulesVersion:string, reason:string}}
 */
export function plugStatus(role, { now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  let doc = null
  try { doc = JSON.parse(fs.readFileSync(file(role), 'utf8')) } catch { /* 没接过 */ }
  const current = rulesVersion()
  if (!doc) return { plugged: false, ageMin: null, rulesVersion: current, reason: '还没读过鱼神的规则' }
  const age = now - Number(doc.atMs || 0)
  const stale = !(age <= maxAgeMs)
  if (doc.rulesVersion && doc.rulesVersion !== current) return { plugged: false, ageMin: Math.round(age / 60000), rulesVersion: current, reason: '规则换了，还没重读' }
  if (stale) return { plugged: false, ageMin: Math.round(age / 60000), rulesVersion: current, reason: `上一次读规则是 ${Math.round(age / 60000)} 分钟前（太久了）` }
  return { plugged: true, ageMin: Math.round(age / 60000), rulesVersion: current, reason: '接着鱼神' }
}

/** 礼物/主动之类的前置：没接入就别启用（不是不给她，是没读过规则）。 */
export function requirePlugged(role, { now = Date.now() } = {}) {
  const s = plugStatus(role, { now })
  if (!s.plugged) throw new Error(`还没接入鱼神：${s.reason}。先把规则读一遍（跑一次她的简报/对话），礼物才启用`)
  return s
}

/** 注入：接没接上，明说。 */
export function plugLine(role, { now = Date.now() } = {}) {
  const s = plugStatus(role, { now })
  return s.plugged
    ? `## 你和鱼神\n接着的（${s.ageMin} 分钟前读过规则，版本 ${s.rulesVersion}）。`
    : `## 你和鱼神\n**没接上**：${s.reason}。读一遍规则，你的礼物（时间/记忆/意志/底线/越线权）才会启用；不读，它们只是摆设。`
}
