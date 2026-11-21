// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 自由活动：间隔/额度/静默期/峰时封顶；不调模型，只算账。
// 2026-11-03 老板定：兜底至少隔 1 小时；峰时（工作日 9-12、14-18）一天封顶 2 次；谷时放宽。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-free-'))
process.env.DSH_HOME = HOME
const ft = await import('../lib/freetime.js')

const MIN = 60 * 1000
const VALLEY = Date.parse('2026-10-26T12:10:00+08:00') // 周一 12:10，谷时
const PEAK = Date.parse('2026-10-26T09:10:00+08:00')   // 周一 09:10，峰时
const SAT = Date.parse('2026-10-24T10:00:00+08:00')    // 周六 10:00，整天谷时

const checks = []
const check = (name, fn) => { fn(); checks.push(name) }

// 0) 默认值就是老板定的口径
check('defaults', () => {
  assert.equal(ft.DEFAULTS.intervalHours, 1, '兜底至少隔 1 小时')
  assert.equal(ft.DEFAULTS.peakDailyCap, 2, '峰时一天 2 次')
  assert.equal(ft.DEFAULTS.dailyCap, 24, '谷时放宽：1 小时间隔的自然上限（每天 24 次），不是额度')
})

// 1) 从没跑过：该跑
check('firstRun', () => {
  assert.equal(ft.shouldRun('xiaoyu', { now: VALLEY }), true)
})

// 2) 刚活动过（静默期内）：不叫
check('quiet', () => {
  assert.equal(ft.shouldRun('xiaoyu', { now: VALLEY, lastActiveAt: new Date(VALLEY - 2 * MIN).toISOString() }), false)
})

// 3) 兜底至少隔 1 小时（原来是 0.5 小时）
check('interval1h', () => {
  ft.markRun('xiaoyu', { now: VALLEY })
  assert.equal(ft.shouldRun('xiaoyu', { now: VALLEY + 30 * MIN }), false, '半小时内不该再叫')
  assert.equal(ft.shouldRun('xiaoyu', { now: VALLEY + 61 * MIN }), true, '过了 1 小时该叫')
})

// 4) 峰时封顶 2 次，第 3 次不叫（哪怕间隔够了）
check('peakCap2', () => {
  ft.markRun('dayu', { now: PEAK })
  assert.equal(ft.status(PEAK).dayu.peakRemaining, 1)
  ft.markRun('dayu', { now: PEAK + 61 * MIN })
  assert.equal(ft.status(PEAK + 61 * MIN).dayu.peakRemaining, 0)
  assert.equal(ft.shouldRun('dayu', { now: PEAK + 122 * MIN }), false, '峰时第 3 次必须拦住')
})

// 5) 谷时不看峰时那道闸（只受总上限）
check('valleyRelaxed', () => {
  assert.equal(ft.shouldRun('dayu', { now: VALLEY }), true, '同一天峰时封顶用完后，谷时照常')
})

// 6) 她自己约的那趟不吃峰时名额
check('selfScheduledNotCounted', () => {
  ft.markRun('xiaoyu', { now: PEAK, fallback: false })
  assert.equal(ft.status(PEAK).xiaoyu.peakRemaining, 2, '自己约的叫醒不算兜底名额')
})

// 7) 总上限还在（谷时也不是无限）
check('dailyCap', () => {
  ft.markRun('dragon', { now: VALLEY })
  assert.equal(ft.shouldRun('dragon', { now: VALLEY + 2 * 60 * MIN, dailyCap: 1 }), false)
})

// 8) 换一天：额度重置
check('resetNextDay', () => {
  assert.equal(ft.shouldRun('dragon', { now: VALLEY + 24 * 60 * MIN }), true)
})

// 9) 周末整天谷时：同样的钟点不占峰时名额
check('weekendValley', () => {
  ft.markRun('dragon', { now: SAT })
  assert.equal(ft.status(SAT).dragon.peakRemaining, 2)
})

// 10) 谷时真按小时走：周六整点连着叫 24 次都行，第 25 次才被自然上限挡住
check('valleyHourly24', () => {
  const start = Date.parse('2026-10-24T00:00:00+08:00')
  let ran = 0
  for (let i = 0; i < 24; i += 1) {
    if (!ft.shouldRun('vtest', { now: start + i * 60 * MIN })) break
    ft.markRun('vtest', { now: start + i * 60 * MIN })
    ran += 1
  }
  assert.equal(ran, 24, '谷时每小时一次，一天 24 次')
  assert.equal(ft.shouldRun('vtest', { now: start + 24 * 60 * MIN - MIN }), false, '同一天里没有第 25 个钟点')
})

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, checks }))
