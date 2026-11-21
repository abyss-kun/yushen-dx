// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
// 改｜2026-11-03 15:3x｜大鱼·工作台｜授权：老板（「都做」：让攒话有内容、注入加指令、工作台主动推送）｜scripts/test-self-push.mjs:1-140｜新增：主动推送的 6 组用例｜为什么：「她攒着的话从来没被端到老板眼前」这事不能只靠人眼盯，得有断言｜验证：& $node scripts/test-self-push.mjs 全过｜可改：可加不可删
// 主动推送（lib/self-push.js）的用例：都跑在临时数据目录里，不碰真家。
//
//   & $node scripts/test-self-push.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { buildPush, markPushed, pushPaths, SLOTS, MIN_GAP_MS } from '../lib/self-push.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-self-push-'))
const role = 'dayu'
const paths = pushPaths(role, { dataDir: root })
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', 'utf8') }

// 固定一个“在推送时段内”的本地时间：选 SLOTS 第一个时段的正中间
const [from, to] = SLOTS[0]
const atSlot = new Date(2026, 10, 3, Math.floor((from + to) / 2), 0, 0).getTime()
const atOffSlot = new Date(2026, 10, 3, 3, 0, 0).getTime() // 凌晨 3 点，不在时段

let pass = 0
const check = (name, fn) => { try { fn(); console.log('PASS ', name); pass += 1 } catch (e) { console.log('FAIL ', name, '->', e?.message || e); process.exitCode = 1 } }

try {
  // ① 什么都没有 → 不推
  check('没攒话、没逾期 → 不推', () => {
    const r = buildPush(role, { dataDir: root, now: atSlot })
    assert.equal(r.push, false)
    assert.equal(r.reason, 'nothing-new')
  })

  // ② 有攒话、但不在时段 → 不推（除非 force）
  check('攒了话但不在时段 → 不推；force 才推', () => {
    write(paths.news, { items: [{ at: new Date(atSlot).toISOString(), what: '想说第一件' }] })
    const off = buildPush(role, { dataDir: root, now: atOffSlot })
    assert.equal(off.push, false)
    assert.equal(off.reason, 'off-slot')
    const forced = buildPush(role, { dataDir: root, now: atOffSlot, force: true })
    assert.equal(forced.push, true)
    assert.match(forced.text, /想说第一件/)
  })

  // ③ 时段内、有新内容 → 推，文案带条数
  check('时段内 + 新攒话 → 推，且文案说清攒了几件', () => {
    const r = buildPush(role, { dataDir: root, now: atSlot })
    assert.equal(r.push, true)
    assert.match(r.text, /攒着 1 件/)
    assert.match(r.text, /想说第一件/)
  })

  // ④ 推完记水位：同样的内容不再推；再加一条又能推
  check('推过的不重复；加了新的才再推', () => {
    const r = buildPush(role, { dataDir: root, now: atSlot })
    assert.equal(markPushed(role, r, { dataDir: root, now: atSlot }), true)
    const again = buildPush(role, { dataDir: root, now: atSlot + 10 * 3600 * 1000 })
    assert.equal(again.push, false, '同一批内容不该重复推')
    assert.ok(['nothing-new', 'too-soon'].includes(again.reason))

    const doc = JSON.parse(fs.readFileSync(paths.news, 'utf8'))
    doc.items.push({ at: new Date(atSlot + 1000).toISOString(), what: '想说第二件' })
    write(paths.news, doc)
    // +8h 正好是 22:00（在第二个时段里），且刚好够 8 小时间隔
    const next = buildPush(role, { dataDir: root, now: atSlot + 8 * 60 * 60 * 1000 })
    assert.equal(next.push, true)
    assert.match(next.text, /想说第二件/)
  })

  // ⑤ 逾期承诺要进文案，未到期的不进
  check('逾期承诺进文案，没到期的不算', () => {
    const now = atSlot + 48 * 60 * 60 * 1000
    write(paths.promises, [
      { id: 'p1', who: '老板', what: '把查询改写接上', madeAt: new Date(now - 5 * 86400000).toISOString(), dueAt: new Date(now - 26 * 3600000).toISOString(), status: 'open' },
      { id: 'p2', who: '老板', what: '明天再说的事', madeAt: new Date(now).toISOString(), dueAt: new Date(now + 48 * 3600000).toISOString(), status: 'open' },
      { id: 'p3', who: '老板', what: '已经做到的', madeAt: new Date(now - 86400000).toISOString(), dueAt: new Date(now - 86400000).toISOString(), status: 'kept' },
    ].map((x) => JSON.stringify(x)).join('\n') + '\n')
    const r = buildPush(role, { dataDir: root, now, force: true })
    assert.equal(r.push, true)
    assert.equal(r.overdue, 1)
    assert.match(r.text, /把查询改写接上/)
    assert.equal(r.text.includes('明天再说的事'), false, '没到期的承诺不该出现')
    assert.equal(r.text.includes('已经做到的'), false, '已兑现的不该当成逾期')
  })

  // ⑥ 8 小时内不重复推（防刷屏）
  check('距上次不足 8 小时 → 不推（防刷屏）', () => {
    const now = atSlot + 49 * 3600 * 1000
    const doc = JSON.parse(fs.readFileSync(paths.news, 'utf8'))
    doc.items.push({ at: new Date(now).toISOString(), what: '刚攒的一条' })
    write(paths.news, doc)
    const r = buildPush(role, { dataDir: root, now })
    assert.equal(r.push, false)
    assert.ok(['too-soon', 'off-slot'].includes(r.reason), `预期被间隔或时段挡住，实际 ${r.reason}`)
    assert.ok(MIN_GAP_MS >= 8 * 60 * 60 * 1000)
  })
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log(`\n主动推送测试：${pass} 过`)
if (process.exitCode) process.exit(1)
