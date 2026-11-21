/* 标签
 * id: lib-query-rewrite
 * kind: module
 * summary: 语义检索第一档：别名表 + 查询改写。零成本——不调模型、不读网络、不写任何文件
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: normalize / stripQuestionDetailed / stripQuestion / toGroups（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-03 01:52｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：语义检索第一档）｜lib/query-rewrite.js:1-406｜新增：查询改写的纯函数层（归一 / 剥问句 / 同义变体 / 命中重排），不改任何召回接线｜为什么：检索现在只有关键词，问句尾巴和跨写法说法会白丢召回；向量检索要本地模型，先用别名表把零成本这一档做掉｜验证：& $node scripts/test-query-rewrite.mjs 22/22 组通过；& $node scripts/bench-query-rewrite.mjs 5 条真实查询原 24 → 改写后 47（+23，临时家、只读拷贝）｜可改：可改（接线由父会话做；本文件只出纯函数）
//
// 语义检索第一档：别名表 + 查询改写。零成本——不调模型、不读网络、不写任何文件。
//
// 为什么要这一档（2026-11-03 老板定）：
//   现在的召回入口是 lib/recall-now.js：tokenize() 切中文二元组 + ASCII 词，
//   score() 用 text.includes(token) 打分；同一套 token 也建在 lib/inverted.js 的倒排里。
//   所以「怎么/为什么/吗/呢」这类问句词要么被切进候选、要么把实词挤出前 12 个 token；
//   而「repair-helper / 修复助手」这种同一件事的两种写法，靠一张别名表就能直接接上。
//
// 本文件只做四件事，并且全是纯函数（给同样的入参就出同样的结果）：
//   ① normalize：全半角 / 大小写 / 空白归一（NFKC + 小写 + 折叠空格）；
//   ② stripQuestion：只剥问句标记（前缀、尾巴、语气词、句中「是不是」），剥完没内容就退回原句；
//   ③ rewrite：拿同义组做双向替换，产出 ≤5 条变体，带总字符上限；
//   ④ expandHits：拿变体给已有召回命中重打分/标注（不改入参，返回新数组）。
//
// 用法（接线示例，父会话照这个接；本文件不自己接）：
//   import { rewrite, loadAliases, expandHits } from './query-rewrite.js'
//   const plan = rewrite('还记得那张图呢', { aliases: loadAliases() })
//   plan.variants  // ['那张图', '封面', '封面图', '图片']
//   const ranked = expandHits(recallHits, plan)
//
// 三条边界：
//   ① lib/aliases.json 只读。要补词写在本文件下面的 ALIAS_PATCH，并写清为什么补；
//   ② 上限保护：变体 ≤5 条、单条 ≤200 字、合计 ≤600 字；超长查询先截断再处理；
//   ③ 剥问句的每一步都要过 isContentful 守卫——剥完剩不下实词就这一步不剥。
//      宁可留下「吗」，也不把「目的」剥成「目」。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenize } from './inverted.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ALIAS_FILE = path.join(HERE, 'aliases.json')

/** 上限：防止一条长查询炸成几十条变体、把召回拖慢。 */
export const LIMITS = Object.freeze({
  maxVariants: 5,      // 含基准变体（剥完问句的原句）
  maxInputChars: 200,  // 超过就截断（返回 truncated=true）
  maxTotalChars: 600,  // 所有变体加起来的字符上限
  maxKeywords: 24,     // 和 recall-now 的 MAX_KWS 一致
  minTermChars: 2,     // 单字不入别名（「图」会把地图/试图都算进来，aliases.json 也这么定）
})

/**
 * 默认补丁表（lib/aliases.json 只读，所以补词只能放这里）。
 *
 * 只补「跨写法」：同一件事，她平时说中文，代码/文档里写英文或另一种叫法。
 * 真实表里已经有的中文同义词不再抄一遍；单字不收（理由同上）。
 * 父会话接线时可以传自己的 aliases 覆盖这里；不传就用「真实表 + 本补丁」（见 loadAliases）。
 */
export const ALIAS_PATCH = Object.freeze({
  修复助手: ['repair-helper', 'repairhelper'],
  倒排: ['倒排索引'],
  账本: ['worklog', '工作日志'],
  留痕: ['改动留痕', 'trace'],
  回归: ['regression', '回归测试'],
  冷档: ['cold'],
})

// ── 问句标记（只剥这些，不在表里的词一律不碰）────────────────────────
// 前缀：按长度从长到短排，先剥「请问一下」再剥「请问」。
const QUESTION_PREFIXES = [
  '麻烦问一下', '帮我查一下', '帮我看看', '帮我找找', '想问一下', '问一下', '麻烦问下',
  '请问一下', '请问', '想问', '帮我查', '帮我找',
  '可不可以', '能不能', '是不是', '要不要', '有没有', '为什么', '为啥',
  '什么是', '什么叫', '怎么', '怎样', '如何',
]

// 尾巴短语：疑问句常见的收尾，剥掉不影响前面的实词。
const QUESTION_SUFFIXES = [
  '是怎么回事', '是什么意思', '说的是什么', '如何是好',
  '是不是', '对不对', '好不好', '行不行', '可不可以', '能不能', '有没有', '要不要',
  '怎么回事', '怎么办', '怎么样', '怎么弄', '怎么搞', '怎么做', '怎么用', '如何弄', '如何做',
  '是什么', '是啥', '在哪里', '在哪儿', '在哪', '放哪儿', '放哪',
]

// 尾巴语气词：一次只剥一个，剥完还要过 isContentful。
const QUESTION_PARTICLES = ['吗', '呢', '吧', '啊', '呀', '嘛', '哦', '哈', '啦', '哇', '咯', '嘞', '了', '的']

// 句中问句标记：夹在实词中间时剥掉（「封面是不是改了两栏」→「封面改了两栏」）。
// 只收不会当实词用的组合；「不是 / 没有」这类会改变意思的不收。
const QUESTION_INFIX = ['是不是', '有没有', '要不要', '能不能', '可不可以', '对不对', '好不好', '为什么', '为啥', '怎么', '怎样', '如何']

// 「备份怎么回事」剥掉「怎么」会剩「备份回事」——这种尾巴不算实词，这一步就不剥。
const WEAK_TAIL = /(?:回事|情况|东西|时候|样子|意思)$/

// 句末标点：本来就是噪音，直接剥（剥完为空就退回原句，见 stripQuestionDetailed）。
const TRAILING_PUNCT = /[?？!！。.…~～,，、;；:：]+$/

// ── 归一 ────────────────────────────────────────────────────────────
/**
 * 归一：去零宽/BOM → NFKC（全角转半角）→ 小写 → 空白折叠 → 去掉首尾引号与波浪号。
 * 非字符串一律当空查询处理（不抛错）。
 */
export function normalize(input) {
  if (typeof input !== 'string') return ''
  let s = input.replace(/[\u200b-\u200f\ufeff]/g, '')
  try { s = s.normalize('NFKC') } catch { /* 老运行时没有 NFKC 也不影响主流程 */ }
  s = s.toLowerCase().replace(/\s+/g, ' ').trim()
  s = s.replace(/^[\s"'“”‘’`]+|[\s"'“”‘’`]+$/g, '')
  return s
}

function hanCount(s) {
  return (String(s || '').match(/[\u4e00-\u9fa5]/g) || []).length
}

/**
 * 剥完之后还「有内容」吗？
 * 至少两个汉字，或一个长度 ≥2 的 ASCII 词。整句只剩「为什么」「了」这种就不算有内容。
 * 守卫放在每一步剥之前：宁可少剥，不许把实词吃光。
 */
// 剥完只剩这些碎片时不算「还有内容」：「怎么回事」剥成「回事」不是实词。
const WEAK_REMAINS = new Set(['回事', '情况', '东西', '时候', '样子', '意思'])

function isContentful(s) {
  const t = String(s || '').trim()
  if (!t || WEAK_REMAINS.has(t)) return false
  return hanCount(t) >= 2 || /[A-Za-z0-9_]{2,}/.test(t)
}

/**
 * 剥问句（详细版）：返回 { text, normalized, removed }。
 * removed 记每一步剥了什么，方便测试断言「只剥了问句标记」。
 */
export function stripQuestionDetailed(text) {
  const original = normalize(text)
  let s = original
  const removed = []
  if (!s) return { text: '', normalized: '', removed }

  for (let round = 0; round < 24; round += 1) {
    let changed = false

    const punct = s.match(TRAILING_PUNCT)
    if (punct) {
      const t = s.slice(0, -punct[0].length).trim()
      if (t) { removed.push({ kind: 'punct', text: punct[0] }); s = t; changed = true }
    }

    for (const p of QUESTION_PARTICLES) {
      if (!s.endsWith(p)) continue
      const t = s.slice(0, -p.length).trim()
      if (isContentful(t)) { removed.push({ kind: 'particle', text: p }); s = t; changed = true }
      break
    }

    for (const p of QUESTION_SUFFIXES) {
      if (!s.endsWith(p)) continue
      const t = s.slice(0, -p.length).trim()
      if (isContentful(t)) { removed.push({ kind: 'suffix', text: p }); s = t; changed = true }
      break
    }

    for (const p of QUESTION_PREFIXES) {
      if (!s.startsWith(p)) continue
      const t = s.slice(p.length).trim()
      if (isContentful(t)) { removed.push({ kind: 'prefix', text: p }); s = t; changed = true }
      break
    }

    for (const tag of QUESTION_INFIX) {
      const at = s.indexOf(tag)
      if (at <= 0) continue
      const t = (s.slice(0, at) + s.slice(at + tag.length)).replace(/\s+/g, ' ').trim()
      if (isContentful(t) && !WEAK_TAIL.test(t)) { removed.push({ kind: 'infix', text: tag }); s = t; changed = true }
      break
    }

    if (!changed) break
  }

  return { text: s || original, normalized: original, removed }
}

/** 只要剥完的句子（大多数调用只关心这个）。 */
export function stripQuestion(text) {
  return stripQuestionDetailed(text).text
}

// ── 别名组（双向 + 传递）────────────────────────────────────────────
function normalizeTerm(term) {
  return normalize(String(term ?? '')).replace(TRAILING_PUNCT, '').trim()
}

/**
 * 把别名表变成「同义组」列表：
 *   · 每行 key + values 是一条无向边；A→B 和 B→A 都成立（双向）；
 *   · 用并查集做连通分量，所以「空话→承诺」「承诺→答应/诺言」会并成一组（传递）；
 *   · 单字（长度 < LIMITS.minTermChars）丢掉——和 recall-now 的 loadAliases 口径一致。
 * 入参可以是对象表（aliases.json 那种）或二维数组（[[a,b],…]）。
 * 坏数据（null / 非数组 / 空串）一律跳过，不抛错。
 */
export function toGroups(aliases) {
  const rows = []
  if (Array.isArray(aliases)) {
    for (const row of aliases) {
      if (!Array.isArray(row)) continue
      const terms = row.map(normalizeTerm).filter(Boolean)
      if (terms.length >= 2) rows.push(terms)
    }
  } else if (aliases && typeof aliases === 'object') {
    for (const [key, list] of Object.entries(aliases)) {
      if (!key || key.startsWith('_') || !Array.isArray(list)) continue
      const terms = [key, ...list].map(normalizeTerm).filter(Boolean)
      if (terms.length >= 2) rows.push(terms)
    }
  }

  const parent = new Map()
  const find = (x) => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)
    let c = x
    while (parent.get(c) !== c) { const n = parent.get(c); parent.set(c, r); c = n }
    return r
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  for (const row of rows) {
    const terms = [...new Set(row.filter((t) => t.length >= LIMITS.minTermChars))]
    if (terms.length < 2) continue
    for (const t of terms) if (!parent.has(t)) parent.set(t, t)
    for (const t of terms.slice(1)) union(terms[0], t)
  }

  const buckets = new Map()
  for (const t of parent.keys()) {
    const root = find(t)
    if (!buckets.has(root)) buckets.set(root, [])
    buckets.get(root).push(t)
  }
  return [...buckets.values()].filter((g) => g.length >= 2)
}

/**
 * 合并多张别名表（后面的表并进前面的；同键数组拼接去重）。
 * 坏行跳过；以 _ 开头的键是备注，不参与匹配。
 */
export function mergeAliasTables(...tables) {
  const out = {}
  for (const table of tables) {
    if (!table || typeof table !== 'object' || Array.isArray(table)) continue
    for (const [key, list] of Object.entries(table)) {
      if (!key || key.startsWith('_') || !Array.isArray(list)) continue
      const merged = [...(out[key] || []), key, ...list]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
      out[key] = [...new Set(merged)]
    }
  }
  return out
}

/**
 * 读真实别名表（只读），再叠上 ALIAS_PATCH。
 * 读不到 / JSON 坏了 → 只返回补丁表，不抛错（检索不能因为一张表坏了就停）。
 * 注意：这是本文件唯一碰文件系统的地方；rewrite() 本身不读盘。
 */
export function loadAliases({ file = ALIAS_FILE } = {}) {
  let real = null
  try {
    real = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch { real = null }
  return mergeAliasTables(real || {}, ALIAS_PATCH)
}

function deepFreeze(table) {
  for (const v of Object.values(table)) if (Array.isArray(v)) Object.freeze(v)
  return Object.freeze(table)
}

/** 模块加载时读一次「真实表 + 补丁」，作为 rewrite() 的默认别名。 */
const DEFAULT_ALIASES = deepFreeze(loadAliases())

// ── 改写主函数 ──────────────────────────────────────────────────────
/**
 * 把一句查询改写成一组变体。
 *
 * @param {string} query
 * @param {{aliases?: object|string[][]}} [opts] aliases 缺省用「真实表 + 补丁」；
 *        传对象表或二维数组都行，传 {} / [] 就是不做同义扩展。
 * @returns {{
 *   ok: boolean, empty: boolean, original: string, normalized: string, stem: string,
 *   variants: string[], details: {text:string,kind:string,from?:string,to?:string}[],
 *   keywords: string[], removed: {kind:string,text:string}[], aliasHits: {from:string,to:string}[],
 *   truncated: boolean, notes: string[]
 * }}
 *
 * 纯函数：不改入参、不读盘、不联网。variants[0] 永远是剥完问句的基准句（stem）；
 * 变体之间按字符去重；超过上限就停，并在 notes 里说明。
 */
export function rewrite(query, { aliases = DEFAULT_ALIASES } = {}) {
  const original = typeof query === 'string' ? query : ''
  const normalized = normalize(original)
  const result = {
    ok: true,
    empty: !normalized,
    original,
    normalized: '',
    stem: '',
    variants: [],
    details: [],
    keywords: [],
    removed: [],
    aliasHits: [],
    truncated: false,
    notes: [],
  }
  // 只有标点/空白的一律当空查询：不给召回喂「？？？」这种变体
  if (!normalized || !/[\u4e00-\u9fa5A-Za-z0-9]/.test(normalized)) {
    result.empty = true
    return result
  }

  let input = normalized
  const chars = Array.from(input)
  if (chars.length > LIMITS.maxInputChars) {
    // 头尾各留一段：问句的重点常在句尾（「……到底怎么恢复」），只砍头会把它砍掉。
    const headLen = LIMITS.maxInputChars - 81
    const head = chars.slice(0, headLen).join('')
    const tail = chars.slice(-(LIMITS.maxInputChars - headLen - 1)).join('')
    input = `${head} ${tail}`
    result.truncated = true
    result.notes.push(`查询超过 ${LIMITS.maxInputChars} 字，已保留头尾各一段后再改写`)
  }

  const stripped = stripQuestionDetailed(input)
  result.normalized = input
  result.stem = stripped.text || input
  result.removed = stripped.removed

  const groups = toGroups(aliases)
  const seen = new Set()
  let totalChars = 0
  const add = (text, detail) => {
    const t = String(text || '').trim()
    if (!t || seen.has(t)) return false
    if (result.variants.length >= LIMITS.maxVariants) return false
    if (totalChars + t.length > LIMITS.maxTotalChars) {
      if (!result.notes.includes('变体总字符数到上限，后面的不再加')) result.notes.push('变体总字符数到上限，后面的不再加')
      return false
    }
    seen.add(t)
    result.variants.push(t)
    result.details.push({ ...detail, text: t })
    totalChars += t.length
    return true
  }

  // ① 基准：剥完问句的句子
  add(result.stem, { kind: 'base' })

  // ② 同义替换：每组里命中的最长词 → 组内其他说法
  //    先剔掉「被更长命中词包含」的短词（「封面图」命中时不再算「封面」也命中了），
  //    再看这组是不是已经有两种说法同时出现（如「github 仓库」）——那就不用换了。
  for (const group of groups) {
    const matched = group.filter((t) => result.stem.includes(t)).sort((a, b) => b.length - a.length)
    const present = matched.filter((t, i) => !matched.some((other, j) => j !== i && other.length > t.length && other.includes(t)))
    if (!present.length || present.length >= 2) continue
    const from = present[0]
    for (const to of group) {
      if (to === from || result.stem.includes(to)) continue
      const candidate = result.stem.split(from).join(to)
      if (add(candidate, { kind: 'synonym', from, to })) {
        const key = `${from}>${to}`
        if (!result.aliasHits.some((h) => `${h.from}>${h.to}` === key)) result.aliasHits.push({ from, to })
      }
      if (result.variants.length >= LIMITS.maxVariants) break
    }
    if (result.variants.length >= LIMITS.maxVariants) break
  }

  // ③ 问句原文兜底：剥问句万一剥狠了，原文还在变体里（排在同义变体后面，省额度）
  //    兜底句去掉句末标点，但保留问句词——它是「万一」用的，不图干净。
  const fallback = input.replace(TRAILING_PUNCT, '').trim()
  if (fallback && fallback !== result.stem) add(fallback, { kind: 'original' })
  if (result.variants.length >= LIMITS.maxVariants && result.normalized !== result.stem) {
    result.notes.push(`变体已到 ${LIMITS.maxVariants} 条上限`)
  }

  // ④ 关键词：每个变体各自切（不许拼起来切，跨变体边界会切出假二元组）
  const kws = []
  for (const v of result.variants) {
    for (const t of tokenize(v)) {
      if (!kws.includes(t)) kws.push(t)
      if (kws.length >= LIMITS.maxKeywords) break
    }
    if (kws.length >= LIMITS.maxKeywords) break
  }
  result.keywords = kws

  return result
}

// ── 命中重排（给已有召回结果用）──────────────────────────────────────
/**
 * 用改写变体给已有命中的正文重打分/标注。不改入参：返回新数组、每条命中也是新对象。
 *
 * @param {Array<{text?:string,s?:number}>} hits
 * @param {string[]|{variants:string[]}} variants rewrite() 的结果或变体数组
 * @param {{minScore?:number, limit?:number}} [opts]
 * @returns {Array<object>} 每条多出 baseS / score / variantScore / variantHits（命中了哪些变体）；
 *          按 score 降序；score = max(原 s, 变体里的最高分)。权重和 recall-now 的 score 一致。
 */
export function expandHits(hits, variants, { minScore = 1, limit = 0 } = {}) {
  const list = Array.isArray(variants)
    ? variants
    : (variants && Array.isArray(variants.variants) ? variants.variants : [])
  const plans = list
    .map((text) => {
      const t = String(text || '')
      return { text: t, tokens: tokenize(t).slice(0, 12) }
    })
    .filter((p) => p.text && p.tokens.length)

  const out = []
  for (const hit of (Array.isArray(hits) ? hits : [])) {
    if (!hit || typeof hit !== 'object') continue
    const hay = String(hit.text || '').toLowerCase()
    const baseS = Number(hit.s || 0)
    const matched = []
    let best = 0
    for (const plan of plans) {
      let s = 0
      for (const t of plan.tokens) if (hay.includes(t)) s += t.length > 2 ? 2 : 1
      if (s > 0) matched.push({ variant: plan.text, score: s })
      if (s > best) best = s
    }
    const score = Math.max(baseS, best)
    if (score < minScore) continue
    out.push({
      ...hit,
      baseS,
      s: score,
      score,
      variantScore: best,
      variantHits: matched,
    })
  }
  out.sort((a, b) => b.score - a.score)
  return limit > 0 ? out.slice(0, limit) : out
}
