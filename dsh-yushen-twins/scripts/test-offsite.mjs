// 离线快照：拷到目标盘、按次数清旧、目标不在就跳过。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-off-'))
const SRC = path.join(HOME, 'dayu')
fs.mkdirSync(path.join(SRC, 'soul'), { recursive: true })
fs.writeFileSync(path.join(SRC, 'soul', 'a.md'), '卡片')
fs.writeFileSync(path.join(SRC, 'characters.json'), '{}')
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-target-'))
// 先放 3 个旧备份
for (const old of ['2026-01-01_000000', '2026-01-02_000000', '2026-01-03_000000']) fs.mkdirSync(path.join(target, old))

const { runOffsiteBackup } = await import('../lib/offsite.js')
const out = runOffsiteBackup({ target, keep: 2, home: HOME, now: new Date('2026-10-25T03:00:00+08:00'), roots: ['dayu/soul', 'dayu/characters.json'] })
assert.equal(out.ok, true)
assert.ok(fs.existsSync(path.join(out.dir, 'dayu', 'soul', 'a.md')))
assert.ok(fs.existsSync(path.join(out.dir, 'manifest.json')))
const left = fs.readdirSync(target).filter((n) => /^\d{4}-/.test(n)).sort()
assert.ok(left.length <= 2, `should keep <=2, got ${left.length}`)
assert.ok(out.pruned.length >= 1)

// 目标盘不在：跳过、不抛
const missing = runOffsiteBackup({ target: path.join(target, 'nope', 'deep'), keep: 2, home: HOME, dryRun: true })
assert.equal(missing.ok, false)

fs.rmSync(HOME, { recursive: true, force: true })
fs.rmSync(target, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, copied: true, manifest: true, pruned: true, missingSkipped: true }))
