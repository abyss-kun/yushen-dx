// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-03 01:53｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：精炼加计数与阈值）｜scripts/refine-quality.mjs:1-358｜新增：精提炼质量闸——读 refine-metrics.jsonl，逐轮判四条硬红线，最近 3 轮够 3 轮且样本 ≥30 才判三条趋势；一行结论、--json/--home/--limit｜为什么：10 轮里通过率 54%→100% 大半是换语料，拿单一通过率当闸会误报；要按老板定的口径在真破线时报警，且只报不改提示（第 9 轮给「判水」开口子反而把「只报链接的知识」2→4 条）｜验证：& $node --check scripts/refine-quality.mjs；& $node scripts/test-refine-quality.mjs 全过（健康/四种硬红线/丢弃趋势/只 1 轮/样本不足/中位数缺口/契约）｜可改：可改（阈值可调，判据不许放宽）
//
// 精提炼的质量闸（只读：不写库、不调模型、不改提示词）。
//
// 指标来源：<home>/dayu/runtime/refine-metrics.jsonl，每行一轮；
// 由 scripts/refine.mjs 在一轮真跑结束后追加（写失败不影响提炼）。
//
// 判据（2026-11-03 老板定，口径照 档案/精提炼-10轮-2026-11-03.md 的十轮趋势表）：
//
//   硬红线（窗口内逐轮判，任一轮破一条就报；退出码 1）：
//     ① 知识有出处 = 100%（该轮有知识时）；② 经验成形状 ≥ 95%；
//     ③ 日志混入 = 0；④ 纯路径 = 0。
//
//   趋势（只看窗口内最近 3 轮；这 3 轮累计样本 ≥ 30 条才判；三条任一成立就报）：
//     ① 丢弃率 > 20%（每轮都超才算「连续」）；
//     ② 降级率 > 30%（知识→记忆/经验；分母 = 留下的知识 + 被降级的）；
//     ③ 通过率比近 30 天同语料中位数低 15 个百分点（同语料 = channels+days 相同；
//        基线至少要 3 轮，不够就不判——「历史中位数缺口」不许硬报）。
//
// 三个率怎么算（都只看本轮样本 = 写入 + 丢弃 + 跳过；全等重复不写不算样本）：
//   丢弃率 = 丢弃 / 样本；通过率 = 写入 / 样本；
//   降级率 = 降级 / (降级 + 留下的知识)——分母是这一轮的知识候选，不是全部写入。
//
// 为什么不用单一通过率当闸：10 轮通过率 54%→100%，大半是换语料；
// 硬红线要的是「这一类一条都不许有」，趋势要的是「连续 3 轮都偏」。
// 触发后只出对比报告，不自动改提示——提示的改动是判断，不是阈值能替的。
//
// 用法：
//   node scripts/refine-quality.mjs                    # 默认看最近 10 轮
//   node scripts/refine-quality.mjs --json             # 机器读
//   node scripts/refine-quality.mjs --limit=5          # 只看最近 5 轮（趋势仍看这 5 轮里的最近 3 轮）
//   node scripts/refine-quality.mjs --home=C:\tmp\x    # 测试用：换 home（也认 DSH_HOME）
// 退出码：0 = 正常 / 还没数据；1 = 破硬红线或趋势触发；2 = 用法或读文件出错。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { localISO } from '../lib/clock.js'

// ── 口径（阈值可调；判据本身不许放宽） ──
const HARD = Object.freeze({
  knowledge: 1,      // 知识有出处：100%
  experience: 0.95,  // 经验成形状：≥95%
  loggy: 0,          // 日志混入：0
  paths: 0,          // 纯路径：0
})
const DROP_MAX = 0.20           // 丢弃率 > 20%
const DEGRADE_MAX = 0.30        // 降级率 > 30%
const PASS_GAP = 0.15           // 通过率比同语料中位数低 15 个百分点
const TREND_ROUNDS = 3          // 连续 3 轮
const TREND_MIN_SAMPLES = 30    // 这 3 轮累计样本 ≥30 条
const MEDIAN_DAYS = 30          // 中位数只看近 30 天
const MIN_BASELINE_ROUNDS = 3   // 基线不到 3 轮 = 历史缺口，不判
const DEFAULT_LIMIT = 10        // 默认窗口
const DAY_MS = 24 * 60 * 60 * 1000

const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(`--${name}`)
const opt = (name, fallback = '') => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const wantJson = hasFlag('json')
const home = path.resolve(opt('home', process.env.DSH_HOME || path.join(os.homedir(), '.dsh')))
const metricsFile = path.join(home, 'dayu', 'runtime', 'refine-metrics.jsonl')
const rawLimit = Number(opt('limit', String(DEFAULT_LIMIT)))
const limit = Math.max(1, Math.floor(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT))

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const count = (v) => Math.max(0, Math.floor(num(v)))
const pct = (x) => (x === null || !Number.isFinite(x) ? 'n/a' : `${(x * 100).toFixed(1)}%`)
const round4 = (x) => (x === null || !Number.isFinite(x) ? null : Number(x.toFixed(4)))

/** 一行指标 → 归一化的一轮（所有率都在这里算死，后面只读）。 */
function normalize(raw, atMs) {
  const written = count(raw.written)
  const dropped = count(raw.dropped)
  const skipped = count(raw.skipped)
  const processed = written + dropped + skipped
  const knTotal = count(raw.knowledge?.total)
  const knCited = Math.min(knTotal, count(raw.knowledge?.cited))
  const exTotal = count(raw.experience?.total)
  const exShaped = Math.min(exTotal, count(raw.experience?.shaped))
  const reKind = count(raw.reKind)
  const degradeBase = reKind + knTotal
  return {
    at: String(raw.at || ''),
    atMs,
    written,
    dropped,
    skipped,
    processed,
    reKind,
    knowledge: { total: knTotal, cited: knCited },
    experience: { total: exTotal, shaped: exShaped },
    loggy: count(raw.loggy),
    paths: count(raw.paths),
    droppedReasons: raw.droppedReasons && typeof raw.droppedReasons === 'object' ? raw.droppedReasons : {},
    costYuan: num(raw.costYuan),
    ms: count(raw.ms),
    calls: count(raw.calls),
    retried: count(raw.retried),
    degraded: count(raw.degraded),
    corpus: raw.corpus ?? null,
    dropRate: processed > 0 ? dropped / processed : null,
    // 降级率分母：留下的知识 + 被降级的（= 这一轮的知识候选），不是全部写入
    degradeRate: degradeBase > 0 ? reKind / degradeBase : null,
    passRate: processed > 0 ? written / processed : null,
  }
}

/** 同语料的键：通道 + 日期；取不到就是空串（不拿「未知语料」硬比）。 */
function corpusKey(corpus) {
  if (!corpus) return ''
  if (typeof corpus === 'string') return corpus.trim()
  if (typeof corpus !== 'object') return ''
  const channels = Array.isArray(corpus.channels) ? corpus.channels.map(String).filter(Boolean).sort() : []
  const days = Array.isArray(corpus.days) ? corpus.days.map(String).filter(Boolean).sort() : []
  if (!channels.length && !days.length) return ''
  return `${channels.join('+')}|${days.join('+')}`
}

function median(list) {
  if (!list.length) return null
  const s = [...list].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** 硬红线：一轮破了哪几条（每条都带当时的数值，报告里直接说清）。 */
function redlinesOf(r) {
  const out = []
  if (r.knowledge.total > 0 && r.knowledge.cited / r.knowledge.total < HARD.knowledge - 1e-9) {
    out.push({
      rule: 'knowledge', label: '知识有出处', at: r.at,
      detail: `${r.knowledge.cited}/${r.knowledge.total}（要求 100%）`,
      value: round4(r.knowledge.cited / r.knowledge.total), need: HARD.knowledge,
    })
  }
  if (r.experience.total > 0 && r.experience.shaped / r.experience.total < HARD.experience - 1e-9) {
    out.push({
      rule: 'experience', label: '经验成形状', at: r.at,
      detail: `${r.experience.shaped}/${r.experience.total} = ${pct(r.experience.shaped / r.experience.total)}（要求 ≥95%）`,
      value: round4(r.experience.shaped / r.experience.total), need: HARD.experience,
    })
  }
  if (r.loggy > HARD.loggy) {
    out.push({
      rule: 'loggy', label: '日志混入', at: r.at,
      detail: `${r.loggy} 条（要求 0）`, value: r.loggy, need: HARD.loggy,
    })
  }
  if (r.paths > HARD.paths) {
    out.push({
      rule: 'paths', label: '纯路径', at: r.at,
      detail: `${r.paths} 条（要求 0）`, value: r.paths, need: HARD.paths,
    })
  }
  return out
}

/**
 * 趋势：只看窗口内最近 3 轮。
 * 不在窗口里硬凑历史——「连续」就该是连续跑出来的 3 轮。
 */
function trendsOf(allRounds, win) {
  const tail = win.slice(-TREND_ROUNDS)
  const samples = tail.reduce((s, r) => s + r.processed, 0)
  const items = {
    drop: { label: '丢弃率', threshold: DROP_MAX, applicable: false, triggered: false, rounds: tail.length, rates: [] },
    degrade: { label: '降级率', threshold: DEGRADE_MAX, applicable: false, triggered: false, rounds: tail.length, rates: [] },
    pass: { label: '通过率', threshold: PASS_GAP, applicable: false, triggered: false, rounds: tail.length, rates: [], median: null, baselineRounds: 0, corpus: '' },
  }
  const report = { judged: false, reason: '', rounds: tail.length, samples, aggregate: {}, items }
  if (win.length < TREND_ROUNDS) {
    report.reason = `不足 ${TREND_ROUNDS} 轮（窗口只有 ${win.length} 轮）`
    return report
  }
  if (samples < TREND_MIN_SAMPLES) {
    report.reason = `近 ${TREND_ROUNDS} 轮样本 ${samples} 条 < ${TREND_MIN_SAMPLES}`
    return report
  }
  report.judged = true
  report.reason = 'ok'

  items.drop.rates = tail.map((r) => round4(r.dropRate))
  items.drop.applicable = items.drop.rates.every((x) => x !== null)
  items.drop.triggered = items.drop.applicable && items.drop.rates.every((x) => x > DROP_MAX + 1e-9)

  items.degrade.rates = tail.map((r) => round4(r.degradeRate))
  items.degrade.applicable = items.degrade.rates.every((x) => x !== null)
  items.degrade.triggered = items.degrade.applicable && items.degrade.rates.every((x) => x > DEGRADE_MAX + 1e-9)

  // 通过率：要跟「近 30 天同语料」比；语料对不上或基线不够 → 不判（不许硬报）
  const keys = tail.map((r) => corpusKey(r.corpus))
  const sameCorpus = keys.every((k) => Boolean(k) && k === keys[0])
  items.pass.rates = tail.map((r) => round4(r.passRate))
  items.pass.corpus = sameCorpus ? keys[0] : ''
  if (sameCorpus) {
    const anchor = tail[tail.length - 1].atMs
    const floor = anchor - MEDIAN_DAYS * DAY_MS
    const judged = new Set(tail)
    const history = allRounds.filter((r) => !judged.has(r)
      && r.atMs >= floor && r.atMs <= anchor
      && corpusKey(r.corpus) === keys[0]
      && r.passRate !== null && r.processed > 0)
    items.pass.baselineRounds = history.length
    const baseMedian = median(history.map((r) => r.passRate))
    items.pass.median = round4(baseMedian)
    if (history.length >= MIN_BASELINE_ROUNDS && baseMedian !== null) {
      items.pass.applicable = items.pass.rates.every((x) => x !== null)
      items.pass.triggered = items.pass.applicable && items.pass.rates.every((x) => x < baseMedian - PASS_GAP - 1e-9)
    }
  }

  const aggProcessed = tail.reduce((s, r) => s + r.processed, 0)
  const aggWritten = tail.reduce((s, r) => s + r.written, 0)
  const aggDropped = tail.reduce((s, r) => s + r.dropped, 0)
  const aggReKind = tail.reduce((s, r) => s + r.reKind, 0)
  const aggKn = tail.reduce((s, r) => s + r.knowledge.total, 0)
  report.aggregate = {
    samples: aggProcessed,
    dropRate: round4(aggProcessed > 0 ? aggDropped / aggProcessed : null),
    degradeRate: round4(aggReKind + aggKn > 0 ? aggReKind / (aggReKind + aggKn) : null),
    passRate: round4(aggProcessed > 0 ? aggWritten / aggProcessed : null),
  }
  return report
}

/** 读整份指标文件；坏行只计数，不因为一行坏 JSON 把整份判废。 */
function readMetrics(file) {
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (e && e.code === 'ENOENT') return { rounds: [], badLines: 0, missing: true }
    throw e
  }
  const rounds = []
  let badLines = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let raw = null
    try { raw = JSON.parse(t) } catch { raw = null }
    const atMs = raw && raw.at ? Date.parse(String(raw.at)) : NaN
    if (!raw || typeof raw !== 'object' || !Number.isFinite(atMs)) { badLines += 1; continue }
    rounds.push(normalize(raw, atMs))
  }
  rounds.sort((a, b) => a.atMs - b.atMs)
  return { rounds, badLines, missing: false }
}

function evaluate(rounds, winLimit, meta) {
  const win = rounds.slice(-winLimit)
  const winSamples = win.reduce((s, r) => s + r.processed, 0)
  const broken = win.flatMap((r) => redlinesOf(r))
  const trends = trendsOf(rounds, win)
  const triggered = []
  if (trends.judged) {
    if (trends.items.drop.triggered) {
      triggered.push({ key: 'drop', label: '丢弃率', detail: `近 3 轮 ${trends.items.drop.rates.map(pct).join('/')} > ${pct(DROP_MAX)}`, samples: trends.samples })
    }
    if (trends.items.degrade.triggered) {
      triggered.push({ key: 'degrade', label: '降级率', detail: `近 3 轮 ${trends.items.degrade.rates.map(pct).join('/')} > ${pct(DEGRADE_MAX)}`, samples: trends.samples })
    }
    if (trends.items.pass.triggered) {
      const gap = trends.items.pass.median === null ? 0 : (trends.items.pass.median - Math.min(...trends.items.pass.rates.map((x) => (x === null ? 1 : x))))
      triggered.push({
        key: 'pass', label: '通过率',
        detail: `近 3 轮 ${trends.items.pass.rates.map(pct).join('/')}，同语料中位数 ${pct(trends.items.pass.median)}，低 ${(gap * 100).toFixed(1)} 个百分点`,
        samples: trends.samples,
      })
    }
  }
  const last = rounds.length ? rounds[rounds.length - 1] : null
  let lastCleanAt = ''
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    if (redlinesOf(rounds[i]).length === 0) { lastCleanAt = rounds[i].at; break }
  }
  const totalSamples = rounds.reduce((s, r) => s + r.processed, 0)
  return {
    ok: broken.length === 0 && triggered.length === 0,
    verdict: broken.length === 0 && triggered.length === 0 ? 'ok' : 'broken',
    generatedAt: localISO(),
    home: meta.home,
    file: meta.file,
    window: {
      limit: winLimit,
      rounds: win.length,
      samples: winSamples,
      from: win.length ? win[0].at : '',
      to: win.length ? win[win.length - 1].at : '',
    },
    total: {
      rounds: rounds.length,
      samples: totalSamples,
      badLines: meta.badLines,
      missing: meta.missing,
    },
    lastAt: last ? last.at : '',
    lastCleanAt,
    redlines: {
      thresholds: { knowledge: '100%', experience: '≥95%', loggy: 0, paths: 0 },
      broken,
      lastCleanAt,
    },
    trends,
    triggered,
  }
}

function trendReason(report) {
  const t = report.trends
  if (t.judged) return ''
  return t.reason || '未判'
}

/** 人看的一行结论：破了哪条 / 样本多少 / 上次什么时候。 */
function conclusion(report) {
  if (report.total.missing) {
    return `✅ 精提炼质量闸：还没有指标（${report.file} 不存在；先跑一轮精提炼）`
  }
  const scope = `窗口 ${report.window.rounds} 轮 / 样本 ${report.window.samples} 条`
  const last = `最近一轮 ${report.lastAt || '无'}`
  if (report.ok) {
    const tr = report.trends.judged ? '趋势未触发' : `趋势未判（${trendReason(report)}）`
    return `✅ 精提炼质量闸：正常｜硬红线 0｜${tr}｜${scope}｜${last}`
  }
  const parts = []
  if (report.redlines.broken.length) {
    parts.push(`硬红线 ${report.redlines.broken.length} 条：${report.redlines.broken.map((b) => `${b.label}（${b.at}，${b.detail}）`).join('、')}`)
  }
  if (report.triggered.length) {
    parts.push(`趋势 ${report.triggered.length} 条：${report.triggered.map((t) => `${t.label}（${t.detail}）`).join('、')}`)
  }
  const clean = `上次红线全绿 ${report.lastCleanAt || '无'}`
  return `❌ 精提炼质量闸：破 ${report.redlines.broken.length + report.triggered.length} 条｜${parts.join('；')}｜${scope}｜${last}｜${clean}｜只报不改`
}

function main() {
  let read
  try {
    read = readMetrics(metricsFile)
  } catch (e) {
    console.error(`精提炼质量闸：读不了 ${metricsFile}（${e?.code || e?.message || e}）`)
    return 2
  }
  const report = evaluate(read.rounds, limit, { home, file: metricsFile, badLines: read.badLines, missing: read.missing })
  if (wantJson) console.log(JSON.stringify(report, null, 1))
  else console.log(conclusion(report))
  if (report.total.missing) return 0
  return report.ok ? 0 : 1
}

process.exit(main())
