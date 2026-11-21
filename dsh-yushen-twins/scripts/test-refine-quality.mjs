// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-03 01:56｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：精炼加计数与阈值）｜scripts/test-refine-quality.mjs:1-299｜新增：质量闸的离线测试——临时 home 造指标文件，覆盖健康/四种硬红线/三条趋势（丢弃率、降级率、通过率）/只 1 轮/样本不足/中位数缺口/--limit/写读契约；另抽出 refine.mjs 的 appendRoundMetrics 真跑一次，验字段与「写失败吞掉」｜为什么：阈值和「连续 3 轮 + 样本 ≥30」这类口径全靠边界情形站住；没有测试就只能靠人肉记 10 轮，改一次阈值不知道会不会误报｜验证：& $node scripts/test-refine-quality.mjs 全过；退出码 0，失败时逐条打印哪条断言破了｜可改：可改（只许加情形；不许把「只 1 轮 / 样本不足 / 中位数缺口」改成会报）
//
// 只读、只花本地时间：不联网、不跑精提炼、不调模型。
// 临时目录用 os.tmpdir() 新建；按本次任务书「不许删文件」的硬约束，测试结束不清理（系统临时目录自己会清）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, 'refine-quality.mjs')
const REFINE = path.join(HERE, 'refine.mjs')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-refine-quality-'))
const DAY = 24 * 60 * 60 * 1000
const BASE = Date.parse('2026-10-20T22:00:00+08:00')
const stamp = (i) => new Date(BASE + i * DAY).toISOString()
const CORPUS = { channels: ['工作台'], days: ['2026-10-30'], count: 50 }

/** 造一条「像 refine.mjs 写出来的」指标；默认是健康的一轮。 */
function round(i, over = {}) {
  const written = over.written ?? 40
  const dropped = over.dropped ?? 5
  const skipped = over.skipped ?? 5
  const knTotal = over.kn ?? 4
  const exTotal = over.ex ?? 4
  return {
    at: over.at || stamp(i),
    written,
    dropped,
    skipped,
    reKind: over.reKind ?? 0,
    knowledge: { total: knTotal, cited: over.cited ?? knTotal },
    experience: { total: exTotal, shaped: over.shaped ?? exTotal },
    loggy: over.loggy ?? 0,
    paths: over.paths ?? 0,
    droppedReasons: { 测试原因: dropped },
    costYuan: 0.05,
    ms: 40000,
    calls: 10,
    retried: 0,
    degraded: 0,
    corpus: over.corpus || { ...CORPUS, count: written + dropped + skipped },
  }
}

function writeHome(name, rows) {
  const home = path.join(TMP, name)
  const dir = path.join(home, 'dayu', 'runtime')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'refine-metrics.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8')
  return home
}

function run(home, { json = true, extra = [] } = {}) {
  const args = [SCRIPT, `--home=${home}`, ...(json ? ['--json'] : []), ...extra]
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000, cwd: HERE })
  let parsed = null
  try { parsed = JSON.parse(r.stdout) } catch { parsed = null }
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', json: parsed }
}

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message || e) })
  }
}

// ── 1. 健康：8 轮都干净，趋势不该误报 ──
test('健康：8 轮干净 → 退出 0，趋势未触发', () => {
  const home = writeHome('healthy', Array.from({ length: 8 }, (_, i) => round(i)))
  const r = run(home)
  assert.equal(r.code, 0, `退出码应为 0，实际 ${r.code}｜${r.err}`)
  assert.ok(r.json, `--json 应是合法 JSON：${r.out.slice(0, 200)}`)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.verdict, 'ok')
  assert.equal(r.json.redlines.broken.length, 0, '不该有硬红线')
  assert.equal(r.json.trends.judged, true, '8 轮 / 400 条样本，趋势应可判')
  assert.equal(r.json.trends.items.drop.triggered, false, '丢弃率 10% 不该触发')
  assert.equal(r.json.window.rounds, 8)
  const human = run(home, { json: false })
  assert.equal(human.code, 0)
  assert.ok(human.out.includes('正常'), `结论里应写「正常」：${human.out}`)
})

// ── 2. 硬红线：四条各造一轮，且破的那轮不在最后（证明任一轮都算） ──
test('硬红线：四种各破一条 → 退出 1，并指到破的那一轮', () => {
  const cases = [
    ['loggy 日志混入', { loggy: 1 }, 'loggy'],
    ['paths 纯路径', { paths: 2 }, 'paths'],
    ['knowledge 知识没出处', { kn: 4, cited: 2 }, 'knowledge'],
    ['experience 经验不成形', { ex: 10, shaped: 9 }, 'experience'],
  ]
  for (const [name, over, rule] of cases) {
    const home = writeHome(`hard-${rule}`, Array.from({ length: 6 }, (_, i) => round(i, i === 2 ? over : {})))
    const r = run(home)
    assert.equal(r.code, 1, `${name}：退出码应为 1，实际 ${r.code}`)
    assert.ok(r.json, `${name}：--json 应是合法 JSON`)
    assert.equal(r.json.ok, false)
    const hit = r.json.redlines.broken.find((b) => b.rule === rule)
    assert.ok(hit, `${name}：应报 ${rule}，实际 ${JSON.stringify(r.json.redlines.broken)}`)
    assert.equal(hit.at, stamp(2), `${name}：应指到第 3 轮（${stamp(2)}），实际 ${hit.at}`)
    assert.equal(r.json.redlines.broken.length, 1, `${name}：只该破这一条`)
    assert.equal(r.json.lastCleanAt, stamp(5), `${name}：上次红线全绿应是最新一轮`)
  }
})

test('硬红线：人看的结论只有一行，且带「哪条破/样本多少/上次」', () => {
  const home = writeHome('hard-human', Array.from({ length: 4 }, (_, i) => round(i, i === 1 ? { loggy: 1 } : {})))
  const r = run(home, { json: false })
  assert.equal(r.code, 1)
  const lines = r.out.trim().split('\n')
  assert.equal(lines.length, 1, `结论应只有一行，实际 ${lines.length} 行`)
  assert.ok(lines[0].includes('日志混入'), `应写破的是日志混入：${lines[0]}`)
  assert.ok(lines[0].includes('样本'), `应写样本多少：${lines[0]}`)
  assert.ok(lines[0].includes('最近一轮'), `应写上次什么时候：${lines[0]}`)
})

// ── 3. 连续 3 轮丢弃率 >20% → 趋势触发（先算好通过率，别让通过率趋势跟着响） ──
test('趋势：连续 3 轮丢弃率 30% / 样本 150 → 退出 1，只报丢弃率', () => {
  const rows = [
    ...[0, 1, 2, 3, 4].map((i) => round(i, { written: 35, dropped: 5, skipped: 10 })), // 通过 70%、丢弃 10%
    ...[5, 6, 7].map((i) => round(i, { written: 35, dropped: 15, skipped: 0 })),        // 通过 70%、丢弃 30%
  ]
  const r = run(writeHome('trend-drop', rows))
  assert.equal(r.code, 1, `退出码应为 1，实际 ${r.code}`)
  assert.equal(r.json.trends.judged, true)
  assert.equal(r.json.trends.items.drop.triggered, true, '丢弃率应触发')
  assert.deepEqual(r.json.trends.items.drop.rates, [0.3, 0.3, 0.3])
  assert.equal(r.json.trends.samples, 150)
  assert.equal(r.json.trends.items.pass.triggered, false, '通过率是 70% = 中位数，不该触发')
  assert.equal(r.json.trends.items.degrade.triggered, false)
  assert.equal(r.json.triggered.length, 1)
})

// ── 3b. 连续 3 轮降级率 >30% → 趋势触发 ──
test('趋势：连续 3 轮降级率 42.9% → 退出 1，只报降级率', () => {
  const rows = [
    ...[0, 1, 2, 3].map((i) => round(i, { written: 40, dropped: 4, skipped: 6, kn: 4, reKind: 0 })),
    ...[4, 5, 6].map((i) => round(i, { written: 40, dropped: 4, skipped: 6, kn: 4, reKind: 3 })), // 3/(3+4)=42.9%
  ]
  const r = run(writeHome('trend-degrade', rows))
  assert.equal(r.code, 1, `退出码应为 1，实际 ${r.code}`)
  assert.equal(r.json.trends.items.degrade.triggered, true, '降级率 42.9% 应触发')
  assert.deepEqual(r.json.trends.items.degrade.rates, [0.4286, 0.4286, 0.4286])
  assert.equal(r.json.trends.items.drop.triggered, false, '丢弃率 8% 不该触发')
  assert.equal(r.json.trends.items.pass.triggered, false, '通过率 80% = 中位数，不该触发')
})

// ── 3c. 连续 3 轮通过率比同语料中位数低 >15 个百分点 → 趋势触发 ──
test('趋势：近 3 轮通过率 50%，同语料中位数 90% → 退出 1', () => {
  const rows = [
    ...[0, 1, 2, 3].map((i) => round(i, { written: 45, dropped: 5, skipped: 0 })), // 90%
    ...[4, 5, 6].map((i) => round(i, { written: 25, dropped: 5, skipped: 20 })),   // 50%
  ]
  const r = run(writeHome('trend-pass', rows))
  assert.equal(r.code, 1, `退出码应为 1，实际 ${r.code}`)
  assert.equal(r.json.trends.items.pass.applicable, true)
  assert.equal(r.json.trends.items.pass.triggered, true, '50% 比 90% 低 40 个百分点，应触发')
  assert.equal(r.json.trends.items.pass.median, 0.9)
  assert.equal(r.json.trends.items.pass.baselineRounds, 4)
  assert.deepEqual(r.json.trends.items.pass.rates, [0.5, 0.5, 0.5])
  assert.equal(r.json.triggered[0].key, 'pass')
})

// ── 4. 只有 1 轮：趋势不许判（硬红线仍是单轮即时判） ──
test('边界：只有 1 轮且没有硬红线 → 退出 0，趋势未判', () => {
  const home = writeHome('one-round', [round(0, { written: 5, dropped: 5, skipped: 0, kn: 2, ex: 1 })])
  const r = run(home)
  assert.equal(r.code, 0, `只有 1 轮不该报，实际退出 ${r.code}`)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.trends.judged, false)
  assert.match(r.json.trends.reason, /不足 3 轮/)
  assert.equal(r.json.triggered.length, 0)
})

// ── 5. 样本不足 30：3 轮都超丢弃率也不许报 ──
test('边界：3 轮但累计样本 24 <30 → 退出 0，趋势未判', () => {
  const rows = [0, 1, 2].map((i) => round(i, { written: 5, dropped: 3, skipped: 0, kn: 2, ex: 0 }))
  const r = run(writeHome('few-samples', rows))
  assert.equal(r.code, 0)
  assert.equal(r.json.trends.judged, false, '样本 24 不该判趋势')
  assert.match(r.json.trends.reason, /样本 24 条 < 30/)
  assert.equal(r.json.trends.samples, 24)
  assert.equal(r.json.triggered.length, 0)
})

// ── 6. 历史中位数缺口：没有同语料基线 / 基线不足 3 轮，都不许拿通过率硬报 ──
test('边界：通过率 40% 但没有同语料历史 → 不判通过率', () => {
  const rows = [0, 1, 2].map((i) => round(i, { written: 20, dropped: 5, skipped: 25 }))
  const r = run(writeHome('no-baseline', rows))
  assert.equal(r.code, 0, '没有基线不许报')
  assert.equal(r.json.trends.judged, true)
  assert.equal(r.json.trends.items.pass.applicable, false)
  assert.equal(r.json.trends.items.pass.baselineRounds, 0)
  assert.equal(r.json.triggered.length, 0)
})

test('边界：同语料历史只有 2 轮（<3）→ 仍不判通过率', () => {
  const rows = [
    ...[0, 1].map((i) => round(i, { written: 45, dropped: 5, skipped: 0 })), // 90%
    ...[2, 3, 4].map((i) => round(i, { written: 20, dropped: 5, skipped: 25 })), // 40%
  ]
  const r = run(writeHome('thin-baseline', rows))
  assert.equal(r.code, 0, '基线 2 轮 <3，不许报')
  assert.equal(r.json.trends.items.pass.applicable, false)
  assert.equal(r.json.trends.items.pass.baselineRounds, 2)
  assert.equal(r.json.triggered.length, 0)
})

// ── 7. --limit：窗口只回看最近 N 轮（破线轮应漏在窗口外） ──
test('--limit：只看最近 2 轮时，第 3 轮的老红线不进窗口 → 退出 0', () => {
  const home = writeHome('limit-window', Array.from({ length: 6 }, (_, i) => round(i, i === 2 ? { loggy: 1 } : {})))
  const r = run(home, { extra: ['--limit=2'] })
  assert.equal(r.code, 0, `--limit=2 不该看到第 3 轮，实际退出 ${r.code}`)
  assert.equal(r.json.window.rounds, 2)
  assert.equal(r.json.redlines.broken.length, 0)
})

// ── 8. 写读契约：refine.mjs 必须还在写这些字段，否则质量闸读不到 ──
test('契约：refine.mjs 仍追加 refine-metrics.jsonl，字段与本测试一致', () => {
  const src = fs.readFileSync(REFINE, 'utf8')
  assert.match(src, /refine-metrics\.jsonl/, 'refine.mjs 必须写 refine-metrics.jsonl')
  assert.match(src, /function appendRoundMetrics\(/, '写指标必须收在一个函数里（写失败好吞）')
  assert.match(src, /appendFileSync\(file,/, '必须是追加写，不能整份覆盖')
  const calls = src.match(/appendRoundMetrics\(\{ written/g) || []
  assert.ok(calls.length >= 2, `应有定义 + 调用两处，实际 ${calls.length}`)
  for (const field of ['knowledge', 'cited', 'experience', 'shaped', 'loggy', 'paths', 'reKind', 'droppedReasons', 'costYuan', 'retried', 'degraded', 'corpus']) {
    assert.ok(src.includes(field), `refine.mjs 的指标里缺字段：${field}`)
  }
})

// ── 9. 写端：抽出 refine.mjs 里的 appendRoundMetrics 真跑一次（不调模型、只写临时 home） ──
test('写端：appendRoundMetrics 追加一行、字段齐全；写失败不抛', () => {
  const src = fs.readFileSync(REFINE, 'utf8')
  const start = src.indexOf('function appendRoundMetrics(')
  assert.ok(start > 0, 'refine.mjs 里找不到 appendRoundMetrics')
  const end = src.indexOf('\n}\n', start)
  assert.ok(end > start, '函数边界找不稳（格式可能变了）')
  const fnSrc = src.slice(start, end + 3)
  const make = new Function('fs', 'path', 'HOME', 'nowISO', 'LOGGY', `${fnSrc}\nreturn appendRoundMetrics`)
  const writerHome = path.join(TMP, 'writer-home')
  const append = make(fs, path, writerHome, () => '2026-11-03T02:00:00+08:00', /(exit code|退出码)/i)
  const stats = {
    ok: 3, drop: 1, skip: 1, dupNear: 1, retries: 1, fallback: 0,
    cost: 0.01234, ms: 1234, calls: 2, dropReasons: new Map([['批量没返回这一条', 1]]),
  }
  const written = [
    { kind: '知识', head: '《官方文档》说 X', detail: '来源 https://example.com' },
    { kind: '经验', head: '下次遇到要 Y', detail: '先看再改' },
    { kind: '记忆', head: '一条普通记忆', detail: '…', reKind: '知识→记忆（没写出处）' },
  ]
  append({ written, stats, batch: [{ channel: '工作台', day: '2026-11-01' }, { channel: '工作台', day: '2026-11-01' }], mode: 'batch', model: 'deepseek-flash' })
  const file = path.join(writerHome, 'dayu', 'runtime', 'refine-metrics.jsonl')
  const rec = JSON.parse(fs.readFileSync(file, 'utf8').trim())
  assert.equal(rec.at, '2026-11-03T02:00:00+08:00')
  assert.equal(rec.written, 3)
  assert.equal(rec.dropped, 1)
  assert.equal(rec.skipped, 2, '跳过应含模型跳过 + 近似重复')
  assert.equal(rec.reKind, 1, '降级条数')
  assert.deepEqual(rec.knowledge, { total: 1, cited: 1 })
  assert.deepEqual(rec.experience, { total: 1, shaped: 1 })
  assert.equal(rec.loggy, 0)
  assert.equal(rec.paths, 0)
  assert.deepEqual(rec.droppedReasons, { 批量没返回这一条: 1 })
  assert.equal(rec.costYuan, 0.0123)
  assert.equal(rec.ms, 1234)
  assert.equal(rec.calls, 2)
  assert.equal(rec.retried, 1)
  assert.equal(rec.degraded, 0)
  assert.deepEqual(rec.corpus, { channels: ['工作台'], days: ['2026-11-01'], count: 2 })
  // 写失败必须吞掉：把 HOME 指到一个「文件」下面，mkdir 会失败
  const badHome = path.join(TMP, 'not-a-dir')
  fs.writeFileSync(badHome, 'x', 'utf8')
  const appendBad = make(fs, path, badHome, () => 'x', /x/)
  assert.doesNotThrow(() => appendBad({ written, stats, batch: [], mode: 'batch', model: 'm' }), '指标写失败不许影响提炼')
})

const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.error(`\n精提炼质量闸测试：${results.length - failed.length}/${results.length} 通过，${failed.length} 失败`)
  for (const f of failed) console.error(`  ✗ ${f.name}\n    ${f.error}`)
  console.error(`临时目录（未删，按任务书不许删文件）：${TMP}`)
  process.exit(1)
}
console.log(JSON.stringify({
  ok: true,
  cases: results.length,
  passed: results.length,
  tmp: TMP,
  covers: ['健康', '硬红线四条', '连续3轮丢弃率', '连续3轮降级率', '连续3轮通过率低于中位数', '只1轮', '样本不足30', '中位数缺口', 'limit窗口', '写读契约', '写端字段与失败吞掉'],
}))
