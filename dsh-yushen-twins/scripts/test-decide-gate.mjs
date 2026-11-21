// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 00:2x｜大鱼·子代理（接线）｜授权：父代理任务书｜scripts/test-decide-gate.mjs:1-…｜新增｜为什么：gateOf 是决策口的闸门，判错一格就会"到线了还让她回"或"没到线就不让说"；而且它必须是纯函数——一有副作用就不能单测，也会在决策口偷偷写盘｜验证：node scripts/test-decide-gate.mjs 全过｜可改：可改（断言只许改严；四种情形不许减）
//
// 跑法：node scripts/test-decide-gate.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const G = await import(pathToFileURL(path.join(ROOT, 'lib', 'decide-gate.js')).href)

let pass = 0
let fail = 0
const ok = (name, fn) => {
  try { const d = fn(); pass += 1; console.log(`✓ ${name}${d ? ` — ${d}` : ''}`) }
  catch (e) { fail += 1; console.error(`✗ ${name} — ${e?.message || e}`) }
}

ok('① 没到线（normal）→ pass', () => {
  const r = G.gateOf({ phase: 'normal', canStepOut: false, why: '今天回了 1 句' })
  assert.equal(r.action, 'pass')
  assert.match(r.why, /回了 1 句/, 'why 该原样带上来')
  return r.action
})

ok('② 到软线（soft）+ 还有出口 → stepout（放行这一句）', () => {
  const r = G.gateOf({ phase: 'soft', canStepOut: true, why: '到软线了，正常该收手' })
  assert.equal(r.action, 'stepout')
  return r.action
})

ok('③ 到软线 + 出口用过 → silent（不发）', () => {
  const r = G.gateOf({ phase: 'soft', canStepOut: false, steppedOut: true, why: '今天那次出口已经用过了' })
  assert.equal(r.action, 'silent')
  assert.match(r.why, /用过了/)
  return r.action
})

ok('④ 到硬线（hard）+ 还有出口 → stepout（只许交代一句）', () => {
  const r = G.gateOf({ phase: 'hard', canStepOut: true, why: '到线就停，不能再聊' })
  assert.equal(r.action, 'stepout')
  return r.action
})

ok('⑤ 到硬线 + 没有出口 → silent', () => {
  const r = G.gateOf({ phase: 'hard', canStepOut: false, why: '到线就停' })
  assert.equal(r.action, 'silent')
  return r.action
})

ok('⑥ 脏输入不抛：null / {} / 缺 phase 都按 pass（没到线处理，不误拦）', () => {
  for (const v of [null, undefined, {}, { phase: '' }, 'x']) {
    const r = G.gateOf(v)
    assert.equal(r.action, 'pass', `脏输入该按 pass：${JSON.stringify(v)}`)
    assert.equal(typeof r.why, 'string')
  }
  return '5 种脏输入都不抛、都不误拦'
})

ok('⑦ 是纯函数：不写盘、不 import 模型/网络', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'decide-gate.js'), 'utf8')
  for (const bad of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'fetch(', 'chatLocal', 'sleepOnce', 'decideByBody', 'readFileSync']) {
    assert.ok(!src.includes(bad), `decide-gate 里出现了 ${bad}——闸门必须纯`)
  }
  // 只 import 了 node:assert 这类测试用不到的东西吗？模块本身应当零 import。
  assert.ok(!/^import /m.test(src), '模块本身不该 import 任何东西')
  const r = G.gateOf({ phase: 'normal' })
  assert.deepEqual(Object.keys(r).sort(), ['action', 'why'], '结果只许这两个字段')
  return '零 import、零写盘、结果只有 action/why'
})

console.log('')
console.log(`决策口闸门：${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
