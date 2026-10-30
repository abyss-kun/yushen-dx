// 即时记录：先落盘、能搜到、不重复、不写凭据；想法/决定另留人能读的 markdown。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-capture-'))
process.env.DSH_HOME = HOME
const cap = await import('../lib/capture.js')

// 1) 想法：自动分类，进 journal + ideas
const r1 = cap.capture('我想到一个办法：把备份做成 append-only，崩溃也只丢最后一行')
assert.equal(r1.ok, true)
assert.equal(r1.kind, 'idea')
const today = new Date()
const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
assert.ok(fs.existsSync(path.join(HOME, 'dayu', 'journal', `${key}.jsonl`)))
assert.ok(fs.existsSync(path.join(HOME, 'dayu', 'ideas', `${key}.md`)))

// 2) 同一分钟同一句：不重复
const r2 = cap.capture('我想到一个办法：把备份做成 append-only，崩溃也只丢最后一行')
assert.equal(r2.duplicate, true)
assert.equal(cap.listCapture({ limit: 10 }).length, 1)

// 3) 决定：分类为 decision
const r3 = cap.capture('决定：以后对话即时记录，进鱼神的进鱼神，该备份的备份', { kind: 'decision' })
assert.equal(r3.kind, 'decision')

// 4) 搜索
assert.equal(cap.searchCapture('append-only', { limit: 10 }).length, 1)

// 5) 凭据：不落原文，抹掉再记
const bad = cap.capture('api_key = sk-1234567890abcdef1234567890')
assert.equal(bad.ok, true)
const rows = cap.listCapture({ limit: 10 })
const last = rows[rows.length - 1]
assert.doesNotMatch(last.text, /1234567890abcdef/)
assert.match(last.text, /\[已隐藏:/)
assert.ok(Array.isArray(last.redacted) && last.redacted.length > 0)

// 6) 空内容拒绝
assert.equal(cap.capture('   ').ok, false)

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, journal: true, ideasMd: true, dedupe: true, search: true, secretRedacted: true }))
