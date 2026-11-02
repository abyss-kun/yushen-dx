// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 时间点还原：把她的东西（和插件）退回到某个时刻之前最近的一份快照。
//
// 和 scripts/rollback.mjs 的区别：那个只退 dist 代码、不动数据；
// 这个退的是「人」——卡、记忆、书、外观、账，以及插件代码。
//
// 用法：
//   node scripts/restore-to.mjs                          # 列快照
//   node scripts/restore-to.mjs --at "2026-10-31 18:10"   # 选该时刻前最近一份
//   node scripts/restore-to.mjs --at "..." --apply        # 真还原（先冷备现网）
//   node scripts/restore-to.mjs --id <快照id> [--apply]
//
// 默认只预览，不写盘。--apply 会先把现网受影响目录冷备到 D:\DSH\备份\pre-restore-<时间>。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'

const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const store = path.join(HOME, 'dayu', 'protection', 'store')
const snapsDir = path.join(store, 'snapshots')
const cfg = JSON.parse(fs.readFileSync(path.join(HOME, 'dayu', 'protection', 'config.json'), 'utf8').replace(/^\uFEFF/, ''))

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? String(process.argv[i + 1] || '') : ''
}
const apply = process.argv.includes('--apply')

function list() {
  if (!fs.existsSync(snapsDir)) return []
  return fs.readdirSync(snapsDir).filter((n) => n.endsWith('.json')).sort().map((n) => {
    const id = n.replace(/\.json$/, '')
    let at = '', files = 0
    try {
      const j = JSON.parse(fs.readFileSync(path.join(snapsDir, n), 'utf8'))
      at = j.createdAt || ''
      files = (j.files || []).length
    } catch { /* 坏的就跳过信息 */ }
    return { id, at, files }
  })
}

const all = list()
if (!all.length) { console.error('还没有任何快照。'); process.exit(1) }

const wantId = arg('id')
const at = arg('at')
let pick = null
if (wantId) pick = all.find((s) => s.id === wantId) || null
else if (at) {
  const t = Date.parse(at.replace(' ', 'T'))
  if (!Number.isFinite(t)) { console.error('--at 看不懂：', at); process.exit(1) }
  pick = [...all].reverse().find((s) => Date.parse(s.at) <= t) || null
}

if (!pick) {
  console.log('最近 12 份快照（旧 → 新）：')
  for (const s of all.slice(-12)) console.log(`- ${s.id}  ${s.at}  ${s.files} 个文件`)
  console.log('\n用法：--at "YYYY-MM-DD HH:mm" [--apply]   或   --id <快照id> [--apply]')
  process.exit(0)
}

const engine = await import(pathToFileURL(P + '/lib/versioned-backup.js').href)
await engine.verifySnapshot({ store, id: pick.id, maxFileBytes: cfg.maxFileBytes })
const snapJson = JSON.parse(fs.readFileSync(path.join(snapsDir, pick.id + '.json'), 'utf8'))

console.log(`快照：${pick.id}`)
console.log(`时间：${pick.at}`)
console.log(`文件：${pick.files}`)
console.log('范围：' + (snapJson.roots || []).map((r) => r.id || r).join(', '))

if (!apply) {
  console.log('\n这是预览（不写盘）。加 --apply 才会还原，且会先冷备现网。')
  process.exit(0)
}

// 冷备现网受影响目录
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const coldDir = path.join('D:', 'DSH', '备份', `pre-restore-${stamp}`)
fs.mkdirSync(coldDir, { recursive: true })
for (const r of cfg.roots) {
  if (!fs.existsSync(r.path)) continue
  const dst = path.join(coldDir, r.id)
  fs.cpSync(r.path, dst, { recursive: true })
}
console.log('现网已冷备：' + coldDir)

const out = await engine.restoreSnapshot({ store, id: pick.id, roots: cfg.roots, apply: true, maxFileBytes: cfg.maxFileBytes })
const changes = out?.changes || []
console.log(`已还原：新增 ${changes.filter((c) => c.action === 'create').length}、覆盖 ${changes.filter((c) => c.action === 'update').length}、删除 ${changes.filter((c) => c.action === 'delete').length}`)
console.log('下一步：重启 DSH，再跑 node scripts/restore-drill.mjs 复核。')
