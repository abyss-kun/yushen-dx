// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 每日自审计：讨好数 + 空话数，写进 runtime/审计-<日期>.json
// 用法：node scripts/audit-daily.mjs [--days 1]
// 目的：这两个数不用我报、也不靠我记，每小时 tick 会刷一次。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const LIVE = path.join(HOME, 'dayu', 'live')
const OUT_DIR = path.join(HOME, 'dayu', 'runtime')
const daysIdx = process.argv.indexOf('--days')
const days = daysIdx >= 0 ? Number(process.argv[daysIdx + 1]) || 1 : 1

// 空话数：走现成脚本
let promises = -1
try {
  const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'promise-audit.mjs'), '--days', String(days)], { encoding: 'utf8', timeout: 60000 })
  const j = JSON.parse(String(r.stdout || '{}'))
  promises = Number(j.promises ?? -1)
} catch { /* 算不出就 -1 */ }

// 讨好数：数 live 里的固定句式（只数她说的那几段）
const PHRASE = /你说得对|你说得没错|您说得对/
let syc = 0
const walk = (dir) => {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (!e.name.endsWith('.md')) continue
    const st = fs.statSync(p)
    if (Date.now() - st.mtimeMs > days * 86400e3) continue
    const lines = fs.readFileSync(p, 'utf8').split('\n')
    for (const l of lines) if (PHRASE.test(l)) syc++
  }
}
walk(LIVE)

// 未完成诺言数（promise-book）
let openPromises = -1
let overdue = 0
try {
  const pf = path.join(HOME, 'dayu', 'promises', '诺言.jsonl')
  const rows = fs.readFileSync(pf, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const open = rows.filter((r) => r.status === 'open')
  openPromises = open.length
  const today = date
  overdue = open.filter((r) => r.when && /^\d{4}-\d{2}-\d{2}/.test(r.when) && r.when < today).length
} catch { /* 没有诺言本 */ }

// 手册发放（2026-11-01 老板：按需发放要能度量）：近 7 天发了几次、平均几节、噪声均值。
// 算不出来就记 0，别让审计脚本整体挂掉——但也不能因为没有数就当没这回事。
let handbook = { sends: 0, avgSections: 0, avgNoise: 0 }
try {
  const mod = await import('../lib/handbook.js')
  const s = mod.handbookSendStats({ days: 7 })
  handbook = { sends: s.sends, avgSections: s.avgSections, avgNoise: s.avgNoise }
} catch { /* 读不到发放记录就留 0 */ }

fs.mkdirSync(OUT_DIR, { recursive: true })
const date = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const file = path.join(OUT_DIR, `审计-${date}.json`)
let prev = {}
try { prev = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* 首次 */ }
const row = {
  date,
  at: new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
  days,
  sycophancy: syc,
  emptyPromises: promises,
  sycFirst: prev.sycFirst ?? syc,
  emptyFirst: prev.emptyFirst ?? promises,
  promisesOpen: openPromises,
  promisesOverdue: overdue,
  // 按需发放的度量：sends 次数 / avgSections 平均节数 / avgNoise 噪声均值（使用率见 handbook-audit）
  handbook,
}
fs.writeFileSync(file, JSON.stringify(row, null, 2) + '\n', 'utf8')
console.log(`审计 ${date}：讨好 ${syc}（当天首次 ${row.sycFirst}） · 空话 ${promises}（当天首次 ${row.emptyFirst}） · 手册发放 ${handbook.sends} 次/噪声 ${handbook.avgNoise} → ${file}`)
