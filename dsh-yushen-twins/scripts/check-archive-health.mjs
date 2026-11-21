// 归档健康检查（防线 B）
//
// 2026-11-02 小鱼。`archive-health.json` 是防线 A（每次归档跑完写一份），
// 这个脚本是防线 B：读它，判「有没有该报的」。
//
// 判两件事：
//   ① 归档多久没跑了（超过 --max-hours 就报，默认 24 小时）
//   ② 有没有解析不出的会话——**但 0 字节的空会话不算**：那是事故/清空留下的空壳，
//      报它会天天报假问题，报多了就没人看了。
//
// 用法：node scripts/check-archive-health.mjs [--max-hours=24] [--json]
// 退出码：0 = 健康；1 = 有问题（at 太久 / 有真·unparsable）；2 = health 文件不存在

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const HEALTH = path.join(HOME, 'dayu', 'archive-health.json')
const SESSIONS = path.join(HOME, 'sessions')

const args = process.argv.slice(2)
const maxHours = Number((args.find((a) => a.startsWith('--max-hours=')) || '').slice(12)) || 24
const asJson = args.includes('--json')

if (!fs.existsSync(HEALTH)) {
  if (asJson) console.log(JSON.stringify({ ok: false, reason: 'no-health-file' }))
  else console.error(`归档健康文件不存在：${HEALTH}（归档从没跑过，或版本太旧）`)
  process.exit(2)
}

let h
try {
  h = JSON.parse(fs.readFileSync(HEALTH, 'utf8').replace(/^\uFEFF/, ''))
} catch (e) {
  if (asJson) console.log(JSON.stringify({ ok: false, reason: 'bad-health-file' }))
  else console.error(`归档健康文件读不了：${String(e.message || e).slice(0, 120)}`)
  process.exit(2)
}

const at = Date.parse(h.at || '')
const hoursAgo = Number.isFinite(at) ? (Date.now() - at) / 3600000 : Infinity
const tooOld = !Number.isFinite(at) || hoursAgo > maxHours

// 0 字节的空会话不算问题：那是事故/清空留下的空壳。
// 2026-11-02 小鱼：size 在**产生时就记进 health**（防线 A 里 push 的是 {id,size}），
// 这样这里不用回头去 sessions 找源——源可能早就被清了，找不到就永远判成「真问题」，
// 变成天天报的假警报。老格式（只有 id 字符串）的 health 文件才回退去扫一遍。
const sizeById = new Map()
const scanSessions = (dir, depth = 0) => {
  if (depth > 6) return
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    if (!e.isDirectory()) continue
    const p = path.join(dir, e.name)
    if (e.name.startsWith('session-')) {
      const f = path.join(p, 'session.v4.jsonl.zstd')
      if (fs.existsSync(f)) { try { sizeById.set(e.name, fs.statSync(f).size) } catch { /* 读不到不算 */ } ; continue }
    }
    scanSessions(p, depth + 1)
  }
}
const unparsable = (h.unparsable || []).map((x) => {
  if (x && typeof x === 'object') return { id: String(x.id || ''), size: typeof x.size === 'number' ? x.size : null }
  // 老格式：只有 id，回头找源
  if (!sizeById.size) scanSessions(SESSIONS)
  return { id: String(x), size: sizeById.has(x) ? sizeById.get(x) : null }
})
// 2026-11-02 小鱼：判据从「size === 0」改成「size <= 64」。
// 实测那三个空会话是 **9 字节**——zstd 的空帧头，不是 0。
// 我第一版写 0 字节，是因为 PowerShell 的 Get-Item 显示「0 KB」把我骗了（四舍五入）。
const EMPTY_MAX = 64
const realOnes = unparsable.filter((x) => x.size === null || x.size > EMPTY_MAX)
const emptyOnes = unparsable.filter((x) => typeof x.size === 'number' && x.size <= EMPTY_MAX)

const problems = []
if (tooOld) problems.push(`归档 ${Number.isFinite(hoursAgo) ? hoursAgo.toFixed(1) + ' 小时前' : '时间未知'}，超过 ${maxHours} 小时没跑`)
if (realOnes.length) problems.push(`${realOnes.length} 个会话解析不出（不是空会话）：${realOnes.slice(0, 5).map((x) => x.id).join(', ')}`)

const out = {
  ok: problems.length === 0,
  at: h.at || '',
  hoursAgo: Number.isFinite(hoursAgo) ? Number(hoursAgo.toFixed(1)) : null,
  maxHours,
  written: h.written ?? null,
  unchanged: h.unchanged ?? null,
  unparsableTotal: unparsable.length,
  unparsableReal: realOnes.length,
  unparsableEmpty: emptyOnes.length,
  problems,
}

if (asJson) console.log(JSON.stringify(out, null, 1))
else {
  console.log(`归档：${out.hoursAgo === null ? '时间未知' : out.hoursAgo + ' 小时前'}（阈值 ${maxHours} 小时）· 上次写 ${out.written} / 没变 ${out.unchanged}`)
  console.log(`解析不出：${out.unparsableTotal} 个（其中空会话 ${out.unparsableEmpty} 个不算，真问题 ${out.unparsableReal} 个）`)
  if (out.ok) console.log('✓ 归档健康：没有要报的')
  else {
    console.log('✗ 有要报的：')
    for (const p of problems) console.log('  - ' + p)
  }
}
process.exit(out.ok ? 0 : 1)
