// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 无主记忆清单：把「推不出是谁记的」那几行摊开，给人判——归谁、降级、还是留 unknown。
//
// 2026-11-04 老板问「第 3 项是什么，干嘛用的」：这就是它。分库/按角色检索之前必须有人看过，
// 不然要么硬猜（猜错就污染她的记忆），要么悄悄丢（丢证据）。这里只读、只写一份清单文件。
//
// 用法：
//   node scripts/unknown-list.mjs            # 写档案/记忆-无主清单-<今天>.md
//   node scripts/unknown-list.mjs --print    # 只打印统计，不写文件
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { today } from '../lib/clock.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const LIB = path.join(HOME, 'dayu', 'library')
const LAYERS = ['手抄本', '待提炼', '在用']
const OUT_DIR = 'D:/DSH/大小鱼/档案'
const printOnly = process.argv.includes('--print')

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.jsonl')) out.push(p)
  }
  return out
}

const rows = []
for (const layer of LAYERS) {
  for (const file of walk(path.join(LIB, layer))) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      let r
      try { r = JSON.parse(line) } catch { continue }
      if (r.role && r.role !== 'unknown') continue
      rows.push({
        layer,
        file: path.relative(LIB, file),
        at: String(r.at || '').slice(0, 19),
        channel: String(r.channel || ''),
        kind: String(r.kind || r.type || ''),
        head: String(r.head || r.text || r.detail || '').replace(/\s+/g, ' ').slice(0, 60),
        ref: String(r.ref || r.fromRef || '').slice(0, 80),
      })
    }
  }
}
rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

const counts = {}
for (const r of rows) counts[r.layer] = (counts[r.layer] || 0) + 1
const summary = { total: rows.length, byLayer: counts, out: '' }

if (!printOnly) {
  const day = today()
  const file = path.join(OUT_DIR, `记忆-无主清单-${day}.md`)
  const lines = [
    `# 记忆·无主清单（${day}）`,
    '',
    `> role 缺失或 unknown 的行：**${rows.length}** 条（${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' / ')}）。`,
    '> 用途：分库/按角色检索前，先有人判「归谁 / 降级 / 留 unknown」。这里只列，不改任何记忆文件。',
    '> 判法：在最后一列写 `dayu` / `xiaoyu` / `dragon` / `留`；写完告诉我，我按这个回填并记账。',
    '',
    ['| 时间 | 层 | 通道 | 类型 | 首句 | 出处 | 判 |'].join(''),
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.at} | ${r.layer} | ${r.channel} | ${r.kind} | ${r.head.replace(/\|/g, '\\|')} | ${r.ref.replace(/\|/g, '\\|')} |  |`),
    '',
  ]
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(file, lines.join('\n'), 'utf8')
  summary.out = file
}
console.log(JSON.stringify(summary, null, 1))
