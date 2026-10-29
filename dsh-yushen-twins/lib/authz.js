// 半张能力表：只登记“插件自己真的能做的动作”，且真的拦。
// 表在 ~/.dsh/dayu/charter.json 的 authority.l2；没写 = 全开（兼容老数据）。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const CHARTER = path.join(DATA, 'charter.json')

export const CAPS = [
  { name: 'session.rotate', desc: '换班（开新总台、写交接）' },
  { name: 'session.cleanup', desc: '清理/标记空会话' },
  { name: 'pool.ensure', desc: '开分身（建待命会话）' },
  { name: 'incident.resolve', desc: '结事故单' },
  { name: 'growth.adjust', desc: '调成长阶位' },
  { name: 'owner.write', desc: '改老板设置（就职立约）' },
  { name: 'host.restart', desc: '重启 DSH（重载插件）' },
  { name: 'self.patch', desc: '把她自己写的补丁落地（会改插件文件）' },
  { name: 'exec.run', desc: '执行只读命令（写操作还要单独点头）' },
  { name: 'model.switch', desc: '给会话换模型（走 DSH 的 session/selectModel，不改配置）' },
]

function readCharter() {
  try { return JSON.parse(fs.readFileSync(CHARTER, 'utf8')) } catch { return {} }
}
function writeCharter(v) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = CHARTER + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2), 'utf8')
  fs.renameSync(tmp, CHARTER)
}

/** 当前开了哪些；没登记过就是全开（不把老用户锁在外面）。 */
export function granted() {
  const charter = readCharter()
  const list = charter?.authority?.l2
  if (!Array.isArray(list)) return CAPS.map((c) => c.name)
  return list.filter((name) => CAPS.some((c) => c.name === name))
}

export function has(cap) {
  return granted().includes(String(cap))
}

/** 真拦：没有就回 403，返回 false。 */
export function requireCap(res, cap, sendJson) {
  if (has(cap)) return true
  sendJson(res, 403, { ok: false, error: `没开这个能力：${cap}` })
  return false
}

export function setCap(cap, on, reason = '') {
  const name = String(cap || '')
  if (!CAPS.some((c) => c.name === name)) throw new Error(`没有这个能力：${name}`)
  const charter = readCharter()
  const current = granted()
  const next = on ? [...new Set([...current, name])] : current.filter((x) => x !== name)
  charter.authority = { ...(charter.authority || {}), l2: next }
  charter.authorityNote = String(reason || '').slice(0, 200)
  writeCharter(charter)
  return { ok: true, granted: next }
}
