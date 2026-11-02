// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
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
  const out = val('out') || `同步-${new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)}.jsonl`
  const only = val('role', '')
  const days = Number(val('days', '0')) || 0
  const since = days ? Date.now() - days * 86400e3 : 0
  const rows = []
  for (const role of ROLES) {
    if (only && role !== only) continue
    for (const ev of [...readRole(role), ...readCold(role)]) {
      if (since && new Date(ev.at || 0).getTime() < since) continue
      rows.push({ role, ...ev })
    }
  }
  fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  const byDevice = rows.reduce((m, r) => { const d = r.device || '未标'; m[d] = (m[d] || 0) + 1; return m }, {})
  console.log(JSON.stringify({ ok: true, file: out, count: rows.length, byDevice }, null, 1))
  process.exit(0)
}

if (cmd === 'import') {
  const file = val('file')
  if (!file || !fs.existsSync(file)) { console.error('要一个文件：--file 同步-xxx.jsonl'); process.exit(2) }
  const incoming = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { incoming.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  const stats = { added: 0, skipped: 0, byDevice: {}, byRole: {} }
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
  console.log(JSON.stringify({ ok: true, ...stats }, null, 1))
  process.exit(0)
}

// status
const rows = []
for (const role of ROLES) for (const ev of readRole(role)) rows.push(ev)
const byDevice = rows.reduce((m, r) => { const d = r.device || '未标'; m[d] = (m[d] || 0) + 1; return m }, {})
console.log(JSON.stringify({ ok: true, total: rows.length, byDevice }, null, 1))
