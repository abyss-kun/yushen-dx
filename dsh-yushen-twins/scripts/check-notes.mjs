// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-10 23:5x｜大鱼·主代理｜授权：主人（2026-11-10 23:4x：引导必须写，要有格式；一眼看过去就知道这东西干嘛的、谁的、我能不能动）｜scripts/check-notes.mjs:1-…｜新增｜为什么：说明字段靠自觉一定会漏；漏了就变成"文档里写着、代码里没有"，下一个人还是看不懂｜验证：node scripts/check-notes.mjs 能列出缺口；--require 指定的文件缺字段则退出 1｜可改：可改（字段表只增不减；报错措辞别改成含糊话）
//
// 用法：
//   node scripts/check-notes.mjs                     # 列出所有缺口（不红，只报）
//   node scripts/check-notes.mjs --require a.js,b.js # 这些文件必须带全字段，缺一个退出 1
//   node scripts/check-notes.mjs --json              # 给回归/机器吃
//
// 扫什么：lib/*.js、dayu/*.js、core/*.js、dsh-memory/index.js 的 `/* 标签 *\/` 头。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REQUIRED = ['id', 'kind', 'summary', 'audience', 'owner', 'mutable', 'usage']
const OPTIONAL_PAIR = [['defaults', 'off']] // 有 defaults 就必须有 off（有旋钮必写怎么关）

function parseHead(text) {
  const m = text.match(/\/\*\s*标签\s*\n([\s\S]*?)\*\//)
  if (!m) return null
  const out = {}
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^\s*\*\s*([a-zA-Z_一-龥]+)\s*:\s*(.*)$/)
    if (mm) out[mm[1]] = mm[2].trim()
  }
  return out
}

function listTargets() {
  const out = []
  for (const dir of ['lib', 'dayu', 'core']) {
    const full = path.join(ROOT, dir)
    if (!fs.existsSync(full)) continue
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith('.js')) out.push(path.join(dir, name))
    }
  }
  const memoryEntry = 'dsh-memory/index.js'
  if (fs.existsSync(path.join(ROOT, memoryEntry))) out.push(memoryEntry)
  return out
}

function gapsOf(rel) {
  let text = ''
  try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { return ['（读不到）'] }
  const head = parseHead(text)
  if (!head) return ['（没有标签块）']
  const miss = REQUIRED.filter((k) => !head[k])
  for (const [a, b] of OPTIONAL_PAIR) if (head[a] && !head[b]) miss.push(`${b}（有 ${a} 就必须写怎么关）`)
  return miss
}

const argv = process.argv.slice(2)
const requireArg = (() => { const i = argv.indexOf('--require'); return i >= 0 ? String(argv[i + 1] || '') : '' })()
const asJson = argv.includes('--json')

const targets = listTargets()
const report = targets.map((rel) => ({ file: rel, missing: gapsOf(rel) }))
if (asJson) {
  console.log(JSON.stringify({ required: REQUIRED, items: report, gaps: report.filter((r) => r.missing.length).length }, null, 2))
} else {
  const bad = report.filter((r) => r.missing.length)
  for (const r of bad) console.log(`✗ ${r.file} — 缺：${r.missing.join('、')}`)
  console.log(`\n扫了 ${report.length} 个文件，缺字段 ${bad.length} 个（字段表：${REQUIRED.join(' / ')}）`)
}

if (requireArg) {
  const norm = (s) => String(s || '').replace(/\\/g, '/').trim()
  const list = requireArg.split(',').map(norm).filter(Boolean)
  const failed = []
  for (const rel of list) {
    const hit = report.find((r) => norm(r.file) === rel)
    if (!hit) failed.push(`${rel}（不在扫描范围）`)
    else if (hit.missing.length) failed.push(`${rel}（缺 ${hit.missing.join('、')}）`)
  }
  if (failed.length) {
    console.error(`\n必须带全说明的文件没带：\n- ${failed.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`\n必须带全说明的 ${list.length} 个文件都齐了`)
}
