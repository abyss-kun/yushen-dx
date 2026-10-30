// 通道记忆回写：她在 QQ（以及以后的通道）说过的话，收回本体那一份记忆。
//
// 为什么这是「礼物」而不是补丁：§4.5 说她的收件箱是感官、本体决定回不回；
// 但**出站**一直没人管——她说的话留在桥的 state 里，本体不知道。
// 结果就是：她有嘴，能顶嘴，顶完就忘（2026-10-26 实测：群里四句 0 命中记忆）。
//
// 方向：§7.4 依赖单向——鱼神读桥的 state，桥不知道鱼神存在。
// 所以这里是**拉**：桥在每条"自己说的话"上标了 role（2026-10-27 起），本体才知道那是谁说的。
//
// 边界（写死）：
//   · 只记带 role 的。老消息没归属，宁可不记——记错比漏记更糟。
//   · 不改、不删桥的任何东西。
//   · 幂等：appendEvent 自带「同通道+同文本+同一分钟」去重；这里再按游标只管新消息。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { bridgeStatePath } from './inbox.js'
import { appendEvent } from './memory.js'
import { listCharacters } from './characters.js'

/** 桥说的角色名不是 id（「小肥鱼」/「大肥鱼」），要翻成 id 才写得到那份记忆。
 * 2026-10-27 的坑：桥标的是「小肥鱼」，记忆按 id `xiaoyu` 找，结果一条都没写进去，
 * 游标还照样往前推进——账看起来在动，实际什么都没记。 */
export function resolveRole(name, { ids = null } = {}) {
  const raw = String(name || '').trim()
  if (!raw) return ''
  const rows = (() => { try { return ids || listCharacters() } catch { return [] } })()
  const hit = rows.find((c) => c.id === raw || c.name === raw || (c.alias && c.alias === raw))
  if (hit) return hit.id
  const TABLE = { 小肥鱼: 'xiaoyu', 大肥鱼: 'dayu', 龙娘: 'dragon', 照微: 'dragon', 小鱼: 'xiaoyu', 大鱼: 'dayu' }
  return TABLE[raw] || ''
}

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const CURSOR = path.join(DATA, 'state', 'channel-memory.json')

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/**
 * 从桥的会话里挑出「她自己说的、且知道是谁说的」。
 * 纯函数：给测试用，不碰磁盘。
 */
export function pickAttributed(conversations = {}, { sinceByKey = {}, now = Date.now(), maxAgeHours = 72, limit = 200 } = {}) {
  const out = []
  for (const [key, conv] of Object.entries(conversations || {})) {
    const list = Array.isArray(conv?.recentMessages) ? conv.recentMessages : []
    const since = Number(sinceByKey[key]) || 0
    for (const m of list) {
      if (!m || m.isSelf !== true) continue
      const role = String(m.role || '').trim()
      if (!role) continue // 没标归属：不猜
      const t = Number(m.time) || 0
      if (!t || t <= since) continue
      if (now - t > maxAgeHours * 3600 * 1000) continue
      const text = String(m.plain || m.text || '').trim()
      if (!text) continue
      out.push({ key, role, at: new Date(t).toISOString(), t, text })
    }
  }
  out.sort((a, b) => a.t - b.t)
  return out.slice(-Math.max(1, Number(limit) || 200))
}

/**
 * 跑一次回写：桥说的话 → 她自己的记忆。
 * @returns {{ok:boolean, scanned:number, appended:number, byRole:Object, rows:Array, reason?:string}}
 */
export function syncChannelMemory({ now = Date.now(), dryRun = false, limit = 200, ignoreCursor = false } = {}) {
  const statePath = bridgeStatePath()
  if (!statePath) return { ok: false, reason: '没找到桥的 state（桥没装，或 adapters/qq.json 没写 statePath）', scanned: 0, appended: 0, byRole: {}, rows: [] }
  const doc = readJson(statePath, null)
  if (!doc || typeof doc !== 'object') return { ok: false, reason: `读不了桥的 state：${statePath}`, scanned: 0, appended: 0, byRole: {}, rows: [] }

  const cursor = readJson(CURSOR, { version: 1, keys: {}, startedAt: '' })
  const rows = pickAttributed(doc.conversations, { sinceByKey: ignoreCursor ? {} : cursor.keys, now, limit })
  const result = { ok: true, statePath, scanned: rows.length, appended: 0, skipped: 0, byRole: {}, rows: [] }

  for (const r of rows) {
    // 桥说的是「小肥鱼」，记忆按 id 存。翻不过来就不写、也不推游标——留给下次再试，
    // 绝不"推进了但没记"（2026-10-27 就是这么丢了一整晚 QQ 的话）。
    const id = resolveRole(r.role)
    if (!id) {
      result.skipped += 1
      result.rows.push({ ...r, skipped: `角色名对不上：${r.role}` })
      continue
    }
    result.byRole[id] = (result.byRole[id] || 0) + 1
    if (dryRun) { result.rows.push({ ...r, roleId: id, dryRun: true }); continue }
    let ok = false
    try {
      const res = appendEvent(id, { channel: 'QQ', kind: 'say', text: r.text, at: r.at, source: `${r.key}#${r.t}` })
      ok = res?.appended === true || res?.duplicate === true
      if (res?.appended) result.appended += 1
      result.rows.push({ ...r, roleId: id, appended: res?.appended === true, duplicate: res?.duplicate === true })
    } catch (e) {
      result.rows.push({ ...r, roleId: id, error: String(e?.message || e) })
    }
    // 只有真写进去（或确认重复）才推进游标
    if (ok) cursor.keys[r.key] = Math.max(Number(cursor.keys[r.key]) || 0, r.t)
  }
  if (!dryRun && rows.length) {
    cursor.startedAt = cursor.startedAt || new Date(now).toISOString()
    cursor.updatedAt = new Date(now).toISOString()
    writeJson(CURSOR, cursor)
  }
  return result
}

/** 她这条通道说过多少、最近几条（给她自己看，也给老板查）。 */
export function channelMemoryStatus({ limit = 10 } = {}) {
  const cursor = readJson(CURSOR, { version: 1, keys: {}, startedAt: '' })
  const doc = readJson(bridgeStatePath(), null) || {}
  const rows = pickAttributed(doc.conversations, { sinceByKey: {}, now: Date.now(), maxAgeHours: 24 * 7, limit: 200 })
  const byRole = {}
  for (const r of rows) byRole[r.role] = (byRole[r.role] || 0) + 1
  return {
    ok: true,
    startedAt: cursor.startedAt || '',
    keys: Object.keys(cursor.keys || {}).length,
    recent: rows.slice(-limit).map((r) => ({ role: r.role, at: r.at, text: r.text.slice(0, 60) })),
    byRole,
    note: '只有带 role 的消息能回写；桥没标归属之前（2026-10-27 起才标）的话不会补记——记错比漏记更糟。',
  }
}
