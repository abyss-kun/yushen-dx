// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 接线体检：①配置里写了、代码里没人读的开关；②已经过期但还挂着的状态。
//
// 为什么新开一个脚本，而不是改 dead-exports.mjs：
//   dead-exports 管的是「导出了没人 import」；这里管的是「配置项/状态字段有没有人消费」——对象不同，
//   混进同一个脚本会让两边都难读。共用同一套扫描思路（读文件 → 找引用），不共用入口。
//
// 用法：
//   node scripts/wiring-audit.mjs            跑两类检查，出表
//   node scripts/wiring-audit.mjs --json     给机器读
//   node scripts/wiring-audit.mjs --strict   有发现就非零退出（给回归/维护用）
//   node scripts/wiring-audit.mjs --only=switches|expired
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const strict = argv.includes('--strict')
const onlyArg = argv.find((a) => a.startsWith('--only='))
const only = onlyArg ? onlyArg.slice(7).split(',').map((s) => s.trim()) : ['switches', 'expired']

// —— 代码面：把会被 `cfg.x` / `'x'` 读到的名字都收进来 ——
function codeCorpus() {
  const dirs = ['lib', 'dayu', 'core', 'scripts']
  const chunks = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (!/node_modules|\.snapshots|dist/.test(e.name)) walk(p); continue }
      if (!/\.(js|mjs)$/.test(e.name)) continue
      try { chunks.push(fs.readFileSync(p, 'utf8')) } catch { /* 读不了跳过 */ }
    }
  }
  for (const d of dirs) { const p = path.join(ROOT, d); if (fs.existsSync(p)) walk(p) }
  // QQ 桥的 config.json 是桥自己读的，不把桥的源码算进来就会一片假阳性。
  const bridgeSrc = path.join(process.env.YUSHEN_QQ_ROOT || 'D:/deepseekTools/qq-bridge', 'src')
  if (fs.existsSync(bridgeSrc)) walk(bridgeSrc)
  return chunks.join('\n')
}

/** 配置里挑出「像开关」的叶子键：布尔，或名字里带 enable/auto/notify/allow/use 之类。 */
const SWITCHY = /(enabled?|auto|allow|notify|enable|use|intercept|silent|strict|fallback|infinite|peakValley|noon|night|transcribe|dmMode|rotate|separate|vad)/i

function leaves(obj, prefix = '', out = []) {
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) { leaves(v, keyPath, out); continue }
    if (Array.isArray(v)) { out.push({ keyPath, key: k, value: `${v.length} 项` }); continue }
    out.push({ keyPath, key: k, value: v })
  }
  return out
}

function configFiles() {
  const list = [
    path.join(HOME, 'dayu', 'protection', 'config.json'),
    path.join(HOME, 'dayu', 'retention.json'),
    path.join(HOME, 'dayu', 'runtime', 'config.json'),
  ]
  const qq = process.env.YUSHEN_QQ_ROOT || 'D:/deepseekTools/qq-bridge'
  list.push(path.join(qq, 'config.json'))
  return list.filter((p) => { try { return fs.statSync(p).isFile() } catch { return false } })
}

function checkSwitches(corpus) {
  const rows = []
  for (const file of configFiles()) {
    let doc
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
    for (const leaf of leaves(doc)) {
      // tools.* / allow.* 是数据清单（被回环遍历），不是开关；别拿它们凑数。
      if (/^(tools|allow|deny)\./.test(leaf.keyPath)) continue
      const isBool = typeof leaf.value === 'boolean'
      if (!isBool && !SWITCHY.test(leaf.key)) continue
      // 代码里出现这个名字（作为属性名或字符串键）就算「有人读」
      const needle = leaf.key
      // 代码里出现这个标识符（按词边界）就算「有人读」——解构、默认值对象、字符串键都算消费。
      const used = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(corpus)
      if (!used) rows.push({ file: path.basename(file), key: leaf.keyPath, value: leaf.value })
    }
  }
  return rows
}

/** 扫状态文件里已过期的字段：名字像时间、值能解析成过去。 */
const EXPIRY_KEY = /(until|expire|expires|expiry|dueAt|dueIn|validUntil|deadline|expiresAt)/i

function walkJson(dir, depth = 0, out = []) {
  if (depth > 3) return out
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!/cold|objects|snapshots|store|node_modules/.test(e.name)) walkJson(p, depth + 1, out); continue }
    if (!/\.json$/.test(e.name) || e.name.includes('.bak')) continue
    out.push(p)
  }
  return out
}

function checkExpired() {
  const rows = []
  const roots = [path.join(HOME, 'dayu', 'runtime'), path.join(HOME, 'dayu', 'protection'), path.join(HOME, 'dayu')]
  const seen = new Set()
  // 这些是**历史记录**，过期是正常的，不当「过期状态」报：
  //   dispatch.json（旧单的 dueAt/手册有效期）、employees/（会话档案）、soul/memory（记忆有效期本就按设计过期）
  const HISTORICAL = /(dispatch\.json|employees[\\/]|soul[\\/]memory[\\/])/
  for (const root of roots) {
    for (const file of walkJson(root)) {
      if (seen.has(file)) continue
      seen.add(file)
      if (HISTORICAL.test(file)) continue
      let doc
      try { doc = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
      const stack = [{ obj: doc, prefix: '' }]
      while (stack.length) {
        const { obj, prefix } = stack.pop()
        if (!obj || typeof obj !== 'object') continue
        for (const [k, v] of Object.entries(obj)) {
          const keyPath = prefix ? `${prefix}.${k}` : k
          if (v && typeof v === 'object') { stack.push({ obj: v, prefix: keyPath }); continue }
          if (!EXPIRY_KEY.test(k)) continue
          let past = false
          if (typeof v === 'number' && v > 1e12) past = v < Date.now()
          else if (typeof v === 'string') { const t = Date.parse(v); past = Number.isFinite(t) && t < Date.now() }
          if (past) rows.push({ file: file.replace(HOME, '~/.dsh'), key: keyPath, value: String(v) })
        }
      }
    }
  }
  return rows
}

const corpus = codeCorpus()

// 豁免清单：确认「没人读、但先留着」的键，必须写清为什么留（见同目录 wiring-audit.allow.json）。
function allowList() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'wiring-audit.allow.json'), 'utf8')) } catch { return { switches: [], expired: [] } }
}
const allowed = allowList()
const allowedSwitch = new Set((allowed.switches || []).map((r) => `${r.file}::${r.key}`))

const result = {
  ok: true,
  at: new Date().toISOString(),
  switches: only.includes('switches') ? checkSwitches(corpus).filter((r) => !allowedSwitch.has(`${r.file}::${r.key}`)) : [],
  expired: only.includes('expired') ? checkExpired() : [],
  excused: only.includes('switches') ? checkSwitches(corpus).filter((r) => allowedSwitch.has(`${r.file}::${r.key}`)) : [],
}
result.ok = result.switches.length === 0 && result.expired.length === 0

if (asJson) {
  console.log(JSON.stringify(result, null, 1))
} else {
  console.log(`接线体检 · ${result.at}`)
  console.log(`\n① 配置里开了、代码里没人读（${result.switches.length}）`)
  for (const r of result.switches.slice(0, 40)) console.log(`  · ${r.file} → ${r.key} = ${JSON.stringify(r.value)}`)
  if (!result.switches.length) console.log('  （无）')
  console.log(`\n② 已经过期的状态（${result.expired.length}）`)
  for (const r of result.expired.slice(0, 40)) console.log(`  · ${r.file} → ${r.key} = ${r.value}（已过）`)
  if (!result.expired.length) console.log('  （无）')
  console.log(result.ok ? '\n✅ 没有发现' : '\n⚠️ 上面这些值得看一眼（不是都要修：有的是留着的手动开关）')
}

if (strict && !result.ok) process.exit(1)
