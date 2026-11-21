/* 标签
 * id: memory-core-pick
 * kind: module
 * tags: 记忆, 注入选法, 最近优先, 重要, 淡忘
 * created: 2026-11-04 18:55:00
 * changed: 2026-11-21 20:10:39
 * author: 照微·工作台
 * authority: 老板（2026-11-04：按时间排序，最近发生的优先注入；常驻的、印象深刻的、淡的、被顶替的也要有说法）
 *          2026-11-07：融合方案第 1 步——BM25 当候选源（docs/融合方案-记忆.md §8.4）
 *          2026-11-07：第 2 步 P2——实体图当候选源 + 精度收口（同文档 §8.3）
 * why: 原来只有一句 slice(-3)——纯按写入时间，197 条记忆里 58 条 important 一次都没进过注入；
 *      而且 pickForInject 完全不看当前问题，10 个问题注入的全是同样四条（hit@4 36.4%）
 * result: cue 为空 = 老行为（最近 1 + 分数补满，手机端依赖）；cue 非空 = BM25 候选池 ∪ 老前 4 ∪ 实体图一跳 ∪ core ∪ 最新 1，
 *         排序 score + 1.5×归一化 BM25 + 0.3×图相关；不相关的候选分数压不过最相关那条就不补位。
 *         eval hit@4 36.4%→90.9%，「压力大」点亮 exam（scripts/eval-memory.mjs 2026-11-07 实测）
 * moved: 2026-11-07 S1——从 lib/memory-pick.js 原样搬到这里（只改了 aliases.json 的路径）
 * mutable: 可改
 */
// 2026-11-07（S1 搬家）：本文件是 lib/memory-pick.js 的原样搬家，逻辑一字未改（只换了 ALIAS_FILE 的路径）。
// 旧地址 lib/memory-pick.js 现在只是转发薄壳；改逻辑改这里，别改薄壳。
// 打分（不打分表就给数字，别让人猜）：
//   recency：越新越高，半衰期 72 小时（3 天前 ≈ 一半分）
//   tier：core 3 / important 2 / normal 1
//   decay：超过 30 天没被提到（且不是 core）×0.4；被合并掉的（supersededBy）不参选
// 选法：先按分数排序，再保证"最近 1 条"必进（防止全是旧的重要记忆），总数 n=3。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HOME = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = () => path.join(HOME(), 'dayu')

const TIER_W = { core: 3, important: 2, normal: 1 }

function readEvents(role) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(D(), 'soul', 'memory', `${role}.json`), 'utf8'))
    return (doc.events || []).filter((e) => e && e.text)
  } catch { return [] }
}

/** 单条记忆的分数（导出是为了能测：分数怎么算的，不许藏在闭包里）。 */
export function scoreEvent(e, now = Date.now(), moodValence = null) {
  const at = Date.parse(String(e.at || ''))
  const hours = Number.isFinite(at) ? Math.max(0, (now - at) / 3600000) : 24 * 30
  const recency = Math.exp(-hours / 72) * 2
  const tier = TIER_W[String(e.tier || 'normal')] ?? 1
  let s = recency + tier
  // 2026-11-19 老板：「记忆内容偏噪，她把整段回答也记成事件」。
  // 她自己说过的话（kind=say）降一点权重：不是不记，是别把整段回复顶掉真事。core 不降。
  if (e.tier !== 'core' && String(e.kind || '') === 'say') s *= 0.6
  if (e.tier !== 'core' && hours > 24 * 30) s *= 0.4 // 淡忘：30 天没被提及的，降权（不删）
  // 2026-11-21：同情绪的事更容易被想起——只加一点点，不许压过相关性和时间。
  if (moodValence != null && e.tier !== 'core' && Number.isFinite(Number(e.valence))) {
    const mv = Math.max(-1, Math.min(1, Number(moodValence)))
    const ev = Math.max(-1, Math.min(1, Number(e.valence)))
    if (mv !== 0 && ev !== 0) {
      const same = Math.sign(ev) === Math.sign(mv) ? 1 : -1
      s += same * 0.25 * (Number(e.intensity) || 0.5)
    }
  }
  return s
}

/** 她自己说过的话：选“最新一条”时先让给真事（没有真事才用它）。 */
const isSay = (e) => String(e?.kind || '') === 'say'
function newestOf(scored) {
  const nonSay = scored.filter((x) => !isSay(x.e))
  const pool = nonSay.length ? nonSay : scored
  return pool.reduce((a, b) => (b.at > a.at ? b : a), pool[0])
}

// ─── BM25 候选源（2026-11-07 第 1 步，docs/融合方案-记忆.md §8.4）────────────
// 为什么自己写：lib/inverted.js 的 tokenize 是现成的，但 sync-mobile-core 的 SHARED 里
// 只同步 memory-core/pick.mjs + lib/aliases.json——import 它会让手机端缺文件起不来。
// 所以切词/别名/BM25 全部在这一个文件里，零依赖；cue 为空时这几段一次都不跑。
const STOP_GRAMS = new Set([
  '什么', '怎么', '为什', '那个', '这个', '我们', '你们', '他们', '一个', '就是', '不是',
  '可以', '现在', '上次', '那次', '之前', '还是', '没有', '真的', '但是', '因为', '所以',
  '如果', '然后', '时候',
])
// 纯虚字碎片（「的了」「好吗」「怎么」）当关键词只会把排序带偏，直接丢
const PARTICLE = /[的了么哪什怎吗呢吧啊呀哦嗯]/
// 两个都是功能字才算噪声；「我妈」「一直」这种保留（代词+名词/副词带信息量）
const FUNC = new Set([...'就都也很还又是在有和与或把被给对从到说这那些个不没'])

/** 切词：英文数字按词（≥2 位）、中文二字滑窗。返回带重复的 token 列表（BM25 要 tf）。 */
export function tokenizeForBM25(text) {
  const s = String(text || '').toLowerCase()
  const out = []
  for (const w of (s.match(/[a-z0-9_]+/g) || [])) if (w.length >= 2) out.push(w)
  const han = s.replace(/[^\u4e00-\u9fa5]/g, '')
  for (let i = 0; i + 1 < han.length; i += 1) {
    const g = han.slice(i, i + 2)
    if (PARTICLE.test(g) || STOP_GRAMS.has(g)) continue
    if (FUNC.has(g[0]) && FUNC.has(g[1])) continue
    out.push(g)
  }
  return out
}

// 别名表：命中组内任一词，就把同组其它说法也当候选 token（换说法才想得起来）。
// 表在 lib/aliases.json（和本文件一起同步到手机）；坏了/读不到就跳过扩展，不报错。
// 2026-11-07（S1 搬家）：表还在 lib/aliases.json（S1 不搬它），所以从 memory-core/ 往上找一层。
const ALIAS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'aliases.json')
const MAX_ALIAS_TOKENS = 24
const ALIAS_RECHECK_MS = 30 * 1000 // 别每条事件都 statSync：Windows 上 2000 次 stat 要 80ms
let aliasCache = { key: '', checkedAt: 0, groups: [], byToken: new Map(), phrases: [], comp: [] }
const aliasWordCache = new Map() // 别名词 → 它的 token（2000 条时这一步会被调很多次）

function aliasWordTokens(w) {
  let t = aliasWordCache.get(w)
  if (!t) { t = tokenizeForBM25(w); aliasWordCache.set(w, t) }
  return t
}

/**
 * 实体归并：别名组互相指来指去（封面 ↔ 封面图、GitHub ↔ 仓库），共享任一词就并成同一实体。
 * 不并的话「封面」和「封面图」算两个实体，明明一件事却连不上（2026-11-07 P2）。
 * 返回每组 → 代表组号（并查集根）。
 */
function componentOf(groups) {
  const parent = groups.map((_, i) => i)
  const find = (i) => {
    let x = i
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }
  const byWord = new Map()
  groups.forEach((words, i) => {
    for (const w of words) {
      const j = byWord.get(w)
      if (j === undefined) { byWord.set(w, i); continue }
      const a = find(j)
      const b = find(i)
      if (a !== b) parent[b] = a
    }
  })
  return groups.map((_, i) => find(i))
}

function aliasIndex() {
  if (aliasCache.key && Date.now() - aliasCache.checkedAt < ALIAS_RECHECK_MS) return aliasCache
  try {
    const st = fs.statSync(ALIAS_FILE)
    const key = `${st.mtimeMs}|${st.size}`
    if (aliasCache.key === key) { aliasCache.checkedAt = Date.now(); return aliasCache }
    const raw = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8').replace(/^\uFEFF/, ''))
    const groups = []
    for (const [k, list] of Object.entries(raw || {})) {
      if (!k || k.startsWith('_') || !Array.isArray(list)) continue
      // 成员必须 ≥2 字：单字成员（「仓」「账」「怕」）既切不出 token 又容易撞，不进索引
      const words = [k, ...list].map((x) => String(x || '').trim().toLowerCase()).filter((x) => x.length >= 2)
      if (words.length >= 2) groups.push([...new Set(words)])
    }
    // 性能（2026-11-07：2000 条时逐组 s.includes 要 100ms）：能当 token 的词直接按 token 查表，
    // 只有 ≥3 字/带非汉字的整词才走子串匹配（那张图、手机端、B站、fix record 这类）。
    const byToken = new Map()
    const phrases = []
    groups.forEach((words, gi) => {
      for (const w of words) {
        const asToken = /^[\u4e00-\u9fa5]{2}$/.test(w)
          ? !PARTICLE.test(w) && !STOP_GRAMS.has(w) && !(FUNC.has(w[0]) && FUNC.has(w[1]))
          : /^[a-z0-9_]{2,}$/.test(w)
        if (asToken) {
          if (!byToken.has(w)) byToken.set(w, [])
          byToken.get(w).push(gi)
        } else {
          phrases.push({ w, gi })
        }
      }
    })
    aliasCache = { key, checkedAt: Date.now(), groups, byToken, phrases, comp: componentOf(groups) }
    return aliasCache
  } catch {
    aliasCache = { key: '', checkedAt: Date.now(), groups: [], byToken: new Map(), phrases: [], comp: [] }
    return aliasCache
  }
}

/** 原句 token + 别名扩出来的 token（去重、最多 24 个）。 */
export function tokensWithAliases(text) {
  const tokens = tokenizeForBM25(text)
  const idx = aliasIndex()
  if (!idx.groups.length) return tokens
  const s = String(text || '').toLowerCase()
  const seen = new Set(tokens)
  const out = tokens.slice()
  const hitGroups = new Set()
  const expand = (gi) => {
    if (hitGroups.has(gi)) return false
    hitGroups.add(gi)
    for (const w of idx.groups[gi]) {
      for (const t of aliasWordTokens(w)) {
        if (seen.has(t)) continue
        seen.add(t)
        out.push(t)
        if (out.length >= MAX_ALIAS_TOKENS) return true
      }
    }
    return false
  }
  for (const t of tokens) {
    for (const gi of (idx.byToken.get(t) || [])) if (expand(gi)) return out
  }
  for (const p of idx.phrases) {
    if (s.includes(p.w) && expand(p.gi)) return out
  }
  return out
}

/** BM25（k1=1.2 b=0.75）：返回每条事件的分数数组。每次调用重建倒排，200~2000 条够用。 */
export function bm25Scores(docsTokens, cueTokens, { k1 = 1.2, b = 0.75 } = {}) {
  const n = docsTokens.length
  const dl = docsTokens.map((t) => t.length)
  const avgdl = n ? dl.reduce((a, c) => a + c, 0) / n : 0
  const postings = new Map() // token -> Map(docIdx -> tf)
  for (let i = 0; i < n; i += 1) {
    for (const t of docsTokens[i]) {
      let m = postings.get(t)
      if (!m) { m = new Map(); postings.set(t, m) }
      m.set(i, (m.get(i) || 0) + 1)
    }
  }
  const scores = new Array(n).fill(0)
  for (const t of new Set(cueTokens)) {
    const m = postings.get(t)
    if (!m) continue
    const idf = Math.log(1 + (n - m.size + 0.5) / (m.size + 0.5))
    for (const [i, tf] of m) {
      const denom = tf + k1 * (1 - b + b * (dl[i] / (avgdl || 1)))
      scores[i] += idf * (tf * (k1 + 1)) / (denom || 1)
    }
  }
  return scores
}

// ─── 实体图（P2，2026-11-07，docs/融合方案-记忆.md §8.3）──────────────────────
// 实体 = aliases.json 里的一张同义词组（人/项目/话题都靠这张白名单）；抽不到就不建边，不猜。
// 只在 cue 非空时启用：cue 点亮的实体 → 同实体的事件按 0.6 衰减补进候选池（一跳，不两跳起手）。
const GRAPH_DECAY = 0.6 // 一跳扩散衰减
const GRAPH_W = 0.3     // 图相关权重（方案给 0.25~0.35，这边 eval 定在 0.3）
const GRAPH_TOP = 6     // 图相关最多补几条候选（别让一个常用实体把池子灌满）
const GRAPH_ON = () => String(process.env.YUSHEN_MEMORY_GRAPH || '').toLowerCase() !== 'off'

const entityCache = new Map() // text → 实体组号；2000 条时同一个句子会被反复抽
const ENTITY_CACHE_MAX = 5000

/**
 * 从一个句子里抽实体（返回代表组号）。用**原句**切词，不拿别名扩出来的词——
 * 别名扩词会把「回归」扩到「验证」那一组，再按组连边就成了毛线团。
 */
export function entityIdsOf(text) {
  const idx = aliasIndex()
  if (!idx.groups.length) return []
  const raw = String(text || '')
  const cacheKey = `${aliasCache.key}|${raw}`
  const hit = entityCache.get(cacheKey)
  if (hit) return hit
  const found = new Set()
  for (const t of new Set(tokenizeForBM25(raw))) {
    for (const gi of (idx.byToken.get(t) || [])) found.add(idx.comp[gi] ?? gi)
  }
  const lower = raw.toLowerCase()
  for (const p of idx.phrases) if (lower.includes(p.w)) found.add(idx.comp[p.gi] ?? p.gi)
  const out = [...found].sort((a, b) => a - b)
  if (entityCache.size >= ENTITY_CACHE_MAX) entityCache.clear()
  entityCache.set(cacheKey, out)
  return out
}

/** 图相关：cue 命中的实体 → 同实体的事件记 GRAPH_DECAY；没有交集就是 0。（导出是为了能测） */
export function graphRelevance(evs, cueText) {
  const rel = new Array(evs.length).fill(0)
  if (!GRAPH_ON()) return rel
  const cueEnt = new Set(entityIdsOf(cueText))
  if (!cueEnt.size) return rel
  for (let i = 0; i < evs.length; i += 1) {
    for (const gi of entityIdsOf(evs[i].text)) {
      if (cueEnt.has(gi)) { rel[i] = GRAPH_DECAY; break }
    }
  }
  return rel
}

// 融合权重：现有分（≈1.5~4.0） + 1.5 × 归一化 BM25（0~1）。
// 调过一轮：1.0 时「压力大」点不亮「考试」；2.5 时旧的重要记忆全被关键词顶掉。1.5 最好。
const CUE_W = 1.5
const CUE_TOP = 8      // BM25 命中的前 8 进候选池
const BASE_TOP = 4     // 现有分数的前 4 进候选池（老路径的东西不能丢）

/**
 * cue 非空时的选法：候选池 = BM25 前 8 ∪ 现有分数前 4 ∪ tier==='core' 的钉子 ∪ 最新 1 条 ∪ 图相关前 6，
 * 排序 = 现有 score + CUE_W × 归一化 BM25 + GRAPH_W × 图相关；
 * 然后精度收口：非钉子、又跟这句话没有任何关系（BM25/图相关都为 0）的候选，
 * 分数压不过“最相关那条”就不补位——最多 n 条，可以更少。
 */
function pickWithCue(evs, scored, n, now, cueText, keyOf, moodValence = null) {
  const cueTokens = tokensWithAliases(cueText)
  if (!cueTokens.length) return pickLegacy(scored, n, keyOf) // 只有标点符号 → 老路径
  const idxOf = new Map(evs.map((e, i) => [e, i]))
  const bm = bm25Scores(evs.map((e) => tokensWithAliases(e.text)), cueTokens)
  const max = bm.reduce((a, c) => (c > a ? c : a), 0)
  const graph = graphRelevance(evs, cueText)

  const pool = new Set()
  for (const it of scored.slice(0, BASE_TOP)) pool.add(idxOf.get(it.e))
  bm.map((s, i) => ({ s, i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, CUE_TOP)
    .forEach((x) => pool.add(x.i))
  graph.map((r, i) => ({ r, i }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .slice(0, GRAPH_TOP)
    .forEach((x) => pool.add(x.i))
  evs.forEach((e, i) => { if (String(e.tier || '') === 'core') pool.add(i) })
  const newest = newestOf(scored)
  pool.add(idxOf.get(newest.e))

  const ranked = [...pool]
    .filter((i) => Number.isInteger(i))
    .map((i) => {
      const e = evs[i]
      const base = scoreEvent(e, now, moodValence)
      const norm = max > 0 ? bm[i] / max : 0
      const rel = graph[i] || 0
      return { e, base, norm, rel, s: base + CUE_W * norm + GRAPH_W * rel, at: Date.parse(String(e.at || '')) || 0 }
    })
    .sort((a, b) => b.s - a.s || b.at - a.at)

  // 精度收口：最相关那条的分数当门槛。一句话没线索时门槛是 -Infinity，
  // 还是按分数补满（和 P1 一样）；有线索时，不相关的就别硬塞了。
  const bestRelated = ranked.reduce((acc, it) => (it.norm > 0 || it.rel > 0 ? Math.max(acc, it.s) : acc), -Infinity)

  const picked = []
  const seen = new Set()
  for (const it of ranked) {
    if (picked.length >= n) break
    if (seen.has(keyOf(it.e))) continue
    const related = it.norm > 0 || it.rel > 0
    const isPin = String(it.e.tier || '') === 'core'
    if (!related && !isPin && it.s < bestRelated) continue
    seen.add(keyOf(it.e))
    const isNewest = keyOf(it.e) === keyOf(newest.e)
    const why = related ? '相关' : isNewest ? '最新一条'
      : (it.e.tier === 'important' || it.e.tier === 'core' ? '重要' : '分数高')
    picked.push({ ...it, why })
  }
  return picked
}

/** 老路径（cue 为空）：最新 1 条必进，再按分数补满 n 条。行为必须和 2026-11-07 之前一模一样。 */
function pickLegacy(scored, n, keyOf) {
  const picked = []
  const seen = new Set()
  const newest = newestOf(scored)
  picked.push({ ...newest, why: '最新一条' })
  seen.add(keyOf(newest.e))
  for (const it of scored) {
    if (picked.length >= n) break
    if (seen.has(keyOf(it.e))) continue
    seen.add(keyOf(it.e))
    picked.push({ ...it, why: it.e.tier === 'important' || it.e.tier === 'core' ? '重要' : '分数高' })
  }
  return picked
}

/**
 * 选 n 条进注入。
 * cue：当前这句话/这个问题。**不给就是老行为**（手机端 soul.js/brief.js 不传，别改那边）。
 * @returns {{id:string, text:string, at:string, tier:string, why:string, score:number}[]}
 */
export function pickForInject(role, { n = 3, now = Date.now(), cue = '', moodValence = null } = {}) {
  // 被顶替的不参选；标了 cold（淡忘）的也不参选——但它还在文件里，随时能查、能 --unmark 取回。
  const evs = readEvents(role).filter((e) => !e.supersededBy && !e.cold)
  if (!evs.length) return []
  const scored = evs.map((e) => ({ e, s: scoreEvent(e, now, moodValence), at: Date.parse(String(e.at || '')) || 0 }))
    .sort((a, b) => b.s - a.s)
  // 2026-11-07：原来用 picked.includes(it) 比对象引用——最新那条是 spread 出来的新对象，
  // 永远判不相等，同一条记忆会占两个位置（手机实测 3 条里只有 2 条不同内容）。
  // 改成按 at+text 记 key；顺便把 id 带上，注入里能回指原文（反馈计数要用）。
  const keyOf = (e) => `${e.at || ''}|${e.text || ''}`
  const cueText = String(cue || '').trim()
  const picked = cueText ? pickWithCue(evs, scored, n, now, cueText, keyOf, moodValence) : pickLegacy(scored, n, keyOf)
  return picked
    .sort((a, b) => b.at - a.at)
    .map((it) => ({
      // 2026-11-07：带 id（或派生 key）出去——注入里能回指是哪条，"被引用"才记得了账。
      id: String(it.e.id || keyOf(it.e)),
      text: String(it.e.text).slice(0, 80),
      at: String(it.e.at || '').slice(0, 16).replace('T', ' '),
      tier: String(it.e.tier || 'normal'),
      why: it.why,
      score: Number(it.s.toFixed(2)),
    }))
}
