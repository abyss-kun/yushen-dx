/* 标签
 * id: lib-recall-view
 * kind: module
 * summary: 按模式/任务/上下文余量选“索引 / 预览 / 全文”，默认不把完整当每轮全文。
 * audience: 召回入口、注入、页面召回模式
 * owner: 框架；只选视图，不读不写记忆
 * usage: chooseRecallView({mode,task,hasPreview,hasFull,explicitFull,contextPct}) → {view,maxChars,why}
 *        shapeRecallView({mode,task,items,episodes,mechanisms,explicitFull,contextPct}) → {view,maxChars,why,items,episodes,mechanisms,fullEntry?}
 * tags: 召回, 索引, 预览, 全文, 按需, 省上下文, 纯函数
 * created: 2026-11-17 18:52:00
 * changed: 2026-11-17 19:20:15
 * author: 照微·子会话（实现代理）
 * authority: 老板：2026-11-17 任务书——「索引/预览/全文」按需选择纯函数
 * why: 召回的东西一多，每条都甩全文会把上下文吃光；但只给标题又不够用。
 *      要能按模式、有没有预览/全文、任务里有没有明说「看原文」、上下文还剩多少，
 *      选一个档，并给出上限和人话理由——而不是把「完整」当成每轮都全文。
 * result: chooseRecallView 只返回 {view, maxChars, why}；explainView 一句话解释。
 *         shapeRecallView 把档位落到召回条目上：index 裁剪条目，preview 原样返回，
 *         full 只多一个 fullEntry 入口（指针 + 怎么展开），**不塞正文**。
 *         全都无 IO、无随机、无时间依赖，同一输入永远同一结果。
 * mutable: 可改（改档位上限/触发词/条目裁剪口径时，必须同步 scripts/test-recall-view.mjs 和 scripts/test-recall-view-wire.mjs）
 *
 * 边界：
 *   · 默认 balanced：有预览给预览，没预览回落索引，绝不默认全文；
 *   · full（完整）只是「允许更全」，不等于每轮全文；只有 explicitFull 或任务里
 *     明确要看原文（「看原文」「全文发我」）才给全文；
 *   · 上下文 >85% 时一票否决全文（哪怕 explicitFull / 任务明说也不行）；
 *   · 没有全文可取时，明确要看原文也只给预览；连预览都没有才回索引。
 *   · explicitFull 是调用方「用户亲手点了查看原文」的强信号，可以越过省流/平衡模式，
 *     但越不过 85% 那条线。
 *   · shapeRecallView 只是把档位落到条目上：preview/full 不改传入条目，
 *     full 的 fullEntry 是**指针**（kind/path/怎么展开），永远不带正文。
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）

/** 三个档位。 */
export const VIEWS = Object.freeze(['index', 'preview', 'full'])

/** 每档最多放多少字（按非空白字符口径，与 docs/注入分层.md 一致）。 */
export const VIEW_LIMITS = Object.freeze({
  index: 600,
  preview: 2400,
  full: 12000,
})

/** 上下文占用超过这个百分比，就不许再拉全文。 */
export const TIGHT_CONTEXT_PCT = 85

/**
 * 每档在「一次召回」里怎么落地：给几条、每条摘多少字。
 * preview/full 给 null = 不动调用方已经整理好的条目（默认行为一个字都不改）；
 * 只有 index（省流）才真的裁剪成「更少、更短」。
 */
export const VIEW_SHAPE = Object.freeze({
  index: Object.freeze({ itemCap: 3, snippetChars: 60, sideCap: 1 }),
  preview: Object.freeze({ itemCap: null, snippetChars: null, sideCap: null }),
  full: Object.freeze({ itemCap: null, snippetChars: null, sideCap: null }),
})

const MODE_ALIASES = new Map([
  ['thrifty', 'thrifty'],
  ['saver', 'thrifty'],
  ['save', 'thrifty'],
  ['brief', 'thrifty'],
  ['compact', 'thrifty'],
  ['index', 'thrifty'],
  ['省流', 'thrifty'],
  ['省', 'thrifty'],
  ['摘要', 'thrifty'],
  ['balanced', 'balanced'],
  ['balance', 'balanced'],
  ['normal', 'balanced'],
  ['default', 'balanced'],
  ['preview', 'balanced'],
  ['平衡', 'balanced'],
  ['默认', 'balanced'],
  ['full', 'full'],
  ['complete', 'full'],
  ['detail', 'full'],
  ['detailed', 'full'],
  ['全文', 'full'],
  ['完整', 'full'],
  ['完整版', 'full'],
  ['详细', 'full'],
])

const VIEW_ALIASES = new Map([
  ['index', 'index'],
  ['索引', 'index'],
  ['目录', 'index'],
  ['摘要', 'index'],
  ['preview', 'preview'],
  ['预览', 'preview'],
  ['摘录', 'preview'],
  ['full', 'full'],
  ['全文', 'full'],
  ['完整', 'full'],
  ['完整版', 'full'],
  ['原文', 'full'],
])

// 任务里「要看原文」的明确说法：动词 + 原文/全文，或者原文 + 给/发/贴。
// 故意不把单独的「完整」算进来——「把功能做完整」不是要看全文。
const FULL_REQUEST_PATTERNS = Object.freeze([
  /(?:看|读|翻|要|给|发|贴|拉|查|打开|调出|展示|输出|列出|贴出)(?:一下|下|出|来|个|份)?[^，。；！？\n]{0,6}(?:原文|全文|原话|完整版|整篇|一字不差)/,
  /(?:原文|全文|原话|完整版|整篇)[^，。；！？\n]{0,6}(?:给|发|贴|看|读|来|拿出|调出|列出)/,
  /一字不差|(?:别|不要)(?:截断|删)(?:原文|全文)/,
  /\b(?:read|show|give|send|print|paste|open)\b[^.!?\n]{0,24}\b(?:full text|entire text|whole text|verbatim)\b/i,
  /\bverbatim\b/i,
])

// 「不用看原文」「别给我全文」这类否定：先挡掉，免得把拒绝当成要求。
const NEGATED_FULL_RE = /(?:不用|不要|不必|无需|没必要|先别|别|不想)(?:再|急着|先|马上)?(?:(?:看|读|翻|给|发|贴|要|拉|列|打开|调出|展示|输出)(?:一下|下|出|来|个|份)?[^，。；！？\n]{0,4})?(?:原文|全文|原话|完整版|整篇|完整内容)/

function normalizeMode(raw) {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  return MODE_ALIASES.get(key) || null
}

function normalizeView(raw) {
  if (typeof raw !== 'string') return ''
  return VIEW_ALIASES.get(raw.trim().toLowerCase()) || ''
}

/**
 * 接受 0~100 的百分数，也接受 0~1 的小数（0.86 = 86%）。
 * 非数字、负数一律按 0；超过 100 按 100。
 */
function normalizePct(value) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  const pct = n <= 1 ? n * 100 : n
  return Math.min(100, pct)
}

function fmtPct(pct) {
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1)
}

function short(text, max = 12) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** 任务里是不是明确要看原文（否定说法不算）。 */
export function taskWantsFull(task) {
  if (typeof task !== 'string') return false
  const text = task.trim()
  if (!text) return false
  if (NEGATED_FULL_RE.test(text)) return false
  return FULL_REQUEST_PATTERNS.some((re) => re.test(text))
}

/**
 * 选这次召回给哪一档。
 *
 * @param {object} [input]
 * @param {string} [input.mode='balanced'] 省流 thrifty / 平衡 balanced / 完整 full（也认中文）
 * @param {string} [input.task=''] 这次要干什么；里面明说「看原文/全文发我」才算要全文
 * @param {boolean} [input.hasPreview=false] 有没有预览可取
 * @param {boolean} [input.hasFull=false] 有没有全文可取
 * @param {boolean} [input.explicitFull=false] 用户是不是亲手点了「查看原文」
 * @param {number} [input.contextPct=0] 上下文已占百分比（0.86 也认作 86%）
 * @returns {{view: 'index'|'preview'|'full', maxChars: number, why: string}}
 */
export function chooseRecallView(input = {}) {
  const opts = input && typeof input === 'object' ? input : {}
  const rawMode = typeof opts.mode === 'string' ? opts.mode : ''
  const modeKey = normalizeMode(rawMode) || 'balanced'
  const hasPreview = opts.hasPreview === true
  const hasFull = opts.hasFull === true
  const explicitFull = opts.explicitFull === true
  const pct = normalizePct(opts.contextPct)
  const tight = pct > TIGHT_CONTEXT_PCT
  const asked = explicitFull || taskWantsFull(opts.task)

  const prefix = rawMode.trim() && !normalizeMode(rawMode)
    ? `没听过模式「${short(rawMode)}」，按平衡模式处理。`
    : ''

  let view
  let why

  if (asked) {
    // 明确要原文：这是最强信号，可以越过省流/平衡模式，但越不过 85% 那条线。
    if (hasFull && !tight) {
      view = 'full'
      why = `明确要看原文${modeKey === 'thrifty' ? '（优先于省流模式）' : ''}，`
        + `且上下文只用 ${fmtPct(pct)}%：给全文（≤${VIEW_LIMITS.full} 字）。`
    } else {
      const reasons = []
      if (tight) reasons.push(`上下文已占 ${fmtPct(pct)}%（超过 ${TIGHT_CONTEXT_PCT}%），不许再拉全文`)
      if (!hasFull) reasons.push('这次没有全文可取')
      const lead = reasons.length ? `${reasons.join('；')}：` : ''
      if (hasPreview) {
        view = 'preview'
        why = `${lead}给预览（≤${VIEW_LIMITS.preview} 字）；真要原文，等上下文宽裕或先腾地方。`
      } else {
        view = 'index'
        why = `${lead}又没有预览，只给索引（≤${VIEW_LIMITS.index} 字）。`
      }
    }
  } else if (modeKey === 'thrifty') {
    view = 'index'
    why = `省流模式：只给索引和指针（≤${VIEW_LIMITS.index} 字），知道东西在哪；要看细节再展开。`
  } else if (modeKey === 'full') {
    view = hasPreview ? 'preview' : 'index'
    why = hasPreview
      ? `完整模式只表示「允许更全」，不等于每轮都吃全文：这次没明确要看原文，先给预览（≤${VIEW_LIMITS.preview} 字）。`
      : `完整模式不等于每轮全文：这次没明确要看原文，又没有预览可用，先给索引（≤${VIEW_LIMITS.index} 字）。`
  } else {
    view = hasPreview ? 'preview' : 'index'
    why = hasPreview
      ? `平衡模式：给预览（关键段落，≤${VIEW_LIMITS.preview} 字）；要看全文得明说。`
      : `平衡模式但没有预览可用：回落到索引（≤${VIEW_LIMITS.index} 字），不直接甩全文。`
  }

  return { view, maxChars: VIEW_LIMITS[view], why: prefix + why }
}

/**
 * 一句话解释某一档是干什么的（给界面/她自己看）。
 * 不认识的视图名按索引解释，不抛错。
 */
export function explainView(view) {
  const key = normalizeView(view)
  if (key === 'index') {
    return '索引：只给标题和指针，最省上下文，知道东西在哪；要看细节再展开。'
  }
  if (key === 'preview') {
    return '预览：给关键段落和结论，省上下文又不至于只剩标题；真要原文再要一次。'
  }
  if (key === 'full') {
    return '全文：一字不差给原文，最费上下文，只在明确要看原文且上下文宽裕时用。'
  }
  return '不认识的视图名，按索引处理：只给标题和指针，要看细节再展开。'
}

// 全文入口怎么走：只指路，不带原文。yushen_recall 的展开参数。
const FULL_ENTRY_HOW = Object.freeze([
  '事件段：yushen_recall { episodeId } 展开原文片段',
  '节点：yushen_recall { nodeId, nodeKind: episode|card|mechanism } 拉相关网',
  '整件事：yushen_recall { nodeId, toc: true } 看目录和全文入口',
])

/** 入口清单：只留能展开的指针，不复制正文。 */
function buildFullEntry(items, { granted = false } = {}) {
  const refs = []
  const seen = new Set()
  for (const it of items) {
    const p = String(it?.path || '').trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    refs.push({ kind: it.kind || 'file', title: short(it.title, 40), path: p })
    if (refs.length >= 3) break
  }
  return {
    kind: 'pointer',
    granted: granted === true,
    hint: granted
      ? '你明确要看原文、上下文也宽裕：这里只给入口，没把全文塞进返回——别当成已经读过，要原文就按 how 展开。'
      : '这次只有「允许更全」、没有「用户亲手点原文」的强信号：入口在这，要原文自己按 how 展开，别当成已经读过。',
    refs,
    how: [...FULL_ENTRY_HOW],
  }
}

/**
 * 把选出来的档落到一次召回的结果上（纯函数：不改入参、不读不写、不调模型）。
 *
 * 默认行为必须和没有这个函数时一样：
 *   · 默认 balanced → preview → items 原样返回（同引用），不裁剪、不重排、不加字段；
 *   · 只有 thrifty → index 才真的裁剪：最多 3 条、每条摘要最多 60 字，
 *     事件段/机制各留 1 条；
 *   · full 也只给「入口」：items 仍是原条目，fullEntry 只带指针和展开方法，
 *     不复制任何正文；explicitFull 且上下文不紧时 granted=true（措辞不同而已）。
 *
 * @param {object} [input]
 * @param {string} [input.mode]
 * @param {string} [input.task]
 * @param {Array<object>} [input.items] 已经整理好的召回条目（title/path/snippet/at…）
 * @param {Array<object>} [input.episodes]
 * @param {Array<object>} [input.mechanisms]
 * @param {boolean} [input.explicitFull]
 * @param {number} [input.contextPct]
 * @returns {{view:string, maxChars:number, why:string, items:Array, episodes:Array, mechanisms:Array, fullEntry?:object}}
 */
export function shapeRecallView(input = {}) {
  const opts = input && typeof input === 'object' ? input : {}
  const items = Array.isArray(opts.items) ? opts.items : []
  const episodes = Array.isArray(opts.episodes) ? opts.episodes : []
  const mechanisms = Array.isArray(opts.mechanisms) ? opts.mechanisms : []
  const explicitFull = opts.explicitFull === true

  // 这里说的「有预览」= 有东西可看（条目本身就是预览：摘要没有也还有标题/指针）；
  // 「有全文」= 至少有一条能按指针展开的条目。都是看已有条目判断，不另读文件。
  const hasPreview = items.length > 0
  const hasFull = items.some((it) => String(it?.path || '').trim())

  const plan = chooseRecallView({
    mode: opts.mode,
    task: opts.task,
    hasPreview,
    hasFull,
    explicitFull,
    contextPct: opts.contextPct,
  })

  const shape = VIEW_SHAPE[plan.view] || VIEW_SHAPE.preview
  const trimmed = plan.view === 'index'

  return {
    view: plan.view,
    maxChars: plan.maxChars,
    why: plan.why,
    items: trimmed
      ? items.slice(0, shape.itemCap).map((it) => (
        { ...it, snippet: String(it?.snippet || '').slice(0, shape.snippetChars) }
      ))
      : items,
    episodes: trimmed ? episodes.slice(0, shape.sideCap) : episodes,
    mechanisms: trimmed ? mechanisms.slice(0, shape.sideCap) : mechanisms,
    // full 也只有一个入口：不塞正文。granted 只在「用户亲手点原文」时为真，
    // 且走到这里说明上下文没超 85%（超了 chooseRecallView 会给 preview，进不来）。
    ...(plan.view === 'full' ? { fullEntry: buildFullEntry(items, { granted: explicitFull }) } : {}),
  }
}
