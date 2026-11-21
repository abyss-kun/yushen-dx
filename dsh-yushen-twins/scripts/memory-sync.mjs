// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:12｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜scripts/memory-sync.mjs:59｜同步导出的默认文件名日期改走 clock｜为什么：手写偏移不是系统时间：换机器或换时区就全错，各处口径还不一致｜验证：node --check 通过；node scripts/regression.mjs 全绿；全仓扫描无手写偏移｜可改：可改（只许换成 lib/clock.js 的其他封装）
// 记忆同步：手机↔电脑，**各标各的，合并只增不改**。
// 用法：
//   node scripts/memory-sync.mjs export --out 同步-phone-2026-11-02.jsonl [--role dayu] [--days 7]
//   node scripts/memory-sync.mjs import --file 同步-phone-2026-11-02.jsonl
//   node scripts/memory-sync.mjs status
// 规则：
//   · 每条带 device（desktop / phone），导入时保留原标记，不改写成当前设备；
//   · 按 id 去重，只增不改——同 id 已存在就跳过，不覆盖正文；
//   · 不做双向自动合并：谁导出谁导入，由人决定方向。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { today } from '../lib/clock.js'
import { device } from '../lib/platform.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const MEM = path.join(HOME, 'dayu', 'soul', 'memory')
const ROLES = ['dayu', 'xiaoyu', 'dragon']

const argv = process.argv.slice(2)
const cmd = argv[0] || 'status'
const val = (n, d = '') => {
  const i = argv.indexOf('--' + n)
  return i >= 0 ? String(argv[i + 1] || '') : d
}

// 2026-11-02 手机端实测：导出只带热档 200，冷档不随迁 → 换机器就丢旧记忆。
// 冷档（runtime/记忆冷档/*.jsonl 与 runtime/<role>/记忆冷档/*.jsonl）一并导出，标 cold:true。
const readCold = (role) => {
  const rows = []
  const dirs = [
    path.join(HOME, 'dayu', 'runtime', '记忆冷档'),
    path.join(HOME, 'dayu', 'runtime', role, '记忆冷档'),
  ]
  for (const d of dirs) {
    let files = []
    try { files = fs.readdirSync(d).filter((f) => f.endsWith('.jsonl')) } catch { continue }
    for (const f of files) {
      try {
        for (const line of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
          if (!line.trim()) continue
          try { const ev = JSON.parse(line); if (ev && ev.text) rows.push({ ...ev, cold: true, coldFile: f }) } catch { /* 坏行跳过 */ }
        }
      } catch { /* 读不了就跳过 */ }
    }
  }
  return rows
}

const readRole = (role) => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(MEM, `${role}.json`), 'utf8').replace(/^\uFEFF/, ''))
    return Array.isArray(j.events) ? j.events : []
  } catch { return [] }
}

if (cmd === 'export') {
  const out = val('out') || `同步-${today()}.jsonl`
  const only = val('role', '')
  const days = Number(val('days', '0')) || 0
  const since = days ? Date.now() - days * 86400e3 : 0
  const rows = []
  for (const role of ROLES) {
    if (only && role !== only) continue
    for (const ev of [...readRole(role), ...readCold(role)]) {
      if (since && new Date(ev.at || 0).getTime() < since) continue
      // 2026-11-04：导出时补来源——老事件没 device 的，按“当前设备”标。
      // 只有本机产生的才会没标记（导入一定会写 device），所以这不是猜。
      rows.push({ role, ...ev, device: ev.device || device() })
    }
  }
  fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  const byDevice = rows.reduce((m, r) => { const d = r.device || '未标'; m[d] = (m[d] || 0) + 1; return m }, {})
  console.log(JSON.stringify({ ok: true, file: out, count: rows.length, byDevice }, null, 1))
  process.exit(0)
}

/** 把一批 incoming 合进本地记忆；只增不改、同 id 跳过。 */
function mergeIncoming(incoming, stats = { added: 0, skipped: 0, byDevice: {}, byRole: {} }) {
  for (const role of ROLES) {
    const mine = incoming.filter((r) => r.role === role)
    if (!mine.length) continue
    const f = path.join(MEM, `${role}.json`)
    let doc = null
    try { doc = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) } catch { doc = null }
    const events = Array.isArray(doc?.events) ? doc.events : []
    const have = new Set(events.map((e) => e.id).filter(Boolean))
    let added = 0
    for (const r of mine) {
      const id = r.id
      if (!id || have.has(id)) { stats.skipped++; continue }
      const { role: _drop, ...ev } = r
      // 保留原设备标记；没标就记“未知”，绝不改写成当前设备
      events.push({ ...ev, device: ev.device || 'unknown' })
      have.add(id)
      added++
      const d = ev.device || 'unknown'
      stats.byDevice[d] = (stats.byDevice[d] || 0) + 1
    }
    if (added) {
      const bak = f + '.bak-merge-' + Date.now()
      try { fs.copyFileSync(f, bak) } catch { /* 首次没有原文件 */ }
      const next = { ...(doc || { version: 1, summary: '', habits: [], dynamics: [], impressions: {} }), events, updatedAt: new Date().toISOString() }
      fs.writeFileSync(f, JSON.stringify(next, null, 1) + '\n', 'utf8')
      stats.added += added
      stats.byRole[role] = added
    }
  }
  return stats
}

function readLines(file) {
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return out
}

if (cmd === 'import') {
  const file = val('file')
  if (!file || !fs.existsSync(file)) { console.error('要一个文件：--file 同步-xxx.jsonl'); process.exit(2) }
  const stats = mergeIncoming(readLines(file))
  console.log(JSON.stringify({ ok: true, ...stats }, null, 1))
  process.exit(0)
}

// 2026-11-04：日常同步——只搬窗口内的新记忆（默认今天+昨天），对方的文件导入过就跳过。
// 用法：node scripts/memory-sync.mjs sync --dir <同步根目录> [--days 2] [--all]
// 目录约定：<同步根>/desktop/ 与 <同步根>/phone/，各自只放自己导出的。
if (cmd === 'sync') {
  const dir = val('dir', path.join(HOME, 'dayu', 'sync'))
  const days = Number(val('days', '2')) || 2
  const all = argv.includes('--all')
  const since = all ? 0 : Date.now() - days * 86400e3
  const dev = device()
  const peer = dev === 'phone' ? 'desktop' : 'phone'
  const folderOf = (d) => (d === 'phone' ? '手机' : '电脑')
  const mineDir = path.join(dir, folderOf(dev))
  const peerDir = path.join(dir, folderOf(peer))
  fs.mkdirSync(mineDir, { recursive: true })
  fs.mkdirSync(peerDir, { recursive: true })

  const rows = []
  for (const role of ROLES) {
    for (const ev of [...readRole(role), ...readCold(role)]) {
      if (since && new Date(ev.at || 0).getTime() < since) continue
      rows.push({ role, ...ev, device: ev.device || dev })
    }
  }
  let exported = null
  if (rows.length) {
    const now = new Date()
    const hms = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const file = path.join(mineDir, `${dev}-${today()}-${hms}.jsonl`)
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
    exported = { file, count: rows.length }
  }

  const stateFile = path.join(dir, '.state.json')
  let state = {}
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { state = {} }
  const done = new Set(Array.isArray(state.imported) ? state.imported : [])
  let files = 0
  const stats = { added: 0, skipped: 0, byDevice: {}, byRole: {} }
  for (const name of fs.readdirSync(peerDir).filter((f) => f.endsWith('.jsonl'))) {
    if (done.has(name)) continue
    const s = mergeIncoming(readLines(path.join(peerDir, name)))
    stats.added += s.added
    stats.skipped += s.skipped
    for (const [k, v] of Object.entries(s.byDevice)) stats.byDevice[k] = (stats.byDevice[k] || 0) + v
    for (const [k, v] of Object.entries(s.byRole)) stats.byRole[k] = (stats.byRole[k] || 0) + v
    done.add(name)
    files++
  }
  if (files) fs.writeFileSync(stateFile, JSON.stringify({ imported: [...done], updatedAt: new Date().toISOString() }, null, 1) + '\n', 'utf8')
  console.log(JSON.stringify({ ok: true, device: dev, exported, imported: { files, ...stats } }, null, 1))
  process.exit(0)
}

// status
const rows = []
for (const role of ROLES) for (const ev of readRole(role)) rows.push(ev)
const byDevice = rows.reduce((m, r) => { const d = r.device || '未标'; m[d] = (m[d] || 0) + 1; return m }, {})
console.log(JSON.stringify({ ok: true, total: rows.length, byDevice }, null, 1))
