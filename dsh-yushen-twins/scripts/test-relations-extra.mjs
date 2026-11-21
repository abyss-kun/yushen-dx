// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-03 01:53｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：关系库承诺与印象）｜scripts/test-relations-extra.mjs:1-320｜新增：承诺（lib/promises-rel.js）与印象（lib/impressions.js）的自测，临时家里跑，不碰真 home｜为什么：两块新库没有机器判据，光看代码不知道到期判定、去重累加、坏行容错是不是真成立｜验证：& $node scripts/test-relations-extra.mjs → ok:true、16 项全过；再跑 --home 留一份证据文件｜可改：可改（只许加检查项，别放宽已有断言）
//
// 承诺与印象的自测。覆盖：
//   追加 / 同 who+trait 去重累加 / 到期判定（过去·即将·未来）/ 结清不改内容 /
//   按人过滤 / 坏行跳过 / 顺序两次追加不丢。
//
// 用法（node 不在 PATH 上，用全路径）：
//   & $node scripts/test-relations-extra.mjs                  # 临时家，跑完删
//   & $node scripts/test-relations-extra.mjs --home D:\tmp\x  # 用指定空目录，跑完留证据（指到真 home 会拒跑）
//   & $node scripts/test-relations-extra.mjs --keep           # 临时家不删
// 真 home 一律不碰：DSH_HOME 指向测试家，落盘全部在测试家里。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const argv = process.argv.slice(2)
const optOf = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? String(argv[i + 1] || '') : ''
}
const givenHome = optOf('home').trim()
const keep = Boolean(givenHome) || argv.includes('--keep')
const HOME = givenHome ? path.resolve(givenHome) : fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-rel-extra-'))
// 防呆：--home 不许指到真 home 或已有关系数据的地方（2026-11-03 真踩过：PowerShell 里 $home 是只读变量，
// 参数没传进来，测试就往用户主目录下的 dayu\relations 写了）。空目录才跑，确要写加 --force。
if (givenHome) {
  const target = path.join(HOME, 'dayu', 'relations')
  const realHomes = [os.homedir(), path.join(os.homedir(), '.dsh')].map((p) => path.resolve(p))
  const hasData = ['promises.jsonl', 'impressions.jsonl'].some((f) => fs.existsSync(path.join(target, f)))
  if (realHomes.includes(HOME) || (hasData && !argv.includes('--force'))) {
    console.error(`--home 指到了真 home 或已有数据的地方，拒绝跑：${target}`)
    console.error('换一个空目录；确要写这里加 --force。')
    process.exit(2)
  }
}
fs.mkdirSync(HOME, { recursive: true })
process.env.DSH_HOME = HOME

const P = await import('../lib/promises-rel.js')
const I = await import('../lib/impressions.js')

const BASE = path.join(HOME, 'dayu', 'relations')
const pFile = path.join(BASE, 'promises.jsonl')
const iFile = path.join(BASE, 'impressions.jsonl')
const REAL = path.join(os.homedir(), '.dsh', 'dayu', 'relations')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (ms) => new Date(Date.now() + ms).toISOString()
const stampOf = (p) => { try { const s = fs.statSync(p); return `${s.size}:${s.mtimeMs}` } catch { return '' } }
const realBefore = stampOf(REAL)
const linesOf = (file) => {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim()) } catch { return [] }
}
const rowsOf = (file) => linesOf(file).map((line) => {
  try { return JSON.parse(line) } catch { return null }
}).filter(Boolean)

const checks = []
const check = (name, fn) => { fn(); checks.push(name) }
let summary = null

try {
  // ── 路径：默认在家目录，baseDir 可注入 ────────────────────────────────
  check('路径：默认在家目录，baseDir 可注入', () => {
    assert.equal(P.promiseFile(), pFile)
    assert.equal(I.impressionFile(), iFile)
    const elsewhere = path.join(HOME, '注入')
    assert.equal(P.promiseFile({ baseDir: elsewhere }), path.join(elsewhere, 'promises.jsonl'))
    assert.equal(I.impressionFile({ baseDir: elsewhere }), path.join(elsewhere, 'impressions.jsonl'))
  })

  // ── 承诺：追加 ────────────────────────────────────────────────────
  check('承诺：追加一条，字段齐、落 jsonl', () => {
    const r = P.addPromise({
      who: '老板', what: '把关系库的承诺与印象补完',
      madeAt: at(-2 * HOUR), dueAt: at(2 * DAY), note: '本任务书', source: '测试',
    })
    assert.equal(r.ok, true, r.reason)
    assert.match(r.promise.id, /^pr-[0-9a-f]{10}$/)
    const rows = rowsOf(pFile)
    assert.equal(rows.length, 1)
    const row = rows[0]
    assert.equal(row.id, r.promise.id)
    assert.equal(row.who, '老板')
    assert.equal(row.status, 'open')
    assert.equal(row.note, '本任务书')
    assert.ok(row.madeAt && row.dueAt && row.at && row.source, 'at/source/madeAt/dueAt 都要有')
  })

  check('承诺：who/what 空、dueAt 认不出、status 非法都拒，且不写盘', () => {
    const count = linesOf(pFile).length
    assert.equal(P.addPromise({ who: '', what: 'x' }).ok, false)
    assert.equal(P.addPromise({ who: '老板', what: '   ' }).ok, false)
    assert.equal(P.addPromise({ who: '老板', what: 'x', dueAt: '不是时间' }).ok, false)
    assert.equal(P.addPromise({ who: '老板', what: 'x', status: 'done' }).ok, false)
    assert.equal(linesOf(pFile).length, count, '被拒的追加不能留下半条')
  })

  // ── 承诺：到期判定 ────────────────────────────────────────────────
  let pastId = ''
  let soonId = ''
  let futureId = ''
  let undatedId = ''
  check('到期：过去/即将/未来分档正确，未结才算', () => {
    const nowMs = Date.now()
    const openBefore = P.duePromises(nowMs).openCount
    pastId = P.addPromise({ who: '老板', what: '昨天就该交的东西', dueAt: at(-3 * HOUR) }).promise.id
    soonId = P.addPromise({ who: '老板', what: '20 小时内要交的东西', dueAt: at(20 * HOUR) }).promise.id
    futureId = P.addPromise({ who: '老板', what: '三天后的事', dueAt: at(3 * DAY) }).promise.id
    undatedId = P.addPromise({ who: '老板', what: '没写期限的事' }).promise.id
    const due = P.duePromises(nowMs)
    assert.equal(due.ok, true)
    assert.deepEqual(due.overdue.map((r) => r.id), [pastId])
    assert.deepEqual(due.soon.map((r) => r.id), [soonId])
    assert.equal(due.openCount, openBefore + 4)
    assert.equal(due.undated, 1)
    assert.ok(due.overdue[0].overdueByMs > 2.9 * HOUR, '过期时长要算出来')
    assert.ok(due.soon[0].dueInMs > 19.9 * HOUR && due.soon[0].dueInMs < 20.1 * HOUR, '剩余时长要算出来')
    // 自定义窗口：只看 1 小时内到期的 → 一条都没有
    assert.equal(P.duePromises(nowMs, { soonMs: HOUR }).soon.length, 0)
    // 未来那条、没期限那条都不进任何一张表
    const listed = [...due.overdue, ...due.soon].map((r) => r.id)
    assert.ok(!listed.includes(futureId) && !listed.includes(undatedId))
  })

  // ── 承诺：结清 ────────────────────────────────────────────────────
  check('结清：只改状态与备注，内容一个不动、记录不删', () => {
    const linesBefore = linesOf(pFile).length
    const rowBefore = rowsOf(pFile).find((r) => r.id === pastId)
    const r = P.settlePromise(pastId, {
      status: 'kept', note: '补交了',
      what: '想偷改内容', dueAt: at(9 * DAY), who: '别人', // 夹带：一律不许改
    })
    assert.equal(r.ok, true, r.reason)
    const rowAfter = rowsOf(pFile).find((x) => x.id === pastId)
    assert.equal(rowAfter.status, 'kept')
    assert.equal(rowAfter.note, '补交了')
    assert.equal(rowAfter.what, rowBefore.what)
    assert.equal(rowAfter.who, rowBefore.who)
    assert.equal(rowAfter.madeAt, rowBefore.madeAt)
    assert.equal(rowAfter.dueAt, rowBefore.dueAt)
    assert.ok(rowAfter.settledAt, '结清要留下 settledAt')
    assert.equal(linesOf(pFile).length, linesBefore, '结清不许加行也不许删行')
    // 结清后不再进 overdue
    assert.ok(!P.duePromises(Date.now()).overdue.some((x) => x.id === pastId))
    // 非法状态 / 未知 id：拒绝，不动文件
    assert.equal(P.settlePromise(pastId, { status: 'done' }).ok, false)
    assert.equal(P.settlePromise('pr-不存在', { status: 'kept' }).ok, false)
    assert.equal(linesOf(pFile).length, linesBefore)
  })

  // ── 承诺：按人过滤 ────────────────────────────────────────────────
  check('承诺：按人过滤，未结在前、已结在后', () => {
    assert.equal(P.addPromise({ who: '群友甲', what: '答应帮他找资料', dueAt: at(DAY) }).ok, true)
    const boss = P.promisesOf('老板')
    assert.ok(boss.length >= 4)
    assert.ok(boss.every((r) => r.who === '老板'))
    assert.deepEqual(P.promisesOf('老板', { status: 'kept' }).map((r) => r.id), [pastId])
    assert.deepEqual(P.promisesOf('群友甲').map((r) => r.what), ['答应帮他找资料'])
    assert.deepEqual(P.promisesOf('查无此人'), [])
    const statuses = boss.map((r) => r.status)
    const lastOpen = statuses.lastIndexOf('open')
    const firstSettled = statuses.findIndex((s) => s !== 'open')
    if (lastOpen >= 0 && firstSettled >= 0) assert.ok(lastOpen < firstSettled, '未结的应排在已结前面')
  })

  // ── 印象：追加与去重累加 ──────────────────────────────────────────
  let firstImpressionId = ''
  check('印象：追加一条', () => {
    const r = I.addImpression({ who: '老板', trait: '说话直接', evidence: '第一句就说别写客套话', weight: 3 })
    assert.equal(r.ok, true, r.reason)
    assert.equal(r.created, true)
    assert.equal(r.count, 1)
    firstImpressionId = r.impression.id
    assert.equal(linesOf(iFile).length, 1)
    const row = rowsOf(iFile)[0]
    assert.equal(row.who, '老板')
    assert.equal(row.trait, '说话直接')
    assert.equal(row.weight, 3)
    assert.ok(row.at && row.updatedAt, 'at/updatedAt 都要有')
  })

  check('印象：同一 who+trait 只累加 count，不重复堆', () => {
    const r = I.addImpression({ who: '老板', trait: '说话直接', evidence: '又提醒了一次', weight: 3 })
    assert.equal(r.created, false)
    assert.equal(r.count, 2)
    assert.equal(linesOf(iFile).length, 1, '同一 who+trait 不该多出一行')
    const row = rowsOf(iFile)[0]
    assert.equal(row.count, 2)
    assert.equal(row.evidence, '又提醒了一次', 'evidence 换成最新的')
    assert.equal(row.id, firstImpressionId, '累加不换 id')
    // 不带 weight / evidence 再记一次：都保留旧值
    const r2 = I.addImpression({ who: '老板', trait: '说话直接' })
    assert.equal(r2.ok, true)
    assert.equal(r2.count, 3)
    assert.equal(rowsOf(iFile)[0].weight, 3)
    assert.equal(rowsOf(iFile)[0].evidence, '又提醒了一次')
    assert.equal(I.addImpression({ who: '老板', trait: '说话直接', weight: '很重' }).ok, false)
  })

  check('印象：按 weight/count 排序取前 N、按人过滤', () => {
    I.addImpression({ who: '老板', trait: '很在意证据', evidence: '每步都要跑命令', weight: 9 })
    I.addImpression({ who: '老板', trait: '会记住细节', evidence: '提过一次就记住', weight: 5 })
    I.addImpression({ who: '群友甲', trait: '爱熬夜', evidence: '凌晨三点还在', weight: 8 })
    const top = I.impressionsOf('老板', { limit: 2 })
    assert.deepEqual(top.map((r) => r.trait), ['很在意证据', '会记住细节'])
    assert.ok(top.every((r) => r.who === '老板'), '不能混进别人的')
    assert.equal(I.impressionsOf('老板').length, 3)
    assert.deepEqual(I.impressionsOf('群友甲').map((r) => r.trait), ['爱熬夜'])
    assert.deepEqual(I.impressionsOf('查无此人'), [])
    // 同 weight 时 count 大的在前
    I.addImpression({ who: '老板', trait: '很少说话', evidence: '一天没两句', weight: 5 })
    I.addImpression({ who: '老板', trait: '很少说话', evidence: '第二天也没说' })
    const tie = I.impressionsOf('老板', { limit: 3 }).map((r) => r.trait)
    assert.deepEqual(tie, ['很在意证据', '很少说话', '会记住细节'])
  })

  // ── 坏行：跳过，不炸，也不被顺手清掉 ──────────────────────────────
  check('坏行：印象读/追加都不炸，坏行原地留着', () => {
    fs.appendFileSync(iFile, 'not-json-at-all\n', 'utf8')
    const before = I.impressionsOf('老板').length
    assert.ok(before >= 3)
    const r = I.addImpression({ who: '老板', trait: '坏行之后', evidence: '还能记', weight: 2 })
    assert.equal(r.ok, true, r.reason)
    assert.equal(I.impressionsOf('老板').length, before + 1)
    assert.ok(fs.readFileSync(iFile, 'utf8').includes('not-json-at-all'), '坏行不该被顺手清掉')
    assert.ok(!I.allImpressions().some((x) => x.trait === 'not-json-at-all'))
  })

  check('坏行：承诺读/追加/结清都不炸，坏行原地留着', () => {
    fs.appendFileSync(pFile, '{"id":"坏行",这不是 JSON\n', 'utf8')
    const due = P.duePromises(Date.now())
    assert.equal(due.ok, true)
    assert.equal(due.openCount, P.promisesOf('').filter((r) => r.status === 'open').length)
    const before = linesOf(pFile).length
    const added = P.addPromise({ who: '老板', what: '坏行之后还能追加' })
    assert.equal(added.ok, true, added.reason)
    assert.equal(linesOf(pFile).length, before + 1)
    const openId = P.promisesOf('老板', { status: 'open' })[0].id
    const settled = P.settlePromise(openId, { status: 'missed', note: '坏行也在也能结' })
    assert.equal(settled.ok, true, settled.reason)
    assert.ok(fs.readFileSync(pFile, 'utf8').includes('这不是 JSON'), '结清不该顺手清掉坏行')
    assert.ok(!P.allPromises().some((x) => x.what === '坏行'))
  })

  // ── 并发追加：顺序写两次 / 连写 20 条 ─────────────────────────────
  check('并发追加：顺序写两次，两条都在、行数涨 2', () => {
    const before = linesOf(pFile).length
    const a = P.addPromise({ who: '老板', what: '第一笔连写' })
    const b = P.addPromise({ who: '老板', what: '第二笔连写' })
    assert.equal(a.ok && b.ok, true)
    assert.equal(linesOf(pFile).length, before + 2)
    const ids = new Set(rowsOf(pFile).map((r) => r.id))
    assert.ok(ids.has(a.promise.id) && ids.has(b.promise.id), '两次追加都不能丢')
  })

  check('并发追加：连写 20 条一条不少', () => {
    const before = P.promisesOf('连写').length
    const rs = Array.from({ length: 20 }, (_, i) => P.addPromise({ who: '连写', what: `第 ${i + 1} 笔` }))
    assert.ok(rs.every((r) => r.ok))
    assert.equal(P.promisesOf('连写').length, before + 20)
  })

  // ── 约束：零依赖、不联网、不碰真 home ─────────────────────────────
  check('怪参数：null / 不是对象也不炸', () => {
    assert.equal(P.addPromise(null).ok, false)
    assert.equal(P.addPromise({ who: '老板', what: 'null 选项也能写' }, null).ok, true)
    assert.equal(P.settlePromise(null, null, null).ok, false)
    assert.equal(P.duePromises(Date.now(), null).ok, true)
    assert.ok(P.promisesOf(null, null).length >= 1)
    assert.equal(I.addImpression(null).ok, false)
    assert.equal(I.addImpression({ who: '老板', trait: '怪参数' }, null).ok, true)
    assert.ok(I.impressionsOf(null, null).length >= 1)
  })

  check('零依赖：只 import node 内置和本地文件，不联网、不调模型', () => {
    for (const rel of ['../lib/promises-rel.js', '../lib/impressions.js']) {
      const src = fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
      const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
      assert.ok(imports.length > 0)
      assert.ok(imports.every((s) => s.startsWith('node:') || s.startsWith('./')), `${rel} 有第三方依赖：${imports.join(',')}`)
      assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src.replace(/\/\/.*$/gm, '')), `${rel} 不该联网`)
    }
  })

  check('不碰真 home：所有落盘都在测试家里', () => {
    assert.equal(stampOf(REAL), realBefore, '测试不该动真的 ~/.dsh/dayu/relations')
    for (const file of [pFile, iFile]) {
      assert.ok(fs.existsSync(file), `应该落盘：${file}`)
      assert.ok(path.resolve(file).startsWith(path.resolve(HOME)), `落盘越界：${file}`)
    }
    assert.ok(!fs.existsSync(path.join(HOME, '注入')), '只核对路径，不该真建目录')
  })

  summary = {
    ok: true,
    checks: checks.length,
    names: checks,
    promises: (() => {
      const due = P.duePromises(Date.now())
      return {
        rows: P.allPromises().length,
        lines: linesOf(pFile).length,
        open: due.openCount,
        overdue: due.overdue.length,
        soon: due.soon.length,
        undated: due.undated,
      }
    })(),
    impressions: { rows: I.allImpressions().length, lines: linesOf(iFile).length },
    files: [pFile, iFile],
    home: keep ? HOME : '（临时家已删）',
  }
} finally {
  if (!keep) fs.rmSync(HOME, { recursive: true, force: true })
}

console.log(JSON.stringify(summary, null, 1))
