// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 00:3x｜大鱼·子代理（闭环 P1）｜授权：老板（2026-11-10：心跳并入记忆要过闸门，空转不许进事件）｜scripts/test-heartbeat-ingest.mjs:1-…｜新增｜为什么：闸门是整个闭环最容易放水的一环——放宽一条，200 条上限两天就被心跳挤爆，真记忆被挤进冷档；这个测试把"三条判据"和"同一行只转一次"钉住｜验证：node scripts/test-heartbeat-ingest.mjs 全过｜可改：可改（断言只许改严；临时家必须留在系统 temp）
//
// 跑法：node scripts/test-heartbeat-ingest.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-hb-ingest-'))
process.env.DSH_HOME = HOME
const D = path.join(HOME, 'dayu')
const SOUL = path.join(D, 'soul')
const DAY = '2026-11-10'
const ROLE = 'aria'

fs.mkdirSync(path.join(SOUL, 'cards'), { recursive: true })
fs.mkdirSync(path.join(SOUL, 'memory'), { recursive: true })
fs.mkdirSync(path.join(D, 'heartbeat'), { recursive: true })
fs.writeFileSync(path.join(D, 'characters.json'), JSON.stringify({
  version: 1,
  characters: [{ id: ROLE, name: '阿丽亚', cards: { desk: 'cards/aria.md' }, memory: 'memory/aria.json' }],
}), 'utf8')
fs.writeFileSync(path.join(SOUL, 'cards', 'aria.md'), '# 阿丽亚\n', 'utf8')
fs.writeFileSync(path.join(SOUL, 'memory', 'aria.json'), JSON.stringify({ version: 1, summary: '', events: [] }), 'utf8')

const MEM = path.join(SOUL, 'memory', 'aria.json')
const readMem = () => JSON.parse(fs.readFileSync(MEM, 'utf8'))
function writeHeartbeat(rows) {
  fs.writeFileSync(path.join(D, 'heartbeat', `${DAY}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
}

const H = await import(pathToFileURL(path.join(ROOT, 'lib', 'heartbeat-ingest.js')).href)

let pass = 0
let fail = 0
const ok = (name, fn) => {
  try { const d = fn(); pass += 1; console.log(`✓ ${name}${d ? ` — ${d}` : ''}`) }
  catch (e) { fail += 1; console.error(`✗ ${name} — ${e?.message || e}`) }
}

// ── 0. shouldIngest 的三条判据（直接判，不落盘） ──────────────
ok('① 判据：空转（自省、无落点、无异常、没人等）→ 不转', () => {
  const v = H.shouldIngest({ role: ROLE, trigger: '自省', did: '体跳（这一跳没别的动作）', landed: null, unanswered: null })
  assert.equal(v.yes, false, `不该转：${v.why}`)
  return v.why
})

ok('② 判据：落了点 → 转', () => {
  const v = H.shouldIngest({ trigger: '兜底', did: '叫醒：兜底定时器', landed: true })
  assert.equal(v.yes, true)
  assert.equal(v.why, '落了点')
  return v.why
})

ok('③ 判据：异常词 → 转（词表是固定的，写在常量里）', () => {
  for (const w of ['没做成', '失败', '对不上', '没亮', '出错']) {
    const v = H.shouldIngest({ trigger: '自省', did: `状态灯${w}：本地引擎`, landed: null })
    assert.equal(v.yes, true, `「${w}」该算异常`)
  }
  assert.ok(H.ANOMALY_WORDS.includes('没亮'), '词表里该有「没亮」')
  return `词表 ${H.ANOMALY_WORDS.length} 个词，抽 5 个都认`
})

ok('④ 判据：有人在等 → 转', () => {
  const v = H.shouldIngest({ trigger: '有人找', did: '桥叫醒：群消息', landed: null, unanswered: 2 })
  assert.equal(v.yes, true, '有人等该转')
  assert.match(v.why, /有人在等/)
  return v.why
})

// ── 1. 真转：混着三个角色的心跳文件，只处理自己的行 ───────────
ok('⑤ 逐行判：自己的 4 行里转 3 行；别人的行只推进游标', () => {
  writeHeartbeat([
    { at: `${DAY}T10:00:00.000Z`, role: ROLE, trigger: '自省', thought: '未知', did: '体跳（这一跳没别的动作）', landed: null, spent: 0, unanswered: null, whyNot: '' },
    { at: `${DAY}T10:30:00.000Z`, role: ROLE, trigger: '兜底', thought: '未知', did: '叫醒后落了一单（把卡列出来）', landed: true, spent: null, unanswered: null, whyNot: '' },
    { at: `${DAY}T10:30:00.000Z`, role: 'xiaoyu', trigger: '兜底', thought: '未知', did: '别人的行', landed: true, spent: null, unanswered: null, whyNot: '' },
    { at: `${DAY}T11:00:00.000Z`, role: ROLE, trigger: '自省', thought: '未知', did: '状态灯没亮：本地引擎没装好', landed: null, spent: 0, unanswered: null, whyNot: '' },
    { at: `${DAY}T11:30:00.000Z`, role: ROLE, trigger: '有人找', thought: '未知', did: '桥叫醒：群消息（阿零）', landed: null, spent: null, unanswered: 2, whyNot: '没醒' },
  ])
  const r = H.ingestHeartbeats(ROLE, { day: DAY })
  assert.equal(r.ok, true, `跑失败：${r.reason}`)
  assert.equal(r.matched, 4, `该认出自己 4 行，实际 ${r.matched}`)
  assert.equal(r.appended, 3, `该转 3 条，实际 ${r.appended}（skipped ${r.skipped}）`)
  assert.equal(r.toLine, 5, `游标该到第 5 行，实际 ${r.toLine}`)
  return `scanned=${r.scanned} matched=${r.matched} appended=${r.appended} → 第 ${r.toLine} 行`
})

ok('⑥ 转出来的事件能点回心跳原文（source 带日期+行号）', () => {
  const evs = readMem().events || []
  assert.equal(evs.length, 3, `记忆里该 3 条，实际 ${evs.length}`)
  for (const e of evs) {
    assert.equal(e.channel, '心跳', `channel 该是 心跳：${e.channel}`)
    assert.equal(e.kind, '心跳', `kind 该是 心跳：${e.kind}`)
    assert.match(String(e.source), new RegExp(`^心跳:${DAY}:\\d+$`), `source 不对：${e.source}`)
    assert.match(String(e.text), /^心跳：/, `text 该以「心跳：」开头：${e.text}`)
  }
  const sources = evs.map((e) => e.source).sort()
  assert.deepEqual(sources, [`心跳:${DAY}:2`, `心跳:${DAY}:4`, `心跳:${DAY}:5`], `该点回第 2/4/5 行：${sources.join(' ')}`)
  return sources.join(' ')
})

ok('⑦ 异常那条标 important；落点与有人等标 normal（不许把日常都抬成重要）', () => {
  const evs = readMem().events || []
  const bySource = Object.fromEntries(evs.map((e) => [e.source, e]))
  assert.equal(bySource[`心跳:${DAY}:4`].tier, 'important', '异常该标 important')
  assert.equal(bySource[`心跳:${DAY}:2`].tier, 'normal', '落点该是 normal')
  assert.equal(bySource[`心跳:${DAY}:5`].tier, 'normal', '有人等该是 normal')
  return '异常=important，其余=normal'
})

ok('⑧ 幂等：同一天再跑一次，一条都不新增', () => {
  const before = (readMem().events || []).length
  const r = H.ingestHeartbeats(ROLE, { day: DAY })
  assert.equal(r.ok, true)
  assert.equal(r.appended, 0, `第二次不该再转：${r.appended}`)
  assert.equal(r.scanned, 0, `游标到头了，该扫 0 行：${r.scanned}`)
  const after = (readMem().events || []).length
  assert.equal(after, before, `记忆条数不该涨：${before} → ${after}`)
  return `0 新增（记忆仍 ${after} 条）`
})

ok('⑨ 心跳文件不存在：ok:true、appended:0，不报错', () => {
  const r = H.ingestHeartbeats(ROLE, { day: '2026-01-01' })
  assert.equal(r.ok, true)
  assert.equal(r.appended, 0)
  assert.match(String(r.reason || ''), /没有心跳文件/)
  return r.reason
})

ok('⑩ 没有角色：ok:false，不抛', () => {
  const r = H.ingestHeartbeats('', { day: DAY })
  assert.equal(r.ok, false)
  assert.match(String(r.reason || ''), /没有角色/)
  return r.reason
})

ok('⑪ 同一个持续异常只转一次（6 小时折叠）：两跳同样的「对不上账」→ 只落 1 条', () => {
  const DAY2 = '2026-11-09'
  const file = path.join(D, 'heartbeat', `${DAY2}.jsonl`)
  const row = (h) => ({ at: `${DAY2}T${h}:00:00.000Z`, role: ROLE, trigger: '自省', thought: '未知', did: '记忆对不上账：现在 206214 字节，上次记账 -1', landed: null, spent: 0, unanswered: null, whyNot: '' })
  fs.writeFileSync(file, [row('10'), row('10'), row('10')].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  // 三行同文同分钟会被 appendEvent 的指纹也压一次；把时间拉开，专门验证"折叠"这一层
  fs.writeFileSync(file, [row('10'), row('11')].map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  const before = (readMem().events || []).length
  const r = H.ingestHeartbeats(ROLE, { day: DAY2 })
  assert.equal(r.ok, true, `跑失败：${r.reason}`)
  assert.equal(r.appended, 1, `该只转 1 条，实际 ${r.appended}`)
  assert.equal(r.folded, 1, `该折叠 1 条，实际 ${r.folded}`)
  const after = (readMem().events || []).length
  assert.equal(after, before + 1, `记忆该只 +1：${before} → ${after}`)
  return `appended=1 folded=1（三行同文不会灌进 3 条）`
})

console.log('')
console.log(`心跳→事件闸门：${pass} 通过 / ${fail} 失败`)
try { fs.rmSync(HOME, { recursive: true, force: true }) } catch { /* 删不掉就留着 */ }
if (fail) process.exit(1)
