// 自由活动：间隔/额度/静默期；不调模型，只算账。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-free-'))
process.env.DSH_HOME = HOME
const ft = await import('../lib/freetime.js')

const NOW = Date.parse('2026-10-25T00:00:00+08:00')
// 1) 从没跑过：该跑
assert.equal(ft.shouldRun('xiaoyu', { now: NOW }), true)

// 2) 刚活动过：不叫
assert.equal(ft.shouldRun('xiaoyu', { now: NOW, lastActiveAt: new Date(NOW - 10 * 60000).toISOString() }), false)

// 3) 跑了之后：间隔内不叫
ft.markRun('xiaoyu', { now: NOW, note: '整理记忆' })
assert.equal(ft.shouldRun('xiaoyu', { now: NOW + 3600000 }), false)
assert.equal(ft.shouldRun('xiaoyu', { now: NOW + 7 * 3600000 }), true)

// 4) 当天额度用完：不叫
ft.markRun('xiaoyu', { now: NOW + 7 * 3600000 })
assert.equal(ft.shouldRun('xiaoyu', { now: NOW + 10 * 3600000 }), false)

// 5) 换一天：额度重置
assert.equal(ft.shouldRun('xiaoyu', { now: NOW + 30 * 3600000 }), true)

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, firstRun: true, quiet: true, interval: true, dailyCap: true, resetNextDay: true }))
