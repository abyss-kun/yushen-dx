// 阶位：证据够了自动升；不够说差什么；封顶在 cap。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-rank-'))
process.env.DSH_HOME = HOME
const rank = await import('../lib/rank.js')

// 1) 现有角色按宪章起点；未知角色从 L0；照微另走五境，不进 L0-L3
assert.equal(rank.status('xiaoyu').rank, 'L2')
assert.equal(rank.status('dayu').rank, 'L3')
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
