// 统一查找：文件名/账本优先；聊天默认不扫；结果带类型和片段。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-find-'))
process.env.DSH_HOME = HOME
fs.mkdirSync(path.join(HOME, 'dayu'), { recursive: true })
fs.writeFileSync(path.join(HOME, 'dayu', 'residence.json'), JSON.stringify({ roles: { xiaoyu: { label: '小鱼', sessionId: 'session-61396099' } } }))
fs.writeFileSync(path.join(HOME, 'dayu', 'notes.md'), '小鱼的新身体是 RPC 会话（唯一标记 zqx-note-42）\n')

const { findAnything } = await import('../lib/find.js')
const out = findAnything('zqx-note-42', { limit: 40 })
assert.equal(out.ok, true)
assert.ok(out.items.some((x) => x.kind === 'file' && x.path.endsWith('notes.md')))
// 账本也能按关键词找到（用单独一次查询，避免被真实工作区的命中挤掉）
const ledger = findAnything('session-61396099', { limit: 40 })
assert.ok(ledger.items.some((x) => x.kind === 'ledger' && x.path.endsWith('residence.json')))

// 空查询不报错
assert.deepEqual(findAnything('   ').items, [])

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, ledger: true, file: true, emptySafe: true, scanned: out.scanned }))
