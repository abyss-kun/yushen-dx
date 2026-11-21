/* 标签
 * id: memory-core-person-card
 * kind: module
 * summary: 从 QQ 原始事实里认出“谁说了什么”，聚成人物卡的基础数据；只写可观察的，不猜性格。
 * tags: 人物卡, 解析, 聚合, 浅层, 单一实现
 * created: 2026-11-13 21:05:00
 * changed: 2026-11-14 13:56:18
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：QQ raw 里的人物卡先做成模块 + 测试）
 * audience: 以后的人物卡链路、页面、维护
 * owner: 框架；只认可观察的说话方式，态度留空由她自己填
 * mutable: 可改；宁可少写，不替她判断对方是什么人
 * usage: parseIncoming(text) / parsePersonMessages(text) / buildPersonCard({id,name,messages}) / writePersonCard(card)
 * why: raw 里已经有“谁、QQ号、说了什么”，但还没人把它接成人物卡
 * result: 解析/构建是纯函数；要落卡时只写 library/在用/人物，不碰桥和 people/relations
 */
import crypto from 'node:crypto'
import { appendInUse } from './shallow.js'

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const clip = (s, n = 100) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)

// 一行一条：`- [incoming] 名字 258767910: 内容`
// 名字里可能有空格（“从零开始”这种），所以名字用非贪婪匹配，靠后面的 QQ 号数字收口。
const INCOMING = /\[\s*incoming\s*\]\s*([^\s:：][^:：]*?)\s+(\d{5,12})\s*[:：]\s*(.*)$/i
const LIST_MARK = /(?:^|\n)\s*(?:[-*·•>]|\d+[.、)]|[（(]\d+[）)]|[一二三四五六七八九十]+[、.)）])/
const QUESTION = /[?？]/

/** 从一段文本里找 `[incoming] 名字 QQ号: 内容` 行；同 id+内容只留一次。 */
export function parseIncoming(text) {
  const out = []
  const seen = new Set()
  for (const line of String(text || '').split(/\r\n|\r|\n/)) {
    const m = line.match(INCOMING)
    if (!m) continue
    const name = String(m[1] || '').trim()
    const id = String(m[2] || '').trim()
    const body = String(m[3] || '').trim()
    if (!id || !body) continue
    const key = `${id}|${body}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, id, text: body })
  }
  return out
}

/** 按 QQ 号聚合：一个人一条，消息按原文顺序；昵称会变，ID 不变，所以名字取最近一次。 */
export function parsePersonMessages(text) {
  const byId = new Map()
  for (const row of parseIncoming(text)) {
    let p = byId.get(row.id)
    if (!p) {
      p = { id: row.id, name: row.name, messages: [] }
      byId.set(row.id, p)
    }
    if (row.name) p.name = row.name
    p.messages.push(row.text)
  }
  return [...byId.values()]
}

/** 只看可观察的：列点、句子长短、问不问。最多两条，宁可空着也不猜。 */
function observeStyle(messages) {
  const list = (messages || []).map((m) => String(m || '').trim()).filter(Boolean)
  if (!list.length) return []
  const style = []
  const listCount = list.filter((m) => LIST_MARK.test(m)).length
  if (listCount >= 2) style.push('常列点')
  const avg = list.reduce((n, m) => n + m.replace(/\s+/g, ' ').length, 0) / list.length
  if (avg >= 40) style.push('句子较长')
  else if (list.length >= 2 && avg <= 10) style.push('常发短句')
  const askCount = list.filter((m) => QUESTION.test(m)).length
  if (askCount >= 2 && askCount / list.length >= 0.4) style.push('常提问')
  return style.slice(0, 2)
}

/** 建一张人物卡；纯函数，不读写文件。没有证据的部分一律留空。 */
export function buildPersonCard({ id = '', name = '', channel = 'QQ', messages = [], at = '' } = {}) {
  const personId = String(id || '').trim()
  const personName = String(name || '').trim()
  const list = (Array.isArray(messages) ? messages : []).map((m) => String(m || '').trim()).filter(Boolean)
  const when = String(at || new Date().toISOString())
  const head = personName ? `${personName}（${personId}）` : `QQ ${personId}`
  const detail = list.length
    ? `${head} 的 ${list.length} 条消息；只记可观察的说话方式，不猜性格。`
    : `${head}；还没有消息可观察。`
  return {
    id: `p-${sha(`${personId}|${when}`)}`,
    kind: '人物',
    head,
    detail: clip(detail, 120),
    personId,
    name: personName,
    aliases: personName ? [personName] : [],
    channel: String(channel || 'QQ'),
    style: observeStyle(list),
    attitude: { toHer: '', evidence: [] },
    facts: [],
    events: [],
    status: 'active',
    tier: '中游',
    source: '人物卡解析',
    confidence: '推测',
    createdAt: when,
    at: when,
    useCount: 0,
    lastUsed: when,
    links: [],
  }
}

/** 落一张人物卡：写 library/在用/人物/<day>.jsonl；同一个人只写一次。 */
export function writePersonCard(card = {}) {
  const personId = String(card.personId || card.id || '').trim()
  if (!personId) return { ok: false, error: '缺 personId' }
  const at = String(card.at || card.createdAt || new Date().toISOString())
  const day = at.slice(0, 10)
  const full = {
    ...card,
    kind: '人物',
    personId,
    at,
    createdAt: String(card.createdAt || at),
    source: card.source || '人物卡解析',
    fromRef: `person:${personId}`,
  }
  return { ...appendInUse('人物', day, full), card: full }
}
