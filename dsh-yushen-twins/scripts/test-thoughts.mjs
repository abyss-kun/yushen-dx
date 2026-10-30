// 纠结记录：原样留档、可按角色/日期取；空内容拒绝。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-thought-'))
process.env.DSH_HOME = HOME
const th = await import('../lib/thoughts.js')

const r = th.recordThought({ role: 'xiaoyu', text: '我担心的是：跨过去会踩脏刚擦好的地。选项1/2/3，我选3。' })
assert.equal(r.ok, true)
const rows = th.listThoughts({ role: 'xiaoyu' })
assert.equal(rows.length, 1)
assert.match(rows[0].text, /我选3/)
assert.equal(th.listThoughts({ role: 'dragon' }).length, 0)
assert.equal(th.recordThought({ role: 'xiaoyu', text: '   ' }).ok, false)

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, recorded: true, filtered: true, emptyRejected: true }))
