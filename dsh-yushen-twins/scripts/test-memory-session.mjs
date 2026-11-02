// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// session 真进记忆 id（2026-11-02）：同一设备、同一分钟、同一句话——
//   · 不同会话两次写入 = 2 条，id 不同（以前 session 没传，这种情况会被去重成一条）；
//   · 同一会话重放 = 1 条（去重还在，重放/重试不涨条数）；
//   · 不传 session 的老调用照旧能写（只补传参，没改默认行为）。
//
// 为什么单独一个进程：lib/memory.js 在 import 那一刻就把 DSH_HOME 定死了
// （见 test-merge.mjs 顶上的同一句），所以先把 DSH_HOME 指到临时家，再动态 import。
// 临时家放系统 temp：沙箱只拦写真家目录（~/.dsh），temp 永远放行。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-session-'))
process.env.DSH_HOME = tmp
process.env.YUSHEN_DEVICE = 'desktop'

const lib = (rel) => pathToFileURL(path.join(ROOT, rel)).href + '?t=' + Date.now()
const { appendEvent } = await import(lib('lib/memory.js'))
const MEM = path.join(tmp, 'dayu', 'soul', 'memory', 'dayu.json')
const readMem = () => JSON.parse(fs.readFileSync(MEM, 'utf8'))
const lines = []
const say = (line) => { lines.push(line); console.log(line) }

const AT = '2026-11-02T03:00:00.000Z'
const TEXT = '同一台设备两个会话：封面改成两栏'

// ① 两个会话、同一句话、同一分钟 → 两条，id 不同
const a = appendEvent('dayu', { channel: '工作台', kind: 'say', text: TEXT, at: AT, session: 'sess-aaaa1111' })
const b = appendEvent('dayu', { channel: '工作台', kind: 'say', text: TEXT, at: AT, session: 'sess-bbbb2222' })
assert.equal(a.appended, true, `会话 A 没写进去：${JSON.stringify(a)}`)
assert.equal(b.appended, true, `会话 B 被去重掉了（id=${b.id || '无'}）——session 没进 id`)
assert.notEqual(a.id, b.id, '同一设备两个会话同一句的 id 一样——session 没进 id')
let events = readMem().events
assert.equal(events.length, 2, `两个会话应该 2 条，实际 ${events.length}`)
assert.deepEqual(events.map((e) => e.session), ['sess-aaaa1111', 'sess-bbbb2222'], '事件里的 session 字段不对')
say(`① 两个会话同一句 → ${events.length} 条，id ${a.id} ≠ ${b.id}`)

// ② 同一会话重放 → 只有 1 条（去重键含 session，仍然生效）
const again = appendEvent('dayu', { channel: '工作台', kind: 'say', text: TEXT, at: AT, session: 'sess-aaaa1111' })
assert.equal(again.duplicate, true, '同一会话重放应该去重')
assert.equal(readMem().events.length, 2, '重放后条数变了')
say('② 同会话重放 → duplicate，条数没涨')

// ③ 不传 session 的老调用照旧能写，且事件里不会凭空多出 session 字段
const legacy = appendEvent('dayu', { channel: '工作台', kind: 'say', text: TEXT, at: AT })
assert.equal(legacy.appended, true, '不传 session 的老调用写不进去了——补传参不该改默认行为')
events = readMem().events
assert.equal(events.length, 3, `老调用应该多一条，实际 ${events.length}`)
assert.equal(events.at(-1).session, undefined, '老调用不该凭空多出 session 字段')
for (const e of events) assert.match(String(e.id), /^m-[0-9a-f]{10}$/, `id 格式不对：${e.id}`)
assert.notEqual(legacy.id, a.id, '空 session 和 sess-aaaa1111 的 id 不该一样')
say(`③ 不带 session 的老调用 → 照旧写成第 ${events.length} 条，id ${legacy.id}`)

fs.rmSync(tmp, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, twoSessions: 2, idsDiffer: true, replayDedup: true, legacyNoSession: true }))
