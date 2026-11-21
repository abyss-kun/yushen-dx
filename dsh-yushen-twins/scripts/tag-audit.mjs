/* 标签
 * id: tag-audit
 * kind: module
 * tags: 标签, 体检, 只读
 * created: 未标注（补标签前的历史）
 * changed: 2026-11-04 00:06:58
 * author: 照微·工作台
 * authority: 老板（2026-11-03：不管什么只要改动/新增都要有标签）
 * why: 统一给对象加标签，方便按需提取与对账
 * result: 有标签块；审计能取到
 * mutable: 可改
 */
// 标签体检（只读，2026-11-03 老板：「每个都应该有标签」）：
// 扫 lib/*.js、scripts/*.mjs、docs/*.md、README 之类，看谁有标签块、谁没有。
// 只报数、不写文件；要不要补由人决定（注释块里带谁改的/谁让的，机器不能替人编）。
//
// 用法：
//   node scripts/tag-audit.mjs            # 汇总 + 前 20 个没标签的
//   node scripts/tag-audit.mjs --json     # 机器可读
//   node scripts/tag-audit.mjs --all      # 列出全部缺失
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTags, staleTaggedFiles } from '../lib/tags.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const json = args.has('--json')
const all = args.has('--all')

const GROUPS = [
  ['lib', (n) => n.endsWith('.js')],
  ['scripts', (n) => n.endsWith('.mjs') && !n.startsWith('_')],
  ['docs', (n) => n.endsWith('.md')],
  ['core', (n) => n.endsWith('.js')],
  ['dayu', (n) => n.endsWith('.js')],
]

const rows = []
for (const [dir, pick] of GROUPS) {
  const full = path.join(ROOT, dir)
  if (!fs.existsSync(full)) continue
  for (const name of fs.readdirSync(full)) {
    if (!pick(name)) continue
    const file = path.join(full, name)
    let st = null
    try { st = fs.statSync(file) } catch { continue }
    if (!st.isFile()) continue
    const { found, tags } = readTags(file)
    rows.push({ kind: dir, file: `${dir}/${name}`, tagged: found, tags })
  }
}

const byKind = {}
for (const r of rows) {
  byKind[r.kind] = byKind[r.kind] || { total: 0, tagged: 0 }
  byKind[r.kind].total += 1
  if (r.tagged) byKind[r.kind].tagged += 1
}
const missing = rows.filter((r) => !r.tagged)
const total = rows.length
const tagged = total - missing.length

const stale = staleTaggedFiles(rows.map((r) => path.join(ROOT, r.file)))

if (json) {
  console.log(JSON.stringify({ total, tagged, missing: missing.length, stale: stale.length, staleRows: stale, byKind, rows: all ? rows : missing.slice(0, 20) }, null, 2))
  process.exit(args.has('--strict') && stale.length ? 1 : 0)
}

console.log(`共 ${total} 个对象，有标签 ${tagged}，缺 ${missing.length}。`)
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(8)} ${v.tagged}/${v.total}`)
if (stale.length) {
  console.log(`\n⚠ 改了内容没改标签：${stale.length} 个（改了内容就要做标注，老板 2026-11-03）`)
  for (const s of stale.slice(0, 20)) console.log(`  - ${path.relative(ROOT, s.file).replace(/\\/g, '/')}（文件比标签晚 ${s.driftSec}s：标签 ${s.changed}）`)
}
if (missing.length) {
  console.log('\n先补这些（别一次全扫；一个文件一块，字段照 docs/标签约定.md）：')
  for (const r of (all ? missing : missing.slice(0, 20))) console.log(`  - ${r.file}`)
  if (!all && missing.length > 20) console.log(`  …还有 ${missing.length - 20} 个（--all 看全部）`)
}
if (args.has('--strict') && stale.length) process.exit(1)
