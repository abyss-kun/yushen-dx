/* 标签
 * id: memory-core-search
 * kind: module
 * tags: 记忆, 按需检索, 工具, 别名, 有效期, 搬家
 * created: 2026-11-04 20:35:00
 * changed: 2026-11-21 20:10:40
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 S2 任务书：把 lib/memory-search.js 的检索搬进 memory-core/search.mjs，
 *           docs/人格变化史.md 改成可选参数、默认仍读原路径）
 * why: 记忆库拆分第 2 步（docs/方案-记忆库拆分.md §3、§5）——检索层跟存储层一起独立，
 *      独立插件只带 memory-core/ 就能 search / recent / changes，不用拖鱼神的 lib/。
 * result: searchMemory / recentMemory / changesOf；人格变化史的路径变成 changesOf 的可选参数
 *         （docFile，默认还是仓库里的 docs/人格变化史.md，不传时行为一字不变）。
 * moved: 2026-11-07 S2——从 lib/memory-search.js 原样搬到这里（只改了两个 import 的相对路径 + docFile 参数）
 * mutable: 可改（改逻辑改这里，别改薄壳）
 */
// 改｜2026-11-11 02:08｜大鱼·记忆会话（图书馆定稿）｜授权：主人（2026-11-11：同一件事同组取最新，旧版保留可查并标「旧版」）｜memory-core/search.mjs:46-80｜hits 加展示层同组分组：正文相似度 ≥0.8 视为同一件事，最新那条在前、旧版随后并标 older=true｜为什么：同一件事攒了几条不同日期的记忆时，检索结果里新旧混排，她读到的是过时那条；只做展示层排序，不改存储、不改召回分数｜验证：node scripts/test-memory-search.mjs 三组全过；node scripts/regression.mjs 293 通过 / 0 失败｜可改：可改；同组分组目前没有独立断言（只被上面这两条间接覆盖），下次动它必须先补一条再改
// 2026-11-07（S2 搬家）：本文件是 lib/memory-search.js 的原样搬家，检索逻辑一字未改。
// 旧地址 lib/memory-search.js 现在只是转发薄壳；改逻辑改这里，别改薄壳。
// 这个文件只做"把已有的检索能力包成一只手"，不新增检索算法：
//   search  → lib/recall-now.js（别名扩词、倒排、有效期）
//   recent  → memory-core/pick.mjs（最新 1 + 重要 2 的同一套选法）
// 所以工具和注入不会各说各话：注入里挑的和你想翻的是同一套规则。
import { recallNow } from '../lib/recall-now.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { pickForInject } from './pick.mjs'
// 2026-11-20：显式查记忆时，把命中的卡片记一次弱使用（只认 explicit；自动联想不记）。
import { noteRecall } from './runtime/recall-use.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
// 2026-11-07 S2：人格变化史从「写死路径」变成可选参数（不传就是这条老路径）。
const CHANGES_DOC = path.join(ROOT, 'docs', '人格变化史.md')

/** 按关键词翻记忆。 */
export function searchMemory(q, { role = '', limit = 8, includeForgotten = false } = {}) {
  const text = String(q || '').trim()
  if (!text) return { ok: false, error: '给一个词' }
  let out = { ok: true, hits: [], keywords: [], note: '' }
  try { out = recallNow(text, { limit, role, includeExpired: includeForgotten }) } catch (e) { return { ok: false, error: String(e?.message || e) } }
  const hits = (out.hits || []).slice(0, limit).map((h) => ({
    kind: h.kind || '',
    at: String(h.at || '').slice(0, 16).replace('T', ' '),
    tier: h.tier || '',
    text: String(h.text || '').slice(0, 160),
    id: h.id || '',
    where: h.file || '',
    // 2026-11-21：事件带情绪时一并给出来，翻记忆能看到“当时什么感觉”。
    emotion: h.emotion || '',
    valence: Number.isFinite(Number(h.valence)) ? Number(h.valence) : null,
    expired: Boolean(h.expired),
    older: false,
  }))
  // 2026-11-20：显式检索命中的卡片记一次弱使用（自动联想/预注入不记）。
  for (const h of hits) {
    const id = String(h.id || '')
    const kind = String(h.kind || '')
    const cardish = /^r-/.test(id) || ['卡片', '经验', '知识', '错题', '任务', '人物'].includes(kind)
    if (cardish) { try { noteRecall(id || h.where, { source: 'explicit' }) } catch { /* 记不上不影响查询 */ } }
  }
  // 2026-11-11 老板：同一件事检索到两条，优先取最新的；旧版保留可查（标「旧版」）。
  // 只做展示层分组，不改存储、不改 recall-now 的召回算法。
  try {
    const norm = (s) => String(s || '').replace(/[\s，。；：、,.!?！？"'"'（）()【】\[\]]/g, '')
    const bigrams = (s) => { const n = norm(s); const out = new Set(); for (let i = 0; i + 2 <= n.length; i += 1) out.add(n.slice(i, i + 2)); return out }
    const sim = (a, b) => {
      const A = bigrams(a); const B = bigrams(b)
      if (!A.size || !B.size) return 0
      let hit = 0
      for (const g of A) if (B.has(g)) hit += 1
      return hit / Math.max(A.size, B.size)
    }
    const groups = []
    for (const h of hits) {
      const g = groups.find((x) => sim(x.main.text, h.text) >= 0.8)
      if (!g) { groups.push({ main: h, older: [] }); continue }
      const tMain = Date.parse(String(g.main.at || '').replace(' ', 'T')) || 0
      const tNew = Date.parse(String(h.at || '').replace(' ', 'T')) || 0
      if (tNew > tMain) { g.older.push(g.main); g.main = h }
      else g.older.push(h)
    }
    hits.length = 0
    for (const g of groups) {
      hits.push(g.main)
      for (const old of g.older) { old.older = true; hits.push(old) }
    }
  } catch { /* 分组失败就按原顺序，不挡检索 */ }

  return {
    ok: true,
    q: text,
    keywords: out.keywords || [],
    hits,
    count: hits.length,
    note: hits.length ? '这些是原文/档案，不是结论；用不用你自己判断。' : '没搜到。没搜到就说没搜到，别拿印象补。',
  }
}

/** 最近记得的（和注入同一套选法：最新 1 + 重要 2）。 */
export function recentMemory(role, { n = 5 } = {}) {
  try {
    const picked = pickForInject(role, { n })
    return { ok: true, role, count: picked.length, items: picked }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

/**
 * 「她为什么变成现在这样」的角色维度检索（2026-11-04 老板：角色那块也可以用）。
 * 数据源两处：① 记忆里带 why 的条目（新写的才有，老的不猜）② 人格变化史文档的段落。
 *
 * docFile（2026-11-07 S2，可选）：人格变化史的文件路径。不传 = 仓库里的 docs/人格变化史.md
 * （和搬家前完全一样）；独立插件/别的项目可以把这份文档放在别处，传进来就行。
 * 只读，不调模型。
 */
export function changesOf(role = 'dragon', { q = '', limit = 6, docFile = CHANGES_DOC } = {}) {
  const needle = String(q || '').trim().toLowerCase()
  const hits = []
  // ① 记忆里带理由的
  try {
    const file = path.join(home(), 'dayu', 'soul', 'memory', `${role}.json`)
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const e of (doc.events || [])) {
      if (!e || !e.why) continue
      const hay = `${e.text} ${e.why}`.toLowerCase()
      if (needle && !hay.includes(needle)) continue
      hits.push({ kind: '记忆·带理由', at: String(e.at || '').slice(0, 16).replace('T', ' '), text: String(e.text).slice(0, 120), why: String(e.why).slice(0, 120) })
    }
  } catch { /* 没记忆 */ }
  // ② 人格变化史（仓库文档，按段落给）
  try {
    const doc = fs.readFileSync(String(docFile || CHANGES_DOC), 'utf8')
    const paras = doc.split(/\n(?=## )/).filter((p) => p.startsWith('## '))
    for (const p of paras) {
      const title = (p.match(/^## (.+)$/m) || [])[1] || ''
      if (needle && !p.toLowerCase().includes(needle)) continue
      hits.push({ kind: '变化史', at: '', text: title.slice(0, 80), why: String(p.split('\n').slice(1).join(' ').replace(/\s+/g, ' ')).slice(0, 160) })
    }
  } catch { /* 没文档 */ }
  return { ok: true, role, q: needle, count: hits.length, hits: hits.slice(0, limit), note: hits.length ? '这些是"为什么"的记录，不是命令；看完自己判断。' : '没有记录。没记录的就不算发生过。' }
}
