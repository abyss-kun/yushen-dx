// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 触发词回忆（第 4 层）：听到"还记得/上次/那次/之前/好像"这类话，
// 自动去 记忆 + 冷档 + 原文 + 链条 里找几条相关的，而不是每轮都翻。
// 注意：lib/recall.js 已存在（她自己翻旧账用），这里是"被触发时自动找"，别混。
//
// 2026-11-02 三件本地增强（零 LLM 调用）：
//   ① 倒排索引（lib/inverted.js）：cold/live 先查 token→行号，只给候选行打分；
//      索引不存在/坏了，自动退回原来的逐文件扫描（这里保留整段旧逻辑）。
//   ② 别名表（lib/aliases.json）：命中组内任一词就把同组其他说法一起加入候选，去重、限 24。
//   ③ 有效期：带 validUntil 且已过期的事件默认不返回；includeExpired 时才返回并标「已失效」。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenize, homeDir, loadIndex, searchIndex } from './inverted.js'

const ROLES = ['dayu', 'xiaoyu', 'dragon']

// 触发词：只在“像是在叫我回忆”的时候才检索，不是每句都搜（省钱）
const TRIGGERS = [
  '还记得', '记不记得', '记得吗', '你记得', '上次', '上回', '那次', '之前说', '之前提',
  '我说过', '前面说', '怎么回事', '想不起来', '忘了', '好像',
]

export function looksLikeRecall(text) {
  const s = String(text || '')
  if (s.length < 4) return false
  return TRIGGERS.some((t) => s.includes(t))
}

const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

/** 关键词：ASCII 词转小写 + 中文二元组（token 规则和倒排索引同源，见 lib/inverted.js）。 */
export function keywords(text) {
  return tokenize(text).slice(0, 12)
}

// 触发词本身不算关键词（不然每一句『还记得』都会命中所有带『记得』的）
const TRIGGER_WORDS = new Set(['记得', '还记', '上次', '上回', '那次', '之前', '好像', '忘了'])

const score = (text, kws) => {
  const s = String(text || '')
  let n = 0
  for (const k of kws) if (!TRIGGER_WORDS.has(k) && s.includes(k)) n += k.length > 2 ? 2 : 1
  return n
}

// ── 别名（2026-11-02）：同义说法双向扩展 ─────────────────────────────
// 表在 lib/aliases.json：{"封面":["封面图","那张图","图片"], ...}。
// 命中组内任一词，就把同组其他词也加入候选；扩展后仍去重、最多 24 个。
// 表坏了（JSON 非法/读不到）→ 跳过扩展，不报错。
const ALIAS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'aliases.json')
const MAX_KWS = 24
let aliasCache = { mtimeMs: -1, groups: [] }

function loadAliases() {
  try {
    const st = fs.statSync(ALIAS_FILE)
    if (st.mtimeMs === aliasCache.mtimeMs) return aliasCache.groups
    const raw = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8').replace(/^\uFEFF/, ''))
    const groups = []
    for (const [key, list] of Object.entries(raw || {})) {
      if (!key || key.startsWith('_') || !Array.isArray(list)) continue
      const words = [key, ...list]
        .map((x) => String(x || '').trim().toLowerCase())
        .filter((x) => x.length >= 2)
      if (words.length >= 2) groups.push([...new Set(words)])
    }
    aliasCache = { mtimeMs: st.mtimeMs, groups }
    return groups
  } catch {
    aliasCache = { mtimeMs: -1, groups: [] }
    return []
  }
}

/** 双向扩展：关键词里有组内词、或原句里整词出现（"那张图"这种 3 字说法切不出二元组）都算命中。 */
export function expandAliases(kws, text = '') {
  const groups = loadAliases()
  const base = kws.map((k) => String(k || '').toLowerCase()).filter(Boolean)
  if (!groups.length) return base.slice(0, MAX_KWS)
  const s = String(text || '').toLowerCase()
  const out = []
  const add = (t) => {
    const v = String(t || '').toLowerCase()
    if (v && !out.includes(v) && out.length < MAX_KWS) out.push(v)
  }
  for (const k of base) add(k)
  for (const group of groups) {
    if (!group.some((t) => base.includes(t) || s.includes(t))) continue
    for (const t of group) add(t)
    if (out.length >= MAX_KWS) break
  }
  return out.slice(0, MAX_KWS)
}

// ── 有效期（2026-11-02）：A 后来改成 B，旧的那条不该再被当成现行事实 ──────
// validUntil 是 ISO 时间：到点后默认不返回；只在 includeExpired 时返回，并标 expired。
// 只影响「记忆/冷档」；链条与原文不受影响（它们是当时的记录，不是现行结论）。
function isExpiredRow(row, now = Date.now()) {
  const t = Date.parse(String(row?.validUntil || ''))
  return Number.isFinite(t) && t <= now
}

/** 在四个地方找相关旧事：热记忆、冷档、链条、原文 */
export function recallNow(text, { limit = 3, role = '', home = '', includeExpired = false, useIndex = true } = {}) {
  const H = home || homeDir()
  const kws = expandAliases(keywords(text), text)
  if (!kws.length) return { ok: true, hits: [], keywords: [], note: '没有可用关键词' }
  const hits = []

  // ① 热记忆：永远直接读（条数少，且带 recallCount 权重）
  for (const r of ROLES) {
    if (role && r !== role) continue
    const doc = readJson(path.join(H, 'dayu', 'soul', 'memory', `${r}.json`))
    for (const ev of (doc?.events || [])) {
      const s = score(ev.text, kws)
      if (s <= 0) continue
      const expired = isExpiredRow(ev)
      if (expired && !includeExpired) continue
      hits.push({
        kind: '记忆', role: r, at: ev.at, text: String(ev.text).slice(0, 160), s,
        id: ev.id, times: Number(ev.recallCount || 0),
        ...(expired ? { expired: true, validUntil: ev.validUntil } : {}),
      })
    }
  }

  // ② 冷档 + ③ 原文：有倒排就先查索引（只给候选行打分），没有就退回旧扫描。
  const idx = useIndex ? loadIndex(H) : null
  if (idx) {
    for (const [docId] of searchIndex(idx, kws)) {
      const d = idx.docs[docId]
      if (!d || typeof d.text !== 'string') continue
      const s = score(d.text, kws)
      if (s <= 0) continue
      if (d.src === 'live') {
        // 原文沿用旧规矩：至少命中两分（一个词）才算，避免一行里碰巧有个字就被翻出来
        if (s < 2) continue
        hits.push({ kind: '原文', at: '', text: d.text.trim().slice(0, 160), s, file: path.basename(String(d.file || '')), line: d.line })
        continue
      }
      const expired = isExpiredRow(d)
      if (expired && !includeExpired) continue
      hits.push({
        kind: '冷档', role: d.role || '', at: d.at, text: String(d.text).slice(0, 160), s, id: d.id,
        ...(expired ? { expired: true, validUntil: d.validUntil } : {}),
      })
    }
  } else {
    const coldDir = path.join(H, 'dayu', 'runtime', '记忆冷档')
    try {
      for (const f of fs.readdirSync(coldDir).filter((x) => x.endsWith('.jsonl'))) {
        for (const line of fs.readFileSync(path.join(coldDir, f), 'utf8').split('\n')) {
          if (!line.trim()) continue
          let ev = null
          try { ev = JSON.parse(line) } catch { continue }
          const s = score(ev.text, kws)
          if (s > 0) {
            const expired = isExpiredRow(ev)
            if (expired && !includeExpired) continue
            hits.push({
              kind: '冷档', role: f.replace('.jsonl', ''), at: ev.at, text: String(ev.text).slice(0, 160), s,
              ...(expired ? { expired: true, validUntil: ev.validUntil } : {}),
            })
          }
        }
      }
    } catch { /* 没有冷档 */ }

    try {
      const live = path.join(H, 'dayu', 'live')
      const files = []
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name)
          if (e.isDirectory()) walk(p)
          else if (e.name.endsWith('.md')) files.push(p)
        }
      }
      walk(live)
      files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
      for (const f of files.slice(0, 3)) {
        const lines = fs.readFileSync(f, 'utf8').split('\n')
        for (let i = 0; i < lines.length; i++) {
          const s = score(lines[i], kws)
          if (s >= 2) hits.push({ kind: '原文', at: '', text: lines[i].trim().slice(0, 160), s, file: path.basename(f), line: i + 1 })
        }
      }
    } catch { /* 没有原文 */ }
  }

  // 同一件事可能同时躺在热记忆和冷档里：按 id 去重（没有 id 的按来源行去重）。
  const seen = new Set()
  const uniq = []
  for (const h of hits) {
    const k = h.id ? `id:${h.id}` : `${h.kind}|${h.file || h.role || ''}:${h.line || h.text}`
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push(h)
  }

  try {
    const cf = path.join(H, 'dayu', 'soul', 'memory', '链条.jsonl')
    for (const line of fs.readFileSync(cf, 'utf8').split('\n')) {
      if (!line.trim()) continue
      let c = null
      try { c = JSON.parse(line) } catch { continue }
      const blob = `${c.title} ${(c.steps || []).map((x) => x.what || x).join(' ')} ${c.lesson || ''}`
      const s = score(blob, kws)
      if (s > 0) uniq.push({ kind: '链条', role: c.role, at: c.createdAt, text: `${c.title} → ${String(c.lesson || '').slice(0, 120)}`, s, id: c.id })
    }
  } catch { /* 没有链条 */ }

  uniq.sort((a, b) => b.s - a.s)

  // 第 3 层：想起过的事更重（21 天半衰期 + 被想起次数），并且故意留一条“意外的回忆”。
  const HALF_LIFE = 21
  const weightOf = (h) => {
    const at = h.at ? new Date(h.at).getTime() : 0
    const days = at ? Math.max(0, (Date.now() - at) / 86400e3) : 60
    const decay = Math.pow(0.5, days / HALF_LIFE)
    const times = Number(h.times || 0)
    return (h.s || 0) * (0.35 + decay) * (1 + Math.log1p(times))
  }
  for (const h of uniq) h.w = weightOf(h)
  uniq.sort((a, b) => b.w - a.w)

  const chosen = []
  const used = new Set()
  // 两条高权重
  for (const h of uniq) {
    if (chosen.length >= 2) break
    chosen.push(h); used.add(h)
  }
  // 一条低权重（从第 3 名往后随机抽一条，制造意外）
  const rest = uniq.filter((h) => !used.has(h)).slice(0, Math.max(0, Math.min(9, uniq.length - 1)))
  if (rest.length) {
    const surprise = rest[Math.floor(Math.random() * rest.length)]
    chosen.push(surprise)
    used.add(surprise)   // 2026-11-02：抽中的也记进 used，否则后面补齐会把它再放一遍
  }
  // 不够就按顺序补齐
  for (const h of uniq) {
    if (chosen.length >= Math.min(limit, uniq.length)) break
    if (!used.has(h)) { chosen.push(h); used.add(h) }
  }

  // 元素标签：从他这句话里抽出“像元素的东西”（人物/物件/场景），给每条结果标上
  const elements = keywords(text).filter((k) => k.length >= 2).slice(0, 4)
  for (const h of chosen) {
    const own = elements.filter((k) => String(h.text).includes(k))
    h.elements = own.length ? own : elements.slice(0, 2)
  }

  return { ok: true, keywords: kws, elements, hits: chosen.slice(0, limit), total: uniq.length }
}
