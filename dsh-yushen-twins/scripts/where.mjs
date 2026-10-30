// 规定在哪：按关键词定位到文件+行号。只读本地，不调模型。
// 用法：ELECTRON_RUN_AS_NODE=1 "<exe>" scripts/where.mjs 问不到
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { workspace } from '../lib/paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const ROOT = workspace()
const PLUGIN = path.join(ROOT, 'dsh-yushen-twins')
const q = process.argv.slice(2).join(' ').trim()
if (!q) {
  console.error('用法：where.mjs <关键词>')
  process.exitCode = 2
} else {
  const files = [
    path.join(ROOT, '员工手册.md'),
    path.join(PLUGIN, 'docs', '员工手册.md'),
    path.join(PLUGIN, 'lib', 'handbook-policy.js'),
    path.join(PLUGIN, 'kernel', 'charter.default.json'),
    path.join(PLUGIN, 'docs', '点化灵智.md'),
    path.join(PLUGIN, 'docs', '规则地图.md'),
    path.join(ROOT, 'AGENTS.md'),
    'D:\\AiTOOLS\\AGENTS.md',
    path.join(HOME, 'dayu', 'soul', 'cards', 'dayu.desk.md'),
  ]
  for (const f of fs.existsSync(path.join(HOME, 'dayu', 'soul', 'cards')) ? fs.readdirSync(path.join(HOME, 'dayu', 'soul', 'cards')).filter((n) => n.endsWith('.md')).map((n) => path.join(HOME, 'dayu', 'soul', 'cards', n)) : []) files.push(f)
  const hits = []
  for (const file of files) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => { if (line.includes(q)) hits.push({ file: path.relative(ROOT, file) || file, line: i + 1, text: line.trim().slice(0, 160) }) })
  }
  console.log(JSON.stringify({ ok: true, q, count: hits.length, hits: hits.slice(0, 30) }, null, 2))
}
