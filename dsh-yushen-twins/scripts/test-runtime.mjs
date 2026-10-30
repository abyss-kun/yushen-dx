// 运行时：目录、权重、红线、回场、判断样板。不调模型，只算账。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-runtime-'))
process.env.DSH_HOME = HOME
const rt = await import('../lib/runtime.js')
const gate = await import('../lib/reply-gate.js')

const NOW = Date.parse('2026-10-26T02:40:00+08:00')
const ROLE = 'dayu'

// 1) 建目录：文件齐、可重复跑
let r = rt.ensureRuntime(ROLE)
for (const f of ['weights.json', 'presence.json', 'body.json', 'self.md']) {
  assert.equal(fs.existsSync(path.join(r.dir, f)), true, `缺 ${f}`)
}
assert.equal(fs.existsSync(path.join(r.dir, 'memory')), true)
r = rt.ensureRuntime(ROLE)
assert.deepEqual(r.created, [], '第二次不该重建')

// 2) 默认权重
let w = rt.readWeights(ROLE)
assert.equal(w.values.replyGate, 0.5)
assert.equal(w.values.memoryHalfLifeDays, 14)
assert.equal(w.log.length, 0)

// 3) 调权重：夹边界 + 留痕
let out = rt.setWeight(ROLE, 'replyGate', 0.85, { who: 'owner', why: '群里太吵', now: NOW })
assert.equal(out.from, 0.5)
assert.equal(out.to, 0.85)
out = rt.setWeight(ROLE, 'replyGate', 9, { who: 'owner', now: NOW })
assert.equal(out.to, 1, '超上限要夹到 max')
const log = rt.weightsLog(ROLE)
assert.equal(log.length, 2)
assert.equal(log[0].why, '群里太吵')
assert.equal(log[0].who, 'owner')
assert.equal(log[0].from, 0.5)

// 4) 红线：接入的插件不能调她的权重
assert.throws(() => rt.setWeight(ROLE, 'replyGate', 0.1, { who: 'qq-bridge' }), /插件不能调/)
assert.throws(() => rt.setWeight(ROLE, 'replyGate', 0.1, { who: '' }), /插件不能调/)
// 她自己、主人可以
assert.equal(rt.setWeight(ROLE, 'moodInertia', 0.3, { who: 'self' }).ok, true)
assert.equal(rt.setWeight(ROLE, 'moodInertia', 0.7, { who: ROLE }).ok, true)
// 不认识的键
assert.throws(() => rt.setWeight(ROLE, 'nope', 1, { who: 'owner' }), /没有这个权重/)

// 5) 判断样板：同一句话，权重不同，结论不同
const msgAt = NOW - 30 * 60000
const lowGate = gate.desireOf({ now: NOW, msgAt, unread: 1, weights: { replyGate: 0.3 } })
const highGate = gate.desireOf({ now: NOW, msgAt, unread: 1, weights: { replyGate: 0.95 } })
assert.equal(lowGate.verdict, 'reply')
assert.equal(highGate.verdict, 'skip')
assert.equal(lowGate.score, highGate.score, 'gate 只改阈值，不改分数')
// @ 她会提高欲望分
const atMe = gate.desireOf({ now: NOW, msgAt, unread: 1, atMe: true, weights: { replyGate: 0.5 } })
assert.ok(atMe.score > gate.desireOf({ now: NOW, msgAt, unread: 1, weights: { replyGate: 0.5 } }).score)
// 积压越多越不想插嘴
const busy = gate.desireOf({ now: NOW, msgAt: NOW - 60000, unread: 60, weights: { replyGate: 0.5 } })
const idle = gate.desireOf({ now: NOW, msgAt: NOW - 60000, unread: 1, weights: { replyGate: 0.5 } })
assert.ok(busy.parts.attention < idle.parts.attention)
// 走她的权重（不传 weights 时从运行时读）
rt.setWeight(ROLE, 'replyGate', 0.99, { who: 'self', why: '不想说话' })
assert.equal(gate.decideFor(ROLE, { now: NOW, msgAt, unread: 1 }).verdict, 'skip')

// 6) 回场：离开多久、期间几条、她自己上次说了什么
assert.equal(rt.resumeBrief(ROLE, { now: NOW }).text, '', '没有在场记录就不编')
rt.markSeen(ROLE, { channel: 'qq', line: '我是鲸鱼，不是清朝鱼', at: NOW - 3 * 3600000 })
const day = '2026-10-26'
const inboxFile = path.join(HOME, 'dayu', 'inbox', 'qq', `${day}.jsonl`)
fs.mkdirSync(path.dirname(inboxFile), { recursive: true })
const rows = [
  { id: 'g#1', at: new Date(NOW - 2 * 3600000).toISOString(), atMe: false, key: 'group:1', kind: 'group', name: '甲', text: '在吗' },
  { id: 'g#2', at: new Date(NOW - 90 * 60000).toISOString(), atMe: true, key: 'group:1', kind: 'group', name: '乙', text: '@她 问个事' },
]
fs.writeFileSync(inboxFile, rows.map((x) => `${JSON.stringify(x)}\n`).join(''), 'utf8')
const brief = rt.resumeBrief(ROLE, { now: NOW })
assert.match(brief.text, /离开了 3 小时/, '要说出离开多久')
assert.match(brief.text, /2 条新消息/, '要说出期间几条')
assert.match(brief.text, /1 条 @ 你/, '要点出被点名')
assert.match(brief.text, /我是鲸鱼/, '要带她自己上次说的话')
assert.match(brief.text, /02:40/, '要知道现在几点')
// 刚离开一会儿：不啰嗦
rt.markSeen(ROLE, { at: NOW - 5 * 60000 })
assert.equal(rt.resumeBrief(ROLE, { now: NOW }).text, '')
// 超字数：先砍「上次说了什么」，保住「离开多久 / 现在几点」
rt.markSeen(ROLE, { line: '一'.repeat(80), at: NOW - 5 * 3600000 })
const cramped = rt.resumeBrief(ROLE, { now: NOW, maxChars: 60 })
assert.ok(cramped.text.length <= 120, '要有字数上限')
assert.match(cramped.text, /离开了/, '砍完仍要保留离开多久')

// 7) 礼物：模块在就算接上
const gifts = rt.giftStatus(ROLE)
const ready = gifts.filter((g) => g.ready).map((g) => g.id)
assert.ok(ready.includes('time') && ready.includes('self') && ready.includes('body') && ready.includes('weights'))
assert.equal(gifts.find((g) => g.id === 'remembered').ready, true, '收件箱目录已存在，算接上')

// 8) 身体：读的是真机器
const body = rt.bodySnapshot({ now: NOW })
assert.ok(body.cpus >= 1)
assert.ok(body.memTotalMB > 0)
assert.doesNotMatch(String(body.note), /假装/)

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, files: true, defaults: true, redLine: true, replyGate: true, resume: true, gifts: true, body: true }))
