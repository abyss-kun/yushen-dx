// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 00:4x｜大鱼·子代理（说明格式）｜授权：主人（2026-11-10 23:4x：引导必须写、要有格式；一眼看过去就知道这东西干嘛的、谁的、我能不能动）｜scripts/test-notes-coverage.mjs:1-…｜新增｜为什么：字段补齐是一次性的活，补完没人盯，下一次改动又会漏；这份清单让"已经补过的"变成机器守着的东西｜验证：node scripts/test-notes-coverage.mjs 全过；清单里每个文件都真的带全字段｜可改：可改（断言只许改严；清单只加不减）
//
// 跑法：node scripts/test-notes-coverage.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIST = path.join(ROOT, 'scripts', 'notes-covered.json')

let pass = 0
let fail = 0
const ok = (name, fn) => {
  try { const d = fn(); pass += 1; console.log(`✓ ${name}${d ? ` — ${d}` : ''}`) }
  catch (e) { fail += 1; console.error(`✗ ${name} — ${e?.message || e}`) }
}

const covered = (() => {
  const raw = JSON.parse(fs.readFileSync(LIST, 'utf8'))
  assert.ok(Array.isArray(raw.files) && raw.files.length, 'notes-covered.json 里没有 files 数组')
  return raw.files
})()

ok(`① 已补齐清单合法：${covered.length} 个，无重复、路径都在`, () => {
  assert.equal(new Set(covered).size, covered.length, '清单里有重复')
  for (const rel of covered) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `清单里的文件不存在：${rel}`)
    // 2026-11-11 第二批：出厂范围扩到 core/ 与 dayu/（它们也是装给别人读的模块）；
    // 这不是放宽字段要求，只是把"哪些文件算出厂件"写全。
    assert.ok(/^(lib|core|dayu|dsh-memory)\//.test(rel), `清单里有不该在这的路径：${rel}`)
  }
  return `${covered.length} 个`
})

ok('② 清单里每个文件都带全字段（check-notes --require 退出 0）', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-notes.mjs'), '--require', covered.join(',')], { encoding: 'utf8', timeout: 120000 })
  assert.equal(r.status, 0, `有文件缺字段：\n${String(r.stderr || r.stdout || '').slice(0, 600)}`)
  return '全齐'
})

ok('③ 给角色的引导里，7 个旋钮一个不少', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', '引导-能力.md'), 'utf8')
  const knobs = ['软边界', '礼貌代发', '唤醒权重', '醒来那段', '熟练度', '心跳', '会话换班']
  const miss = knobs.filter((k) => !doc.includes(k))
  assert.deepEqual(miss, [], `引导里缺：${miss.join('、')}`)
  // 每个旋钮都要有"怎么关"或"怎么关掉"
  assert.ok((doc.match(/怎么关/g) || []).length >= 6, '引导里"怎么关"太少（每个旋钮都该有）')
  return knobs.join(' / ')
})

ok('④ 注入里那一行指针在，且 ≤60 字', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'brief.js'), 'utf8')
  const m = src.match(/'(·\s*7 个旋钮[^']*)'/)
  assert.ok(m, 'brief.js 里找不到"7 个旋钮"那一行')
  const line = m[1]
  assert.ok(line.length <= 60, `那一行 ${line.length} 字，超过 60：${line}`)
  assert.ok(line.includes('docs/引导-能力.md'), '那一行没指到引导文件')
  return `${line.length} 字：${line}`
})

ok('⑤ 说明格式文档在，且写清了必填字段与"怎么关"', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', '说明格式.md'), 'utf8')
  for (const k of ['audience', 'owner', 'mutable', 'usage', 'defaults', 'off', '怎么关']) {
    assert.ok(doc.includes(k), `说明格式里没写 ${k}`)
  }
  return '字段表在'
})

// 2026-11-11 第二批：缺口上限（只许降）。每补一批就把这个数调小；它涨了就红。
// 现在 110 = 第二批补完后的实际缺口（247 个文件里）。
const MAX_GAP = 0

ok(`⑥ 全仓缺口不许回升（上限 ${MAX_GAP}）`, () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-notes.mjs')], { encoding: 'utf8', timeout: 120000 })
  assert.equal(r.status, 0, `check-notes 自己跑挂了：${String(r.stderr || r.stdout || '').slice(0, 300)}`)
  const m = String(r.stdout || '').match(/缺字段 (\d+) 个/)
  assert.ok(m, `读不到缺口数：${String(r.stdout || '').slice(0, 200)}`)
  const gap = Number(m[1])
  assert.ok(gap <= MAX_GAP, `缺口从上限 ${MAX_GAP} 涨到 ${gap}——有人加了文件却没写说明，或者改文件头时把标签块弄丢了`)
  return `实际缺口 ${gap}（上限 ${MAX_GAP}）`
})

console.log('')
console.log(`说明字段覆盖：${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
