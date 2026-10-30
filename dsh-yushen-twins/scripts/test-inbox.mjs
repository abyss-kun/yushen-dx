// 收件箱镜像：幂等、不吞自己的话、断层能标出来。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-inbox-'))
process.env.DSH_HOME = HOME
const inbox = await import('../lib/inbox.js')

const stateDir = path.join(HOME, 'bridge')
fs.mkdirSync(stateDir, { recursive: true })
const statePath = path.join(stateDir, 'social-v2.json')

const NOW = Date.parse('2026-10-26T02:00:00+08:00')
const SELF = '3664742054'

function writeState(convs) {
  fs.writeFileSync(statePath, JSON.stringify({ paused: false, conversations: convs }, null, 2), 'utf8')
}

const group = (seqs) => ({
  recentMessages: seqs.map((seq) => ({
    seq,
    messageId: String(100000 + seq),
    sender: seq === 3 ? '小鱼' : '群友甲',
    userId: seq === 3 ? SELF : '10001',
    text: `第${seq}条`,
    plain: `第${seq}条`,
    isOwner: false,
    isSelf: seq === 3,
    quoteTargetIsSelf: seq === 2,
    media: [],
    time: NOW - (10 - seq) * 60000,
  })),
})

// 1) 第一次：把 ring 收进来（标 backfill），并且不吞她自己的话
writeState({ 'group:1': group([1, 2, 3]) })
let r = inbox.mirrorOnce({ now: NOW, statePath, selfIds: [SELF] })
assert.equal(r.ok, true)
assert.equal(r.appended, 3, '第一次应补录 3 条')
let rows = inbox.readInbox({ day: '2026-10-26', limit: 10 }).rows
assert.equal(rows.length, 3)
assert.equal(rows[0].backfill, true, '第一次的条目要标 backfill')
assert.equal(rows[1].atMe, true, '@ 到她要记下来（判断归本体，但事实不能丢）')
const mine = rows.find((x) => x.seq === 3)
assert.equal(mine.isSelf, true, '她自己的话要标 isSelf，不能当群友')

// 2) 再跑一次：幂等
r = inbox.mirrorOnce({ now: NOW + 60000, statePath, selfIds: [SELF] })
assert.equal(r.appended, 0, '没新消息就不该重复写')
rows = inbox.readInbox({ day: '2026-10-26', limit: 10 }).rows
assert.equal(rows.length, 3, '去重后仍是 3 条')

// 3) 新消息进来：只追加新的
writeState({ 'group:1': group([2, 3, 4, 5]) })
r = inbox.mirrorOnce({ now: NOW + 120000, statePath, selfIds: [SELF] })
assert.equal(r.appended, 2, '只追加 4、5')
rows = inbox.readInbox({ day: '2026-10-26', limit: 10 }).rows
assert.deepEqual(rows.map((x) => x.seq), [1, 2, 3, 4, 5])

// 4) ring 断层：桥那边丢了一段，要标出来（不能假装连续）
writeState({ 'group:1': group([20, 21]) })
r = inbox.mirrorOnce({ now: NOW + 180000, statePath, selfIds: [SELF] })
assert.equal(r.gaps.length, 1, '断层要报')
assert.equal(r.gaps[0].missing, 14, '6..19 共 14 条缺失')
assert.equal(r.gaps[0].key, 'group:1')

// 5) 换一天：写新文件，不串
r = inbox.mirrorOnce({ now: NOW + 86400000, statePath, selfIds: [SELF] })
assert.equal(r.ok, true)
assert.equal(r.day, '2026-10-27', '跨天要换文件')

// 6) 读不到桥：说清楚，不抛
r = inbox.mirrorOnce({ now: NOW, statePath: path.join(stateDir, 'nope.json') })
assert.equal(r.ok, false)
assert.match(r.reason, /读不了/)

// 7) dryRun 不写盘、不推进 cursor
const before = fs.readFileSync(path.join(HOME, 'dayu', 'inbox', '.cursor.json'), 'utf8')
writeState({ 'group:1': group([30, 31]) })
r = inbox.mirrorOnce({ now: NOW + 2 * 86400000, statePath, selfIds: [SELF], dryRun: true })
assert.equal(r.appended, 2)
const after = fs.readFileSync(path.join(HOME, 'dayu', 'inbox', '.cursor.json'), 'utf8')
assert.equal(before, after, 'dryRun 不许动 cursor')

// 8) 已读位按角色分开：同一个身体，各自的眼睛
// 这一天累计 7 条：1..5 加上断层后的 20、21
const day0 = '2026-10-26'
let u = inbox.unreadFor('dayu', { day: day0 })
assert.equal(u.rows.length, 7, '第一天 7 条都还没看')
inbox.markRoleRead('dayu', { upToId: u.rows[2].id, upToAt: '2026-10-26T02:05:00+08:00' })
assert.equal(inbox.unreadFor('dayu', { day: day0 }).rows.length, 4, '看过第 3 条，剩 4 条')
assert.equal(inbox.unreadFor('xiaoyu', { day: day0 }).rows.length, 7, '小鱼没看过，仍是 7 条（不借用姐姐的位）')
inbox.markRoleRead('xiaoyu', { upToId: inbox.unreadFor('xiaoyu', { day: day0 }).rows[6].id })
assert.equal(inbox.unreadFor('xiaoyu', { day: day0 }).rows.length, 0, '看完就是 0')
assert.equal(inbox.unreadFor('dayu', { day: day0 }).rows.length, 4, '大鱼不受影响')

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, idempotent: true, selfMarked: true, atMe: true, gap: true, dayRoll: true, graceful: true, dryRun: true }))
