// 动手前先看「别的轮子有没有被扎过钉子」：同一件事可能已经有人做了、做了一半、或做成了别的形状。
// 用法：ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/wheel-check.mjs 记忆
// 输出分五组：代码 / 文档 / 经验库 / 派活单 / 活会话；只读，不改任何东西。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const words = process.argv.slice(2).map((w) => String(w || '').trim()).filter(Boolean)
if (!words.length) {
  console.error('用法：wheel-check.mjs <关键词...>（例：记忆 / 重启 / 立绘）')
  process.exit(2)
}
const hit = (text) => words.some((w) => String(text || '').toLowerCase().includes(w.toLowerCase()))

function walk(dir, filter, out = [], depth = 0) {
  if (depth > 2) return out
  let rows = []
  try { rows = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const row of rows) {
    if (row.name === 'node_modules' || row.name === '.git' || row.name === 'dist' || row.name === 'release') continue
    const full = path.join(dir, row.name)
    if (row.isDirectory()) walk(full, filter, out, depth + 1)
    else if (filter(row.name)) out.push(full)
  }
  return out
}

const codeFiles = walk(ROOT, (n) => /\.(js|mjs)$/.test(n))
const docFiles = walk(ROOT, (n) => /\.md$/.test(n))
const report = { words, code: [], docs: [], solutions: [], dispatch: [], live: [] }

// 1) 代码：文件名或导出符号相关
for (const file of codeFiles) {
  const rel = path.relative(ROOT, file)
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { continue }
  const exports = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  const matchedExports = exports.filter(hit)
  if (hit(rel) || matchedExports.length) {
    report.code.push({ file: rel, exports: matchedExports.slice(0, 8), lines: text.split(/\r?\n/).length })
  }
}

// 2) 文档：命中行
for (const file of docFiles) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { continue }
  const lines = text.split(/\r?\n/)
  const hits = []
  lines.forEach((line, i) => { if (hit(line)) hits.push(`${i + 1}: ${line.trim().slice(0, 120)}`) })
  if (hits.length) report.docs.push({ file: path.relative(ROOT, file), hits: hits.slice(0, 2), total: hits.length })
}

// 3) 经验库
try {
  const dir = path.join(DATA, 'solutions')
  for (const name of fs.readdirSync(dir)) {
    if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue
    try {
      const row = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
      const blob = [row.problem, row.cause, row.solution, ...(row.tags || [])].join(' ')
      if (hit(blob)) report.solutions.push({ id: name.slice(0, 8), problem: String(row.problem || '').slice(0, 90), tags: row.tags || [] })
    } catch { /* 坏条目跳过 */ }
  }
} catch { /* 没有经验库 */ }

// 4) 派活单（未结的）
try {
  const rows = JSON.parse(fs.readFileSync(path.join(DATA, 'dispatch.json'), 'utf8'))
  for (const row of Array.isArray(rows) ? rows : []) {
    if (['done', 'cancelled'].includes(String(row.status))) continue
    if (hit(row.brief) || hit(row.expect)) report.dispatch.push({ id: row.id, status: row.status, brief: String(row.brief || '').slice(0, 90) })
  }
} catch { /* 没有派活账本 */ }

// 5) 活会话（宿主在线时）
try {
  const token = fs.readFileSync(path.join(DATA, 'api-token'), 'utf8').trim()
  const baseRaw = fs.readFileSync(path.join(DATA, 'base-url'), 'utf8').trim()
  const base = /^https?:\/\//.test(baseRaw) ? baseRaw : `http://${baseRaw}`
  const res = await fetch(`${base}/api/dayu/live?limit=60`, { headers: { 'x-yushen-token': token } })
  const json = await res.json()
  for (const row of json?.sessions || []) {
    if (hit(row.title) || hit(row.lastText) || hit(row.jobBrief)) {
      report.live.push({ id: String(row.id).replace(/^session-/, '').slice(0, 8), title: row.title || '(无标题)', status: row.status, lastAt: String(row.lastAt || '').slice(11, 16), doing: String(row.lastText || row.jobBrief || '').replace(/\s+/g, ' ').slice(0, 80) })
    }
  }
} catch { /* 宿主不在线就跳过 */ }

console.log(JSON.stringify(report, null, 2))
