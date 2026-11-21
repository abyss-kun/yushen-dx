/* 标签
 * id: memory-core-usage
 * kind: module
 * summary: 抄录后本地对比整轮：这一轮用到了哪张旧卡，用上才记 used，不问道、不调模型。
 * tags: 用到, 本地对比, 反馈, 召回, 降温
 * created: 2026-11-15 13:10:00
 * changed: 2026-11-15 13:10:26
 * author: 大鱼·本班
 * authority: 老板（2026-11-15：与其问，不如本地机制打分；抄录时做对比）
 * audience: capture、query、反馈
 * owner: 框架；只追加 used，不扣“没用”
 * mutable: 可改；阈值必须保守，宁可漏记不误记
 * usage: analyzeTurn({turnId,userText,answerText,now}) → {hits, marked}
 * why: 现在“用没用上”主要靠她主动说，recall-log 也停在 11-09
 * result: 每轮抄录后自动给本次真正用到的旧卡记一次 used
 */
import { find } from './query.js'
import { recordFeedback, readFeedback } from './feedback.js'
import { tokenizeForBM25 } from '../pick.mjs'

const clip = (s, n = 120) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
const ENTITY = /BV[0-9A-Za-z]{10}|[\w-]+\.(?:js|mjs|json|md|png|mp4|py)|[A-Za-z]{4,}|\d{5,}/g

function tokens(text) {
  return new Set(tokenizeForBM25(text).map((x) => x.toLowerCase()))
}

function entities(text) {
  const out = new Set()
  for (const m of String(text || '').matchAll(ENTITY)) out.add(m[0].toLowerCase())
  return out
}

/**
 * 本地判断“这一轮用到了哪些卡”：
 * - 稀有词：卡里有、你问里没有、她答里出现了；
 * - 实体：文件名/BV/长数字/英文词同时出现在卡和回答里；
 * - 只记“用上了”，没证据不记“没用”。
 */
export function analyzeTurn({ turnId = '', userText = '', answerText = '', limit = 12, now = Date.now() } = {}) {
  const uid = String(turnId || '').trim()
  const ans = String(answerText || '')
  if (!uid || !String(userText || '').trim() || !ans.trim()) return { ok: true, hits: 0, marked: 0 }
  const uTok = tokens(userText)
  const aTok = tokens(ans)
  const aEnt = entities(ans)
  let hits = 0
  let marked = 0
  const seen = new Set()
  // 同一轮重复跑不重复记：note 里带 currentTurn。
  const old = new Set(readFeedback({ limit: 2000 })
    .filter((r) => /自动抄录对照/.test(String(r.note || '')) && String(r.note).includes(uid))
    .map((r) => String(r.turnId || r.ref || '')))
  let list = []
  try { list = find(userText, { limit, rings: 1, dedupe: true }) } catch { return { ok: false, hits: 0, marked: 0, error: 'query failed' } }
  for (const h of list) {
    if (!h.turnId || String(h.turnId) === uid) continue
    hits += 1
    const text = clip(h.snippet || '', 200)
    if (!text) continue
    const cTok = tokens(text)
    const rare = [...cTok].filter((t) => !uTok.has(t) && aTok.has(t))
    const ent = [...entities(text)].filter((x) => aEnt.has(x))
    const score = rare.length + ent.length * 2
    if (score < 2) continue
    const key = String(h.turnId)
    if (seen.has(key) || old.has(key)) continue
    seen.add(key)
    const row = recordFeedback({
      turnId: String(h.turnId),
      ref: String(h.ref || ''),
      layer: String(h.layer || ''),
      used: '用上了',
      outcome: '',
      note: `自动抄录对照 currentTurn=${uid} rare=${rare.slice(0, 4).join('/')} ent=${ent.slice(0, 3).join('/')}`,
    })
    if (row.ok) marked += 1
  }
  return { ok: true, hits, marked, at: new Date(now).toISOString() }
}
