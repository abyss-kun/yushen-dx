// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 01:1x｜大鱼·子代理（闭环 P3+P4）｜授权：主人（2026-11-11：「注入不算借阅，检索才算」「醒来要能看见借了几本」）｜scripts/test-borrow.mjs:1-140｜新增｜为什么：借阅口径最容易糊——把"每轮注入 3 条"也算成借阅，醒来那段就会天天报"借了 3 本"，看着忙其实没查过；这个测试把"注入不记账"钉死｜验证：4 条断言全过｜可改：断言只许改严
//
// 跑法：node scripts/test-borrow.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-borrow-'))
process.env.DSH_HOME = home
const DATA = path.join(home, 'dayu')
const ROLE = 'dayu'
const LOG = path.join(DATA, 'runtime', 'recall-log.jsonl')
const NOW = Date.parse('2026-11-11T01:00:00+08:00')
const iso = (msAgo) => new Date(NOW - msAgo).toISOString()
const day = (() => { const d = new Date(NOW); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()

function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8') }
function writeJson(file, v) { write(file, `${JSON.stringify(v, null, 2)}\n`) }
const lines = () => { try { return fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean) } catch { return [] } }

const L = await import(pathToFileURL(path.join(ROOT, 'lib', 'borrow.js')).href)
const W = await import(pathToFileURL(path.join(ROOT, 'lib', 'wake-brief.js')).href)

let pass = 0
let fail = 0
// ④ 是 async（要真跑 pickForInject），所以 ok 也得等它——否则断言在测试结束后才跑，
// 上一版就是这么出的 "[object Promise]"（假过/假不过都看不出来）。
const ok = async (name, fn) => {
  try { const d = await fn(); pass += 1; console.log(`✓ ${name}${d ? ` — ${d}` : ''}`) }
  catch (e) { fail += 1; console.error(`✗ ${name} — ${e?.message || e}`) }
}

function seedLog(rows) {
  write(LOG, rows.map((r) => JSON.stringify({ at: r.at, who: r.who || ROLE, why: r.why || '查东西', query: r.query, hits: r.hits ?? 1, refs: r.refs || ['memory:1'], source: r.source || 'tool', used: r.used || '' })).join('\n') + '\n')
}
function seedWake() {
  writeJson(path.join(DATA, 'runtime', ROLE, 'presence.json'), {
    version: 1, lastSeenAt: iso(3 * 60 * 60 * 1000), lastChannel: 'desk', lastLine: '', updatedAt: iso(3 * 60 * 60 * 1000),
  })
  try { fs.rmSync(path.join(DATA, 'runtime', ROLE, 'wake-mark.json'), { force: true }) } catch { /* 本来就没有 */ }
  writeJson(path.join(DATA, 'library', '手抄本', '事件', `${day}.jsonl`), [])
  try { fs.rmSync(path.join(DATA, 'inbox'), { recursive: true, force: true }) } catch { /* 没有 */ }
}

await ok('① 一条检索都没有 → count:0，醒来段不加这一条', () => {
  try { fs.rmSync(LOG, { force: true }) } catch { /* 没有 */ }
  const b = L.borrowStats(ROLE, { now: NOW })
  assert.equal(b.count, 0, `该是 0，实际 ${b.count}`)
  assert.equal(b.used, 0)
  seedWake()
  const w = W.wakeBrief(ROLE, { now: NOW, channel: 'desk' })
  assert.ok(!w.text.includes('最近借了'), `没有借阅却报了：${w.text}`)
  return 'count=0、醒来段干净'
})

await ok('② 3 条检索（1 条用上了）→ count:3 / used:1；醒来段出现「最近借了 3 本（1 条用上了）」', () => {
  // 注意：NOW 是 01:00，用「几小时前」会落到前一天、被"今天零点"挡住——这里用分钟级偏移。
  seedLog([
    { at: iso(40 * 60 * 1000), query: '上次备份', used: '是' },
    { at: iso(25 * 60 * 1000), query: '她的绰号' },
    { at: iso(10 * 60 * 1000), query: '鱼不能上岸' },
  ])
  const b = L.borrowStats(ROLE, { now: NOW })
  assert.equal(b.count, 3, `该 3 条，实际 ${b.count}`)
  assert.equal(b.used, 1, `该 1 条用上，实际 ${b.used}`)
  seedWake()
  const w = W.wakeBrief(ROLE, { now: NOW, channel: 'desk' })
  assert.ok(w.text.includes('最近借了 3 本（1 条用上了）'), `没有那一条：${w.text}`)
  const item = w.small.find((x) => x.text.startsWith('最近借了'))
  assert.ok(item, '该在"小事"档里')
  assert.equal(item.from, 'library/检索记录')
  assert.ok(item.text.length <= 24, `超过 24 字：${item.text.length}`)
  return item.text
})

await ok('③ noteUsed 写回：used 计数 +1，原行其它字段一个字不变', () => {
  const before = lines().map((l) => JSON.parse(l))
  const r = L.noteUsed(ROLE, { query: '她的绰号', usedBy: '真用上了', now: NOW })
  assert.equal(r.ok, true, `没写回去：${r.reason || ''}`)
  const after = lines().map((l) => JSON.parse(l))
  assert.equal(after.length, before.length, '行数不该变（只加字段，不新增不删）')
  const b1 = L.borrowStats(ROLE, { now: NOW })
  assert.equal(b1.used, 2, `该 2 条用上，实际 ${b1.used}`)
  const i = after.findIndex((x) => x.query === '她的绰号')
  for (const k of ['at', 'who', 'why', 'query', 'hits', 'refs', 'source']) {
    assert.deepEqual(after[i][k], before[i][k], `字段 ${k} 被改了`)
  }
  assert.equal(after[i].used, '真用上了')
  return 'used 2 条；其它字段逐字段比对一致'
})

await ok('④ 注入不算借阅：跑一次 pickForInject，recall-log 行数不变', async () => {
  // 自造一份记忆，让 pickForInject 真跑起来（否则它读不到东西，测不出"有没有记账"）
  writeJson(path.join(DATA, 'characters.json'), {
    version: 1,
    characters: [{ id: ROLE, name: '大鱼', memory: 'memory/dayu.json' }],
  })
  writeJson(path.join(DATA, 'soul', 'memory', 'dayu.json'), {
    version: 1,
    events: [
      { id: 'e1', at: iso(3600e3), channel: '工作台', kind: 'say', text: '今天备份跑过了，快照在冷档', tier: 'normal', clarity: 'vivid' },
      { id: 'e2', at: iso(7200e3), channel: 'qq', kind: 'say', text: '鱼不能上岸的文字版还差一段', tier: 'normal', clarity: 'vivid' },
    ],
  })
  const before = lines().length
  const MP = await import(pathToFileURL(path.join(ROOT, 'lib', 'memory-pick.js')).href)
  let picked = []
  try { picked = MP.pickForInject(ROLE, { n: 3, now: NOW, cue: '文字版' }) || [] } catch (e) { picked = [`（pick 抛了：${e?.message || e}）`] }
  const after = lines().length
  assert.equal(after, before, `注入后检索日志多了 ${after - before} 行——注入被算成借阅了`)
  return `pick 了 ${Array.isArray(picked) ? picked.length : '?'} 条；日志仍是 ${after} 行`
})

// 改｜2026-11-11 18:4x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接 §二 图书馆定稿：用一次记一次反馈，可标有用/误导）｜scripts/test-borrow.mjs:118-140｜新增⑤：标成「误导/无关」的借阅不算「用上了」，单独出 misleading｜为什么：以前只要 used 有字就算用上，标「误导」也报成用上，醒来那段就报虚的好消息｜验证：5 条全过｜可改：断言只许改严
await ok('⑤ 「误导/无关」不算用上了：used 不涨、misleading 记一条', () => {
  seedLog([
    { at: iso(40 * 60 * 1000), query: '上次备份', used: '是' },
    { at: iso(25 * 60 * 1000), query: '她的绰号', used: '真用上了' },
    { at: iso(10 * 60 * 1000), query: '鱼不能上岸', used: '' },
    { at: iso(5 * 60 * 1000), query: '上岸怎么回', used: '误导' },
  ])
  const b = L.borrowStats(ROLE, { now: NOW })
  assert.equal(b.count, 4, `该 4 条，实际 ${b.count}`)
  assert.equal(b.used, 2, `误导不该算用上，实际 used=${b.used}`)
  assert.equal(b.misleading, 1, `该记 1 条误导，实际 ${b.misleading}`)
  seedWake()
  const w = W.wakeBrief(ROLE, { now: NOW, channel: 'desk' })
  assert.ok(w.text.includes('最近借了 4 本（2 条用上了）'), `报了虚的：${w.text}`)
  return '误导不计入用上；4 本 2 用上'
})

console.log('')
console.log(`借阅账：${pass} 通过 / ${fail} 失败`)
try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* 删不掉就留着 */ }
process.exit(fail ? 1 : 0)

