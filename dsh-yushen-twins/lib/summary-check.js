// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-summary-check
 * kind: module
 * summary: 总结核对器：拿总结和原文逐条对，只报「漏了什么 / 没依据 / 跟原文反着」，不判真假、不改总结。
 * tags: 总结, 核对, 只读, 漏决定, 无依据, 计划当完成
 * created: 2026-11-15 20:35:00
 * changed: 2026-11-15 20:35:00
 * author: 大鱼·子会话（总结核对器任务）
 * authority: 老板（2026-11-15：做总结核对器最小模块；不自动改总结）
 * audience: 提炼/复盘脚本；以后接模型复核的那一层
 * owner: 框架；**只读、只报告**，不许在这里改总结、改卡、写回任何原文
 * mutable: 可改词表与阈值；输出字段（missing/unsupported/contradict/needs_model）别乱动
 * usage: checkSummary(summary, sources, { now }) → { ok, missing, unsupported, contradict, needs_model, checkedAt, summaryHash }
 * why: 总结常漏决定、把「计划」写成「完成」、写出原文没有的「同意」，现在没人核
 * result: 一份可复核的差异清单，每条带 ref 或 quote；拿不准的进 needs_model，不硬判
 * defaults: 词表、阈值都是本文件里的常量；不是开关
 * off: 不接任何自动流程——没有谁调用 checkSummary，就等于关着
 */
//
// 一句话：这是**核对**，不是**判断**。
//   本地只做三件事：抽词（人名/日期/数字/决定/承诺/完成）、对锚点、比词面。
//   语气、重要性、真假、该信谁——本地一律不判，拿不准就进 needs_model 交给模型/人。
//   输出只读：函数不落盘、不写回总结；落盘/打印由脚本自己决定。
//
// 三类结论怎么来的（判据写在这里，改之前先看）：
//   missing      原文某句有「决定/承诺」标记，总结里连它的内容锚点都没有
//                （锚点覆盖 ≥0.5 算提到；0.34–0.5 进 needs_model；<0.34 且总结里没有同类标记词，才算没提）。
//   unsupported  总结里的人名/日期/数字/决定/承诺/完成，在原文词面里找不到对应依据。
//   contradict   总结说「完成/同意/答应」，而原文同一个锚点只有「计划/打算/还没/未同意」。
//   needs_model  锚点沾边但覆盖不够（换了说法）、或原文有同类词但对象对不上——不硬判，交出去。
//   ok           只有 missing/unsupported/contradict 三条都空才 true；**没给原文时也 false**（核不了 ≠ 通过）。
//
// 已知边界（不是 bug，是本地词面法的上限）：
//   · 人名只认内置词表 + `@名字` + `叫X`；不认别名（大鱼=大肥鱼=阿离）。
//   · 相对日期（明天/下周三）按每条的 at 落地成日期再比；at 缺失时按 now 落地。
//   · 同义改写认不出（「交付」vs「交给你」）；这类靠边界分进 needs_model。
//   · sources 要覆盖被总结的那段上下文；只给片段，缺的部分会被报成 unsupported。
//   · 本地不判语境：清单/文档/引用语里的「承诺」「答应」（例如讲流程时写的“角色级任务/承诺”）
//     也会被抽成一条 claim。这类要么调用方先剔掉文档段，要么人工看 quote 一眼——不在这里猜。

import crypto from 'node:crypto'

const MAX_ITEMS = 50
const MAX_QUOTE = 160

// ── 词表：只决定「抽得出什么」，不参与真假判断 ───────────────────────────
const DECIDE = /(决定|定了|定下来|拍板|说定|就这么|确认|确定|同意|批准|通过|采用|改成|约定|以后都|以后只)/
const PROMISE = /(答应|承诺|保证|说好|约好|记得要|记得去|记得把|包在我|负责)/
const DONE = /((?:已经|已)[^，。！？；\n]{0,10}(?:完成|做完|写完|写好|修好|改好|搞定|跑通|提交|上线|装好|处理完|测完|验证|实现|合并)|(?:做完|写完|写好|修好|改好|搞定|跑通|装好|上线|完成|处理完|测完|合并)了|验证通过|审核通过|通过了)/
const PLAN = /(计划|打算|准备|预计|将要|下一步|待定|还没|尚未|未开始|先不|暂不|待办|todo|回头|之后再说|考虑)/
const DENY = /(没同意|未同意|不同意|没批|未批|不批准|拒绝|否掉|不行|不可以|没答应|未答应|不打算|别做|先别|没通过|未通过|没做完|没写完|没搞定|没提交|没上线|没修好)/
const REL_DAY_SRC = '(今天|今晚|今早|昨天|前天|明天|明早|明晚|后天|大后天|本周[一二三四五六日天]?|这周|下周[一二三四五六日天]?|上周[一二三四五六日天]?|周末|月底前|月底|月初|下个月|这个月|下次)'
const MARKER_ALL = new RegExp([DECIDE, PROMISE, DONE, PLAN, DENY].map((r) => r.source).join('|'), 'g')
const NUM_SRC = '(?<![A-Za-z0-9_])\\d+(?:\\.\\d+)?(?![A-Za-z0-9_])'
const NUM_ALL = new RegExp(NUM_SRC, 'g')
const PUNCT = /[\s\u3000，。！？；：、,.!?;:"'“”‘’（）()【】\[\]{}<>《》〈〉…—－·|/\\~`^*+=&%$#]+/g

const NAME_LEXICON = ['大鱼', '小鱼', '照微', '老板', '主人', '姐姐', '妹妹']
const STOP_CHARS = new Set([...'的了着过吗呢吧啊呀嘛把被就都也还又很再才更太没不我你他她它们这那有是个在给对和与及或而以及之其会要能可做'])

const REL_OFFSET = { 今天: 0, 今晚: 0, 今早: 0, 昨天: -1, 前天: -2, 明天: 1, 明早: 1, 明晚: 1, 后天: 2, 大后天: 3 }
const WEEKDAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }

const pad2 = (n) => String(n).padStart(2, '0')
const clip = (s, n = MAX_QUOTE) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const round = (n) => Number(Number(n).toFixed(2))
const plain = (s) => String(s ?? '').replace(/^\uFEFF/, '').replace(/\u3000/g, ' ')

/** 解析 at / now；解析不了返回 null（不抛）。 */
function parseWhen(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const t = typeof v === 'number' ? v : Date.parse(String(v))
  return Number.isFinite(t) ? new Date(t) : null
}

function isoDay(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 相对日期落地（明天/下周三/月底…）；落不了就返回空串。 */
function resolveDay(word, base) {
  if (!base) return ''
  const d = new Date(base.getTime())
  d.setHours(12, 0, 0, 0)
  if (word in REL_OFFSET) {
    d.setDate(d.getDate() + REL_OFFSET[word])
    return isoDay(d)
  }
  const wk = /^(本周|这周|下周|上周)([一二三四五六日天])?$/.exec(word)
  if (wk) {
    const today = base.getDay() || 7
    const target = wk[2] ? WEEKDAY[wk[2]] : 1
    let delta = target - today
    if (wk[1] === '下周') delta += 7
    if (wk[1] === '上周') delta -= 7
    d.setDate(d.getDate() + delta)
    return isoDay(d)
  }
  if (word === '月底' || word === '月底前') { d.setMonth(d.getMonth() + 1, 0); return isoDay(d) }
  if (word === '月初') { d.setDate(1); return isoDay(d) }
  if (word === '下个月') { d.setMonth(d.getMonth() + 1, 1); return isoDay(d) }
  if (word === '这个月') { d.setDate(1); return isoDay(d) }
  if (word === '周末') {
    const today = base.getDay() || 7
    d.setDate(d.getDate() + (6 - today))
    return isoDay(d)
  }
  return ''
}

function sentences(text) {
  return String(text ?? '').split(/(?<=[。！？!?；;\n])/).map((s) => s.trim()).filter(Boolean)
}

/**
 * 抽日期：绝对日期统一成 YYYY-MM-DD / MM-DD，相对词落地成日期（同时保留原词）。
 * 返回 { list, masked }；masked 已把这些片段抹掉，后面抽数字不会把日期里的数当数字。
 */
function datesOf(text, base) {
  const list = []
  let rest = String(text ?? '')
  rest = rest.replace(/(20\d{2})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})\s*[日号]?/g, (m, y, mo, dd) => {
    const day = `${y}-${pad2(mo)}-${pad2(dd)}`
    list.push({ raw: m, key: day, day })
    return ' '
  })
  rest = rest.replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g, (m, mo, dd) => {
    const key = `${pad2(mo)}-${pad2(dd)}`
    const day = base ? `${base.getFullYear()}-${key}` : ''
    list.push({ raw: m, key, day })
    return ' '
  })
  rest = rest.replace(new RegExp(REL_DAY_SRC, 'g'), (m) => {
    list.push({ raw: m, key: m, day: resolveDay(m, base) })
    return ' '
  })
  return { list, masked: rest }
}

function numbersOf(masked) {
  const out = []
  let m
  NUM_ALL.lastIndex = 0
  while ((m = NUM_ALL.exec(String(masked ?? '')))) {
    out.push({ raw: m[0], key: m[0].replace(/^0+(?=\d)/, '') })
  }
  return out
}

function namesOf(text, lexicon) {
  const s = String(text ?? '')
  const out = new Set()
  for (const n of lexicon) if (n && s.includes(n)) out.add(n)
  for (const m of s.matchAll(/@([\u4e00-\u9fa5]{1,4}|[A-Za-z0-9_]{2,20})/g)) out.add(m[1])
  for (const m of s.matchAll(/叫(?:做)?([\u4e00-\u9fa5]{2,3})/g)) out.add(m[1])
  return [...out]
}

/** 词面切块：汉字按二元组，字母数字按整块。 */
function terms(s) {
  const out = new Set()
  for (const m of String(s ?? '').matchAll(/[\u4e00-\u9fa5]+|[A-Za-z0-9_]+/g)) {
    const t = m[0]
    if (/^[\u4e00-\u9fa5]/.test(t)) {
      if (t.length === 1) out.add(t)
      else for (let i = 0; i + 1 < t.length; i += 1) out.add(t.slice(i, i + 2))
    } else if (t.length > 1 || /\d/.test(t)) out.add(t.toLowerCase())
  }
  return out
}

/** 内容锚点：去掉日期、数字、标记词、停用字之后剩下的词组。 */
function contentTerms(text) {
  const { masked } = datesOf(text, null)
  let s = masked.replace(NUM_ALL, ' ')
  s = s.replace(MARKER_ALL, ' ')
  s = [...s].filter((ch) => !STOP_CHARS.has(ch)).join('')
  return terms(s.replace(PUNCT, ' '))
}

function coverage(needle, hay) {
  if (!needle || !needle.size) return 0
  let hit = 0
  for (const t of needle) if (hay.has(t)) hit += 1
  return hit / needle.size
}

function catOf(text) {
  const t = String(text ?? '')
  // 否定压过肯定：「没同意」里也有「同意」两个字，不能算成同意（否则 未同意 vs 同意 永远判不出来）。
  const deny = DENY.test(t)
  return {
    decide: !deny && DECIDE.test(t),
    promise: !deny && PROMISE.test(t),
    done: !deny && DONE.test(t),
    plan: PLAN.test(t),
    deny,
  }
}

function markerOf(text, cat) {
  const re = cat === 'decide' ? DECIDE : cat === 'promise' ? PROMISE : cat === 'done' ? DONE : null
  if (!re) return ''
  const m = String(text ?? '').match(re)
  return m ? clip(m[0], 20) : ''
}

function sameDay(a, b) {
  if (!a || !b) return false
  if (a.key && a.key === b.key) return true
  if (a.day && b.day && a.day === b.day) return true
  const strip = (x) => String(x.key || '').replace(/^20\d{2}-/, '')
  const ka = strip(a)
  const kb = strip(b)
  return Boolean(ka) && ka === kb
}

/**
 * 把各种形态的 sources 归一成 [{ text, at, turnId, ref }]。
 * 支持：{text,at,turnId,ref} / 思考 turns 的轮次行（user+steps）/ live/raw 的 {type,data} 事件 / 纯字符串。
 * 不认识的项直接跳过，不抛。
 */
function normalizeSources(sources) {
  const list = Array.isArray(sources) ? sources : (sources == null ? [] : [sources])
  const items = []
  for (const raw of list) {
    if (raw == null) continue
    if (typeof raw === 'string') {
      if (raw.trim()) items.push({ text: plain(raw).trim(), at: '', turnId: '', ref: '' })
      continue
    }
    if (typeof raw !== 'object') continue
    const refObj = raw.ref && typeof raw.ref === 'object' ? raw.ref : null
    const base = {
      at: String(raw.at || raw.startedAt || raw.timeISO || (typeof raw.time === 'number' ? new Date(raw.time).toISOString() : '') || ''),
      turnId: String(raw.turnId || ''),
      ref: String(refObj ? `${refObj.file || ''}${refObj.line ? `#L${refObj.line}` : ''}` : (raw.ref || raw.refs?.live || raw.eventKey || '')),
    }
    // ① 直接给了 text（最常见；任务书里的标准形态）
    if (typeof raw.text === 'string' && raw.text.trim()) {
      items.push({ ...base, text: plain(raw.text).trim() })
      continue
    }
    // ② 轮次行（思考/turns 的 turn.v2）：user[] + steps[].say[]
    if (Array.isArray(raw.user) || Array.isArray(raw.steps)) {
      const turnId = base.turnId || String(raw.turnId || `${raw.sessionId || ''}#${raw.turn ?? ''}`)
      const ref = base.ref || String(raw.refs?.live || '')
      const at = base.at || String(raw.startedAt || '')
      for (const u of raw.user || []) {
        if (u && typeof u.text === 'string' && u.text.trim()) items.push({ text: plain(u.text).trim(), at: String(u.at || at), turnId, ref })
      }
      for (const step of raw.steps || []) {
        for (const say of step?.say || []) {
          if (say && typeof say.text === 'string' && say.text.trim()) items.push({ text: plain(say.text).trim(), at: String(say.at || at), turnId, ref })
        }
      }
      continue
    }
    // ③ 原始事件（live/raw 的 {type,data}）
    if (raw.type && raw.data) {
      if (raw.type === 'user/message' || raw.type === 'assistant/message' || raw.type === 'system/message') {
        for (const c of raw.data.content || []) {
          if (c && c.type === 'text' && typeof c.text === 'string' && c.text.trim()) {
            items.push({ text: plain(c.text).trim(), at: base.at, turnId: base.turnId, ref: base.ref })
          }
        }
      }
      continue
    }
  }
  return items
}

function summaryTextOf(summary) {
  if (typeof summary === 'string') return plain(summary)
  if (summary && typeof summary === 'object') return plain(summary.text || summary.summary || '')
  return ''
}

/**
 * 核对一份总结和它对应的原文。
 * @param {string|{text?:string,summary?:string}} summary 总结（只读；不会被改）
 * @param {Array} sources 原文/轮次数组，每项至少含 text；建议带 at/turnId/ref
 * @param {{now?:string|number|Date, names?:string[]|string, maxItems?:number, missingThreshold?:number, matchThreshold?:number, unsureThreshold?:number}} [options]
 * @returns {{ok:boolean, missing:Array, unsupported:Array, contradict:Array, needs_model:Array, checkedAt:string, summaryHash:string, stats:object}}
 */
export function checkSummary(summary, sources, options = {}) {
  const opts = options || {}
  const at = parseWhen(opts.now) || new Date()
  const checkedAt = at.toISOString()
  const maxItems = Number(opts.maxItems) > 0 ? Math.floor(Number(opts.maxItems)) : MAX_ITEMS
  const missAt = Number.isFinite(Number(opts.missingThreshold)) ? Number(opts.missingThreshold) : 0.5
  const matchAt = Number.isFinite(Number(opts.matchThreshold)) ? Number(opts.matchThreshold) : 0.5
  const unsureAt = Number.isFinite(Number(opts.unsureThreshold)) ? Number(opts.unsureThreshold) : 0.34
  const extraNames = Array.isArray(opts.names) ? opts.names : String(opts.names || '').split(',')
  const lexicon = [...new Set([...NAME_LEXICON, ...extraNames.map((s) => String(s).trim()).filter(Boolean)])]

  const sumText = summaryTextOf(summary)
  const summaryHash = crypto.createHash('sha256').update(sumText.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)
  const sumSents = sentences(sumText)
  const srcItems = normalizeSources(sources)
  const stats = { summarySentences: sumSents.length, sourceItems: srcItems.length, sourceSentences: 0, dates: 0, numbers: 0, names: 0 }

  const missing = []
  const unsupported = []
  const contradict = []
  const needs = []
  const base = { ok: true, missing, unsupported, contradict, needs_model: needs, checkedAt, summaryHash, stats }

  if (!sumText.trim()) return { ...base, note: '总结为空，不做核对' }
  if (!srcItems.length) {
    needs.push({ kind: 'needs_model', why: '没有给原文，核对不了（这**不是**"没问题"）', quote: clip(sumText), ref: '', turnId: '', at: checkedAt, from: 'summary' })
    // 核不了 ≠ 核对通过：ok 要 fail-closed，卡流程时不会被"其实没核对"放过去。
    return { ...base, ok: false, note: '没给原文' }
  }

  // ── 总结侧 ──────────────────────────────────────────────────────────
  const sumTerms = new Map()
  const sumAll = new Set()
  for (const s of sumSents) {
    const t = contentTerms(s)
    sumTerms.set(s, t)
    for (const x of t) sumAll.add(x)
  }
  const sumCatHas = { decide: false, promise: false, done: false }
  for (const s of sumSents) {
    const c = catOf(s)
    for (const k of Object.keys(sumCatHas)) if (c[k]) sumCatHas[k] = true
  }

  // ── 原文侧：逐句建索引（原文的 at 本身也算一个日期点）────────────────
  const srcSents = []
  const srcDates = []
  for (const item of srcItems) {
    const when = parseWhen(item.at)
    if (when) srcDates.push({ raw: String(item.at), key: isoDay(when), day: isoDay(when) })
    for (const text of sentences(item.text)) {
      const { list, masked } = datesOf(text, when || at)
      srcSents.push({
        text,
        terms: contentTerms(text),
        dates: list,
        numbers: numbersOf(masked),
        names: new Set(namesOf(text, lexicon)),
        cats: catOf(text),
        at: item.at,
        turnId: item.turnId,
        ref: item.ref,
      })
    }
  }
  const srcAll = new Set()
  const srcNumberKeys = new Set()
  const srcNameSet = new Set()
  for (const s of srcSents) {
    for (const t of s.terms) srcAll.add(t)
    for (const n of s.numbers) srcNumberKeys.add(n.key)
    for (const n of s.names) srcNameSet.add(n)
    for (const d of s.dates) srcDates.push(d)
  }
  stats.sourceSentences = srcSents.length
  stats.dates = srcDates.length
  stats.numbers = srcNumberKeys.size
  stats.names = srcNameSet.size

  const pushUnsupported = (row) => {
    if (unsupported.length >= maxItems) return
    unsupported.push({ kind: row.kind, token: row.token || '', quote: clip(row.quote), why: row.why, from: 'summary' })
  }
  const pushContradict = (row) => {
    if (contradict.length >= maxItems) return
    contradict.push({
      kind: 'contradict',
      cat: row.cat,
      summaryQuote: clip(row.summaryQuote),
      quote: clip(row.quote),
      ref: row.ref || '',
      turnId: row.turnId || '',
      at: row.at || '',
      why: row.why,
    })
  }
  const pushNeeds = (row) => {
    if (needs.length >= maxItems) return
    needs.push({ kind: 'needs_model', why: row.why, quote: clip(row.quote), ref: row.ref || '', turnId: row.turnId || '', at: row.at || '', from: row.from, coverage: row.coverage })
  }

  // ── ① missing：原文有明确决定/承诺，总结没提 ─────────────────────────
  const seenClaim = new Set()
  for (const s of srcSents) {
    if (!s.cats.decide && !s.cats.promise) continue
    const cat = s.cats.decide ? 'decide' : 'promise'
    const key = `${cat}|${s.text}`
    if (seenClaim.has(key)) continue
    seenClaim.add(key)
    if (!s.terms.size) {
      pushNeeds({ why: '这条决定/承诺抽不出关键词，判断不了总结提没提', quote: s.text, ref: s.ref, turnId: s.turnId, at: s.at, from: 'source' })
      continue
    }
    const cov = coverage(s.terms, sumAll)
    if (cov >= missAt) continue
    if (cov >= unsureAt || sumCatHas[cat]) {
      pushNeeds({ why: '原文有决定/承诺，总结里看不出提没提（可能换了说法）', quote: s.text, ref: s.ref, turnId: s.turnId, at: s.at, from: 'source', coverage: round(cov) })
      continue
    }
    if (missing.length >= maxItems) continue
    missing.push({
      kind: 'missing',
      cat,
      quote: clip(s.text),
      ref: s.ref || '',
      turnId: s.turnId || '',
      at: s.at || '',
      why: cat === 'decide' ? '原文有明确决定，总结没提' : '原文有明确承诺，总结没提',
      coverage: round(cov),
    })
  }

  // ── ② 总结侧：人名/日期/数字，一句一句对 ─────────────────────────────
  const seenUnsupported = new Set()
  for (const s of sumSents) {
    const cats = catOf(s)
    const { list: dates, masked } = datesOf(s, at)
    for (const name of namesOf(s, lexicon)) {
      if (srcNameSet.has(name)) continue
      const k = `name|${name}|${s}`
      if (seenUnsupported.has(k)) continue
      seenUnsupported.add(k)
      pushUnsupported({ kind: 'name', token: name, quote: s, why: '总结写了这个人，原文里没出现' })
    }
    for (const d of dates) {
      if (srcDates.some((x) => sameDay(x, d))) continue
      const k = `date|${d.key}|${s}`
      if (seenUnsupported.has(k)) continue
      seenUnsupported.add(k)
      pushUnsupported({ kind: 'date', token: d.raw, quote: s, why: '总结写了这个日期，原文对不上' })
    }
    for (const n of numbersOf(masked)) {
      if (srcNumberKeys.has(n.key)) continue
      const k = `number|${n.key}|${s}`
      if (seenUnsupported.has(k)) continue
      seenUnsupported.add(k)
      pushUnsupported({ kind: 'number', token: n.raw, quote: s, why: '总结写了这个数，原文对不上' })
    }

    // ── ③ 决定/承诺/完成：找原文锚点，看是支持、反对、还是没依据 ─────
    const claimCats = ['done', 'decide', 'promise'].filter((k) => cats[k])
    if (!claimCats.length) continue
    const needle = sumTerms.get(s) || contentTerms(s)
    if (!needle.size) {
      pushNeeds({ why: '这句结论抽不出关键词，判断不了原文有没有依据', quote: s, from: 'summary' })
      continue
    }
    const scored = srcSents
      .map((x) => ({ x, cov: coverage(needle, x.terms) }))
      .filter((r) => r.cov >= matchAt)
      .sort((a, b) => b.cov - a.cov)
    if (!scored.length) {
      if (claimCats.some((k) => srcSents.some((x) => x.cats[k]))) {
        pushNeeds({ why: '原文有同类说法，但对象/细节对不上，不硬判', quote: s, from: 'summary' })
        continue
      }
      const cat = claimCats[0]
      const k = `claim|${cat}|${s}`
      if (!seenUnsupported.has(k)) {
        seenUnsupported.add(k)
        pushUnsupported({
          kind: 'claim',
          token: markerOf(s, cat),
          quote: s,
          why: cat === 'done' ? '总结说完成了，原文找不到依据' : cat === 'decide' ? '总结说同意/定了，原文找不到依据' : '总结说我答应了，原文找不到依据',
        })
      }
      continue
    }

    const hasDone = scored.some((r) => r.x.cats.done)
    const hasDecide = scored.some((r) => r.x.cats.decide)
    const hasPromise = scored.some((r) => r.x.cats.promise)
    const weak = scored.filter((r) => (r.x.cats.plan || r.x.cats.deny) && !r.x.cats.done && !r.x.cats.decide && !r.x.cats.promise)

    if (cats.done && !hasDone) {
      if (weak.length) {
        pushContradict({ cat: 'done', summaryQuote: s, quote: weak[0].x.text, ref: weak[0].x.ref, turnId: weak[0].x.turnId, at: weak[0].x.at, why: '总结写成"完成"，原文只是计划/打算/还没做' })
      } else {
        const k = `claim|done|${s}`
        if (!seenUnsupported.has(k)) {
          seenUnsupported.add(k)
          pushUnsupported({ kind: 'claim', token: markerOf(s, 'done'), quote: s, why: '总结说完成了，原文只提到这件事、没有"完成"的说法' })
        }
      }
      continue
    }
    if (cats.decide && !hasDecide) {
      if (weak.length) {
        pushContradict({ cat: 'agree', summaryQuote: s, quote: weak[0].x.text, ref: weak[0].x.ref, turnId: weak[0].x.turnId, at: weak[0].x.at, why: '总结写成"同意/定了"，原文只是计划或没同意' })
      } else {
        const k = `claim|decide|${s}`
        if (!seenUnsupported.has(k)) {
          seenUnsupported.add(k)
          pushUnsupported({ kind: 'claim', token: markerOf(s, 'decide'), quote: s, why: '总结说同意/定了，原文只提到这件事、没有"同意"的说法' })
        }
      }
      continue
    }
    if (cats.promise && !hasPromise) {
      if (weak.length) {
        pushContradict({ cat: 'promise', summaryQuote: s, quote: weak[0].x.text, ref: weak[0].x.ref, turnId: weak[0].x.turnId, at: weak[0].x.at, why: '总结写成"答应了"，原文只是计划或没答应' })
      } else {
        const k = `claim|promise|${s}`
        if (!seenUnsupported.has(k)) {
          seenUnsupported.add(k)
          pushUnsupported({ kind: 'claim', token: markerOf(s, 'promise'), quote: s, why: '总结说我答应了，原文只提到这件事、没有"答应"的说法' })
        }
      }
    }
  }

  return { ...base, ok: missing.length === 0 && unsupported.length === 0 && contradict.length === 0 }
}
