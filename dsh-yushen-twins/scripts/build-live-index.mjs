// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 实时抄录的总索引：日期 → 通道 → 标题 → 关键字，一眼扫。
// 2026-11-01 主人：原文在底、标注在中、索引在顶。
//
// 输出：~/.dsh/dayu/live/索引.md + 索引.jsonl
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const BASE = path.join(HOME, 'dayu', 'live')
const MD = path.join(BASE, '索引.md')
const JSONL = path.join(BASE, '索引.jsonl')

if (!fs.existsSync(BASE)) { console.log('还没有实时抄录'); process.exit(0) }

const rows = []
const walk = (dir) => {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (!e.name.endsWith('.md') || e.name === '索引.md') continue
    const rel = path.relative(BASE, p)
    const place = rel.split(path.sep)[0]
    let text = ''
    try { text = fs.readFileSync(p, 'utf8') } catch { continue }
    if (!text.startsWith('# ')) continue
    const date = (e.name.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || ''
    const title = (text.split('\n')[0] || '').replace(/^#\s*/, '').trim()
    const segs = (text.match(/^### /gm) || []).length
    const keys = [...text.matchAll(/^- 关键：(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean)
    const keyCount = {}
    for (const k of keys) for (const one of k.split(/[,，]\s*/)) keyCount[one] = (keyCount[one] || 0) + 1
    const topKeys = Object.entries(keyCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k)
    const st = fs.statSync(p)
    rows.push({ date, place, title, segs, keys: topKeys.join('、'), file: rel, bytes: st.size, mtime: st.mtimeMs })
  }
}
walk(BASE)
rows.sort((a, b) => (b.date + b.mtime).localeCompare(a.date + a.mtime))

fs.writeFileSync(JSONL, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8')
const md = [
  '# 实时抄录索引',
  '',
  `> 生成：${new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')}（Asia/Shanghai）`,
  `> 共 ${rows.length} 份。原文在各自文件里；这里只给"哪天、什么标题、讲了几段、关键字"。`,
  '',
  '| 日期 | 通道 | 标题 | 段数 | 关键字 |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.date} | ${r.place} | ${r.title} | ${r.segs} | ${r.keys || '—'} |`),
  '',
].join('\n')
fs.writeFileSync(MD, md, 'utf8')
console.log(`索引：${rows.length} 份 → ${MD}`)
