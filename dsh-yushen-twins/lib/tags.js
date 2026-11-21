/* 标签
 * id: lib-tags
 * kind: module
 * tags: 标签, 解析, 调用留痕, 注入
 * created: 未标注（补标签前的历史）
 * changed: 2026-11-11 00:47:31
 * author: 照微·工作台
 * authority: 老板（2026-11-03：不管什么只要改动/新增都要有标签）
 * why: 统一给对象加标签，方便按需提取与对账
 * result: 有标签块；审计能取到
 * mutable: 可改
 * audience: 框架（读标签块/注入前剥标签）、维护
 * owner: 框架；格式（HTML 注释）别改
 * usage: parseTagBlock 读块；stripForInject 注入前剥掉；staleTaggedFiles 查"改了内容没改标签"
 * summary: 标签解析：读文件头标签块、注入前剥掉、查"改了内容没改标签"。
 */
// 标签（2026-11-03 老板：不管是什么，只要改动了、新增了，都应该有对应的标签）：
//   · 日期到秒（最基本）· 来源 · 谁改的 · 为什么 · 谁让的 · 结果如何 · 这条本身该带什么标签
//   · 被调用的时候也要留痕（比如按标签注入）
//
// 这里只做**解析**这一半：把文件顶部的标签块读出来、并把该藏的藏掉。
// 格式（放在真源最前面，HTML 注释，渲染时看不见）：
//
//   <!-- 标签
//   id: dragon
//   kind: card
//   tags: 身份, 边界, 语气, 五境
//   created: 2026-10-30 09:00:00
//   changed: 2026-11-03 08:41:00
//   author: 老板
//   authority: 老板
//   why: 世界观重定，统一三张卡
//   result: 照微仍是顾问/龙神；旧版设定进 archive
//   mutable: 可改（本人点头）
//   -->
//
// 规则：
//   · 键值用 `key: value`，值里可以有冒号，按**第一个**冒号切；
//   · tags 用逗号/顿号分隔，去空、去重、小写保持原样；
//   · 只认**文件开头**那一块（允许前面有空行），不扫描正文，免得把正文里的注释也吃了。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// 两种写法都认：
//   · Markdown/卡：`<!-- 标签 … -->`（渲染看不见）
//   · 代码模块：`/* 标签 … */`（JS 里 <!-- 不合法）
const OPEN = /^\s*(?:<!--|\/\*)\s*(?:标签|tags|tag)\s*$/i
const CLOSE = /^\s*(?:-->|\*\/)\s*$/

/**
 * 解析文件开头的标签块。
 * @returns {{meta:Object, tags:string[], found:boolean, rest:string}}
 */
export function parseTagBlock(text = '') {
  const src = String(text || '')
  const lines = src.split(/\r?\n/)
  let i = 0
  while (i < lines.length && !lines[i].trim()) i += 1
  if (i >= lines.length || !OPEN.test(lines[i])) return { meta: {}, tags: [], found: false, rest: src }
  const meta = {}
  let j = i + 1
  for (; j < lines.length; j += 1) {
    if (CLOSE.test(lines[j])) break
    const line = lines[j]
    // 代码块里的行会带 ` * ` 前缀（JSDoc 风格），先剥掉再切键值
    const clean = line.replace(/^\s*\*\s?/, '')
    const at = clean.indexOf(':')
    if (at <= 0) continue
    const key = clean.slice(0, at).trim().toLowerCase()
    const value = clean.slice(at + 1).replace(/\s*\*\/\s*$/, '').trim()
    if (!key) continue
    meta[key] = value
  }
  if (j >= lines.length) return { meta: {}, tags: [], found: false, rest: src } // 没闭合：当没有
  const tags = String(meta.tags || '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
  const rest = lines.slice(j + 1).join('\n').replace(/^\s*\n/, '')
  return { meta, tags, found: true, rest }
}

/** 把"自动生成"标记也藏掉（sync-cards 会写在副本第一行）。 */
export function stripAutogenMark(text = '') {
  return String(text || '').replace(/^\s*<!--\s*AUTOGEN[^>]*-->\s*\n?/i, '')
}

/** 注入/展示前用：既去标签块，也去自动生成标记。 */
export function stripForInject(text = '') {
  const { rest } = parseTagBlock(text)
  return stripAutogenMark(rest)
}

/** 读一个文件的标签（读不到就返回空壳，不抛）。 */
export function readTags(file) {
  try {
    const { meta, tags, found } = parseTagBlock(fs.readFileSync(file, 'utf8'))
    return { found, meta, tags }
  } catch { return { found: false, meta: {}, tags: [] } }
}

/** 把 `2026-11-03 23:25:00` / ISO 都解析成毫秒；不行就 NaN。 */
export function parseWhen(value) {
  const s = String(value || '').trim()
  if (!s) return NaN
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime()
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : NaN
}

/**
 * 「改了内容没改标签」体检（2026-11-03 老板：改了内容就要做标注，这个要做到）。
 *
 * 判据：文件有标签块，但**磁盘上的修改时间晚于标签里的 `changed`**（留 60 秒容差给写盘/时钟）。
 * 也就是说：改过一次内容，就必须把 `changed` 改到秒——忘了就红。
 * @returns {{file:string, mtime:string, changed:string, driftSec:number}[]}
 */
export function staleTaggedFiles(files = [], { toleranceMs = 60000 } = {}) {
  const stale = []
  for (const file of files) {
    let st = null
    try { st = fs.statSync(file) } catch { continue }
    if (!st.isFile()) continue
    const { found, meta } = parseTagBlock(fs.readFileSync(file, 'utf8'))
    if (!found) continue
    const changed = parseWhen(meta.changed)
    if (!Number.isFinite(changed)) continue // 没写 changed 的由别的检查管（字段齐不齐）
    const drift = st.mtimeMs - changed
    if (drift > toleranceMs) {
      stale.push({ file, mtime: new Date(st.mtimeMs).toISOString(), changed: String(meta.changed), driftSec: Math.round(drift / 1000) })
    }
  }
  return stale
}

/** 按标签选条目（"按标签注入/提取"的最小实现）：有交集就算命中。 */
export function matchesAny(itemTags = [], wanted = []) {
  if (!wanted.length) return true
  const have = new Set((itemTags || []).map((t) => String(t).toLowerCase()))
  return wanted.some((t) => have.has(String(t).toLowerCase()))
}

/**
 * 按标签取「一小块」（2026-11-03 老板：注入可以整个模块，也可以只一块；卡里大标题有标签，
 * 下面一行行的也要有）。认的块格式：
 *
 *   ## 小标题
 *   **标签**：边界 · 记忆 · 谁的归谁
 *   正文……
 *
 * @returns {{heading:string, tags:string[], body:string}[]}
 */
export function splitTaggedSections(text = '') {
  const lines = String(text || '').split(/\r?\n/)
  const out = []
  let cur = null
  for (const line of lines) {
    const h = line.match(/^##\s+(.+)$/)
    if (h) {
      if (cur) out.push(cur)
      cur = { heading: h[1].trim(), tags: [], body: [] }
      continue
    }
    if (!cur) continue
    const t = line.match(/^\s*\*\*标签\*\*：(.+)$/)
    if (t) { cur.tags = t[1].split(/[·、,，|]/).map((s) => s.trim()).filter(Boolean); continue }
    cur.body.push(line)
  }
  if (cur) out.push(cur)
  return out.map((s) => ({ heading: s.heading, tags: s.tags, body: s.body.join('\n').trim() }))
}

/** 取命中标签的那些块，拼回 markdown（没命中返回空串）。 */
export function extractByTag(text = '', wanted = []) {
  const hits = splitTaggedSections(text).filter((s) => matchesAny(s.tags, wanted))
  return hits.map((s) => `## ${s.heading}\n\n${s.body}`).join('\n\n')
}

/**
 * 调用留痕（2026-11-03 老板：「被调用的要有」）。
 * 记「什么时候、谁的、哪个标签、在哪个场景、被拿来干什么」——**同一分钟同一件事只记一条**，
 * 免得每轮注入都灌一行。写失败不影响调用。
 */
export function logUse({ source = '', role = '', scene = '', tags = [], purpose = '注入', at = new Date() } = {}) {
  try {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    const dir = path.join(home, 'dayu', 'runtime')
    const file = path.join(dir, 'tag-usage.jsonl')
    const iso = new Date(at).toISOString()
    const stamp = iso.slice(0, 16) // 到分钟
    const line = { at: iso, source: String(source).slice(0, 120), role: String(role), scene: String(scene), tags: (tags || []).slice(0, 12), purpose: String(purpose).slice(0, 40), minute: stamp }
    // 去重：同一分钟、同一 source+role+scene+purpose 只留一条
    try {
      const tail = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-80)
      const dup = tail.some((l) => {
        try {
          const r = JSON.parse(l)
          return r.minute === line.minute && r.source === line.source && r.role === line.role && r.scene === line.scene && r.purpose === line.purpose
        } catch { return false }
      })
      if (dup) return { ok: true, skipped: true }
    } catch { /* 还没有文件：照记 */ }
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(file, JSON.stringify(line) + '\n', 'utf8')
    return { ok: true, skipped: false }
  } catch { return { ok: false } }
}

