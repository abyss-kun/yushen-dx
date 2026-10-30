// 知情：最近软件事件的摘要；有上限、能读空、不碰别的文件。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-aware-'))
process.env.DSH_HOME = HOME
const aw = await import('../lib/awareness.js')

// 空目录：没有内容，不报错
assert.deepEqual(aw.recentAwareness().items, [])

// 写几条今天的事件
const now = new Date('2026-10-25T12:00:00+08:00')
const day = '2026-10-25'
fs.mkdirSync(path.join(HOME, 'dayu', 'journal'), { recursive: true })
const rows = [
  { at: '2026-10-25T11:50:00+08:00', kind: 'idea', source: '老板', text: '框架是引路人' },
  { at: '2026-10-25T11:55:00+08:00', kind: 'talk', source: '她', text: '我选 3，绕开已擦区' },
  { at: '2026-10-25T11:58:00+08:00', kind: 'talk', source: '生命时钟', text: '叫醒 dayu' },
]
fs.writeFileSync(path.join(HOME, 'dayu', 'journal', `${day}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

const res = aw.recentAwareness({ now, limit: 8, maxChars: 700 })
assert.equal(res.items.length, 3)
assert.match(res.text, /引路人/)
assert.match(res.text, /我选 3/)
assert.ok(res.text.length <= 700)

// 上限生效：只取最近 2 条
const small = aw.recentAwareness({ now, limit: 2 })
assert.equal(small.items.length, 2)

// 神念指针：只报数量，不塞内容
const idx = aw.awarenessIndex({ now })
assert.equal(idx.count, 3)

// 看多细由她：headline 只有时间，skim 有摘要，read 有正文
const head = aw.look({ depth: 'headline', now })
assert.doesNotMatch(head.text, /引路人/)
const skim = aw.look({ depth: 'skim', now })
assert.match(skim.text, /引路人/)
const read = aw.look({ depth: 'read', now })
assert.match(read.text, /我选 3/)
assert.equal(aw.look({ depth: 'read', q: '引路人', now }).count, 1)

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, empty: true, digest: true, capped: true }))
