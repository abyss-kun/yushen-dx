// 隐私巡检：看 journal/story/memory 里有没有漏网的敏感串。只报文件名和数量，不打印内容。零模型。
// 用法：ELECTRON_RUN_AS_NODE=1 "<exe>" scripts/privacy-check.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { hasSecret } from '../lib/redact.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const targets = [
  path.join(DATA, 'journal'),
  path.join(DATA, 'story'),
  path.join(DATA, 'ideas'),
  path.join(DATA, 'soul', 'memory'),
  path.join(DATA, 'soul', 'cards'),
]
const findings = []
let scanned = 0
function walk(dir, depth = 0) {
  if (depth > 3) return
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { walk(full, depth + 1); continue }
    if (!/\.(json|jsonl|md|txt)$/i.test(e.name)) continue
    let text = ''
    try { text = fs.readFileSync(full, 'utf8') } catch { continue }
    scanned += 1
    if (hasSecret(text)) findings.push(path.relative(DATA, full))
  }
}
for (const dir of targets) walk(dir)
console.log(JSON.stringify({ ok: true, scanned, findings, note: findings.length ? '这些文件里还有敏感串，需人工处理' : '没发现明显凭据格式' }, null, 2))
