// 记忆回写：按人、带通道、去重、限量，且不碰摘要/习惯/关系。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-mem-'))
process.env.DSH_HOME = HOME
const SOUL = path.join(HOME, 'dayu', 'soul')
fs.mkdirSync(path.join(SOUL, 'cards'), { recursive: true })
fs.mkdirSync(path.join(SOUL, 'memory'), { recursive: true })
fs.writeFileSync(path.join(HOME, 'dayu', 'characters.json'), JSON.stringify({
  version: 1,
  characters: [{ id: 'aria', name: '阿丽亚', cards: { desk: 'cards/aria.md' }, memory: 'memory/aria.json' }],
}), 'utf8')
fs.writeFileSync(path.join(SOUL, 'cards', 'aria.md'), '# 阿丽亚\n', 'utf8')
fs.writeFileSync(path.join(SOUL, 'memory', 'aria.json'), JSON.stringify({ version: 1, summary: '旧摘要', habits: ['慢'], dynamics: ['和老板'], impressions: { 老板: { summary: 'x' } } }), 'utf8')

const mem = await import('../lib/memory.js')
const file = path.join(SOUL, 'memory', 'aria.json')

// 1) 记一条她说的话：进 events，别的字段不动
const a = mem.appendEvent('aria', { channel: 'QQ', kind: 'say', text: '我在群里回了句' })
assert.equal(a.appended, true)
let row = JSON.parse(fs.readFileSync(file, 'utf8'))
assert.equal(row.summary, '旧摘要')
assert.deepEqual(row.habits, ['慢'])
assert.equal(row.events.length, 1)
assert.equal(row.events[0].channel, 'QQ')
assert.equal(row.events[0].kind, 'say')

// 2) 同一分钟同一句：不重复记
const b = mem.appendEvent('aria', { channel: 'QQ', kind: 'say', text: '我在群里回了句' })
assert.equal(b.duplicate, true)
assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).events.length, 1)

// 3) 不同通道、不同内容：各记各的
mem.appendEvent('aria', { channel: '工作台', kind: 'input', text: '老板：去做 X' })
row = JSON.parse(fs.readFileSync(file, 'utf8'))
assert.equal(row.events.length, 2)
assert.equal(row.events[1].channel, '工作台')

// 4) 超长截断、空白拒绝
mem.appendEvent('aria', { channel: 'B站', kind: 'note', text: 'x'.repeat(1000) })
row = JSON.parse(fs.readFileSync(file, 'utf8'))
assert.equal(row.events.at(-1).text.length, 400)
assert.equal(mem.appendEvent('aria', { text: '   ' }).ok, false)

// 5) 会话 → 角色：只认账本里那条
fs.writeFileSync(path.join(HOME, 'dayu', 'residence.json'), JSON.stringify({ version: 1, roles: { aria: { sessionId: 'sess-1' } } }), 'utf8')
assert.equal(mem.roleForSession('sess-1'), 'aria')
assert.equal(mem.roleForSession('sess-other'), '')

// 6) 限量：最多 200 条，留最新的
for (let i = 0; i < 210; i += 1) mem.appendEvent('aria', { channel: 'B站', kind: 'note', text: `第 ${i} 条`, at: new Date(Date.now() + i * 60000).toISOString() })
row = JSON.parse(fs.readFileSync(file, 'utf8'))
assert.equal(row.events.length, 200)
assert.match(row.events.at(-1).text, /第 209 条/)

// 9) 证据式召回：每条有 id，能按关键词找回原话（2026-10-30）
const rec = mem.appendEvent('aria', { channel: '工作台', text: '老板说面试改到周四了' })
assert.ok(rec.ok)
const found = mem.memoryLookup('aria', '面试周四')
assert.ok(found.length >= 1, '应该能找回那条')
assert.match(found[0].id, /^m-[0-9a-f]{10}$/, 'id 格式不对')
assert.match(found[0].text, /面试改到周四/)
fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, onePerPerson: true, channelTagged: true, dedup: true, capped: true }))
