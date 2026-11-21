// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:25｜大鱼·子会话（工作台）｜授权：主人（本次任务书：注入体检 §5①）｜scripts/test-rank.mjs:8-24｜临时家里先写一份 charter（大鱼 L2 / 小鱼 L0/L1）再断言起点 L2/L1｜为什么：rank.js 不再自带等级数字、只从宪章读；不先写宪章，这个测试就测不到「真从宪章读」，还会把 L3/L2 旧数锁进断言里｜验证：node scripts/test-rank.mjs 退出 0（{"ok":true,...}）｜可改：可改；断言只许改严
// 阶位：证据够了自动升；不够说差什么；封顶在 cap。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-rank-'))
process.env.DSH_HOME = HOME
// 2026-11-02：阶位起点只认宪章（三处统一到 charter.json）。这个临时家里先写一份宪章，
// 才能验「rank.js 真的从宪章读，而不是自带数字」——所以宪章必须在 import 之前落盘。
fs.mkdirSync(path.join(HOME, 'dayu'), { recursive: true })
fs.writeFileSync(path.join(HOME, 'dayu', 'charter.json'), JSON.stringify({
  version: 6,
  identity: { dayu: { level: 'L2' }, xiaoyu: { level: 'L0/L1' }, dragon: { level: '待定' } },
}), 'utf8')
const rank = await import('../lib/rank.js')

// 1) 现有角色按宪章起点；未知角色从 L0；照微另走五境，不进 L0-L3
assert.equal(rank.status('xiaoyu').rank, 'L1', '宪章写 L0/L1：跨两阶取上限 L1')
assert.equal(rank.status('dayu').rank, 'L2', '宪章写 L2，rank.js 不许再写 L3')
assert.equal(rank.status('aria').rank, 'L0')
assert.equal(rank.status('dragon').system, 'realm')
assert.equal(rank.status('dragon').label, '五境')
assert.equal(rank.recompute('dragon', { verifiedJobs: 999, openIncidents: 0, daysActive: 999 }).advanced, false)

// 2) 证据不够 L1：说差什么
const miss = rank.missingFor('L1', { verifiedJobs: 2, openIncidents: 0, daysActive: 1 })
assert.ok(miss.some((x) => x.includes('验收通过')))

// 3) 够 L1：升
const r1 = rank.recompute('aria', { verifiedJobs: 5, openIncidents: 0, daysActive: 3 })
assert.equal(r1.rank, 'L1')
assert.equal(r1.advanced, true)

// 4) 不能降：证据变差也不回退
const r2 = rank.recompute('aria', { verifiedJobs: 0, openIncidents: 5, daysActive: 0 })
assert.equal(r2.rank, 'L1')
assert.equal(r2.advanced, false)

// 5) 够 L2：升；封顶 L1 时只到 L1
const state = JSON.parse(fs.readFileSync(path.join(HOME, 'dayu', 'ranks.json'), 'utf8'))
state.cap = 'L1'
fs.writeFileSync(path.join(HOME, 'dayu', 'ranks.json'), JSON.stringify(state))
const r3 = rank.recompute('aria', { verifiedJobs: 30, openIncidents: 0, daysActive: 20 })
assert.equal(r3.rank, 'L1')
assert.match(r3.reason, /封顶/)

// 6) 历史留档
const s = rank.status('aria')
assert.ok(Array.isArray(s.history))
assert.ok(s.history.length >= 1)

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, l0: true, missing: true, promote: true, noDemote: true, cap: true, history: true }))
