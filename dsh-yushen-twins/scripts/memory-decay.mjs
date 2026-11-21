/* 标签
 * id: memory-decay
 * kind: module
 * tags: 记忆, 淡忘, 冷档, 不删
 * created: 2026-11-04 20:10:00
 * changed: 2026-11-04 19:48:19
 * author: 照微·工作台
 * authority: 老板（2026-11-04：「淡忘这一层可以」）
 * why: 记忆只增不减，注入里又只能露 3 条——旧的会永久占着"被选中"的机会，最后谁也记不住
 * result: 超过 30 天、非 core、没被冻住的记忆标 cold（仍可查、可还原），注入不再选它；不删任何东西
 * mutable: 可改
 */
// 用法：
//   node scripts/memory-decay.mjs            # 真标（只标 cold，不删）
//   node scripts/memory-decay.mjs --dry      # 只看会标几条
//   node scripts/memory-decay.mjs --unmark   # 反悔：全部取回
//   node scripts/memory-decay.mjs --days 60  # 换阈值
//
// 为什么是"标 cold"而不是"搬到冷档文件"：
//   搬家会牵动索引、召回、合并三条链路（它们都按 memory/<role>.json 读）；
//   先标一个字段，读取方各自决定要不要看它——同样的效果，回退只要一个 --unmark。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const unmark = args.includes('--unmark')
const daysIdx = args.indexOf('--days')
const days = daysIdx >= 0 ? Math.max(1, Number(args[daysIdx + 1]) || 30) : 30

const { hardTimeout } = await import(pathToFileURL(path.join(ROOT, 'lib', 'offline-guard.js')).href)
hardTimeout(5, 'memory-decay.mjs')

const now = Date.now()
const out = { at: new Date(now).toISOString(), dry, unmark, days, roles: [] }

for (const role of ['dayu', 'xiaoyu', 'dragon']) {
  const file = path.join(D, 'soul', 'memory', `${role}.json`)
  if (!fs.existsSync(file)) continue
  let doc = null
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
  const evs = Array.isArray(doc.events) ? doc.events : []
  let changed = 0
  for (const e of evs) {
    if (!e || typeof e !== 'object') continue
    if (unmark) {
      if (e.cold) { delete e.cold; delete e.coldAt; changed += 1 }
      continue
    }
    const t = Date.parse(String(e.at || ''))
    if (!Number.isFinite(t)) continue
    if (e.tier === 'core') continue          // 常驻的永不淡忘
    if (e.supersededBy) continue             // 已被顶替的本来就不参选
    if (e.cold) continue                     // 已经标过
    if (now - t <= days * 86400e3) continue  // 还没到
    if (!dry) { e.cold = true; e.coldAt = new Date(now).toISOString() }
    changed += 1
  }
  if (changed && !dry) {
    try { fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8') } catch { /* 写不上就下一轮 */ }
  }
  out.roles.push({ role, events: evs.length, changed })
}

console.log(JSON.stringify(out, null, 2))
