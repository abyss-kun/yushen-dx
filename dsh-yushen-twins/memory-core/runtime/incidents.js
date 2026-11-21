/* 标签
 * id: memory-core-incidents
 * kind: module
 * summary: 从有症状的话里抽错题卡：只认“失败/报错/缺口，且至少带原因或怎么修/怎么防”。
 * tags: 错题, 事故, 症状, 原因, 防复发, 抽取, 单一实现
 * created: 2026-11-13 21:00:00
 * changed: 2026-11-19 23:55:08
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：后台继续，自动抽错题/事故）
 * audience: refine、错题本视图、未来页面
 * owner: 框架；宁可漏，不把疑问/假设/情绪/骂人当错题
 * mutable: 可改；去掉“疑问、假设、纯情绪、单纯骂人”这条红线就算改坏
 * usage: detectIncident(text) / detectIncidents(text,{limit}) / writeIncidentCard(row,detected)
 * why: 错题以前只能手动写；明明说了“为什么错、怎么防”，却只留在对话里
 * result: 讲清症状+原因/修复/防复发的话能落成错题卡；不确定的不写
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'
import { appendInUse } from './shallow.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const clip = (s, n = 100) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)

// 去掉时间戳/状态括号这类每次都变的填充，只用来算 hash 和 head，不参与判句。
const cleanText = (s) => String(s || '')
  .replace(/（[^）]*(?:分钟前|小时前|天前|刚刚|已修复|已结单|待定|第\d+次)[^）]*）/g, '')
  .replace(/\([^)]*(?:分钟前|小时前|天前|刚刚|已修复|已结单|待定|第\d+次)[^)]*\)/g, '')
  .replace(/\s+/g, ' ')
  .trim()

// 症状：已经出事了才算。“担心会出事”不算（那种在疑问/假设里被筛掉）。
const SYMPTOM = /(失败|报错|出错|坏了|崩了|挂了|异常|超时|断了|连不上|打不开|不通|对不上|不一致|没成|没成功|不成功|缺口|卡住|卡死|丢了|没了(?!解)|错位|不工作)/
// 原因：明说因果，或直接承认自己漏看了什么。
const CAUSE = /(因为|由于|原因|根源|根因|是因为|导致|起因|就因为|卡在|怪|没看|忘了|漏了|没注意|没检查)/
// 修复：这一次怎么补救的。
const FIX = /(修好|修了|已修|修(?!炼|仙)|改成|改好|改完|改掉|改(?!天)|补上|补了|重跑|重新跑|回滚|重启|绕过|解决|处理掉|处理了|用回|换回|恢复|重装|清掉|关掉|加上)/
// 防复发：下一次怎么不犯。
const PREVENT = /(下次|以后|今后|下回|别再|不要再|避免|防复发|防止|一律|每次|记得|提前|先.{0,10}再)/
// 疑问/假设：整句跳过，不用它否掉整段。
const QUESTION = /([？?]|吗|怎么办|怎么|怎样|如何|为什么|为何|是否|能不能|可不可以|要不要|该不该|会不会|有没有|如果|要是|假设|假如|万一|难道)/
// 纯情绪/单纯骂人：这类分句不作症状、不作原因。
const EMOTION = /(好累|太累|累了|烦死|好烦|郁闷|难过|生气|崩溃|无语|服了|醉了|好爽|开心|高兴|委屈)/
const INSULT = /(傻|蠢|笨|垃圾|废物|狗屎|妈的|他妈的|真他妈|混蛋|去死|滚蛋|脑残|弱智)/

// 按句切（保留标点），再按逗号/分号/顿号切成小句；一句一个判断，避免整段有问号就全否。
const sentences = (s) => String(s || '').split(/(?<=[。！？!?；;\n])/).map((x) => x.trim()).filter(Boolean)
const clauses = (s) => String(s || '').split(/[，,；;、]/).map((x) => x.trim()).filter(Boolean)

// 纯情绪/骂人、又没说事的，整句丢掉。
const noisy = (c) => (EMOTION.test(c) || INSULT.test(c))
  && !SYMPTOM.test(c) && !CAUSE.test(c) && !FIX.test(c) && !PREVENT.test(c)

// 去掉句首的连接词/时间词，让卡片读起来像一条结论。
const LEAD = /^(所以|但是|而且|然后|结果|不过|可是|并且|另外|还有|这次|今天|刚才|刚刚|就|那|则)[，,、：:\s]*/
const tidy = (s, extra = []) => {
  let t = String(s || '').replace(/^[，,；;、：:。\s]+/, '').trim()
  const lead = t.match(LEAD)
  if (lead) t = t.slice(lead[0].length).trim()
  for (const w of extra) {
    if (t.startsWith(w)) { t = t.slice(w.length).trim(); break }
  }
  return t.replace(/^[，,；;、：:。\s]+/, '').replace(/[，,、：:；;\s]+$/, '').trim()
}

// “因为…／由于…”取后面那截；“…导致…／卡在…／怪…”取前面那截。
const causeOf = (c) => {
  const t = String(c || '').trim()
  const m = t.match(/(因为|由于|原因是|是因为|根因是|根源是|就因为|导致|卡在|怪)/)
  if (!m) return cleanText(t)
  const tail = t.slice(m.index + m[0].length)
  const head = t.slice(0, m.index)
  const body = /^(导致|卡在|怪)$/.test(m[0]) ? head : tail
  return cleanText(body) || cleanText(t)
}

/** 只认“有症状 + 至少带原因/修复/防复发之一”；疑问、假设、纯情绪、单纯骂人返回 null。 */
export function detectIncident(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length < 5 || t.length > 600) return null
  // “缺口 0”“缺口：0”是体检通过，不是事故。
  if (/缺口\s*[:：]?\s*0/.test(t)) return null
  // 文档/示例/调试串不是错题：自动扫描不能把示例句写成事故。
  if (/(样例|示例|写卡后|symptom|fromRef|head=|只认明确)/.test(t)) return null
  // 一句一句过：疑问/假设句跳过，剩下的分句放在一起看（防复发常在后半句）。
  const cs = []
  for (const s of sentences(t)) {
    if (QUESTION.test(s)) continue
    for (const c of clauses(s)) if (!noisy(c)) cs.push(c)
  }
  if (!cs.length) return null
  const sickClause = cs.find((c) => SYMPTOM.test(c))
  if (!sickClause) return null
  const symptom = clip(tidy(sickClause), 60)
  const cause = causeOf(cs.find((c) => CAUSE.test(c)) || '')
  const prevention = tidy(cs.find((c) => PREVENT.test(c)) || '')
  // 说了“下次/以后”的分句算防复发，不再重复算修复。
  const fix = tidy(cs.find((c) => FIX.test(c) && !PREVENT.test(c)) || '', ['已经', '后来', '然后', '再'])
  if (!cause && !fix && !prevention) return null
  return {
    symptom,
    cause,
    fix,
    prevention,
    confidence: cause && (fix || prevention) ? '确定' : '推测',
  }
}

/** 从一段长文里按句找多张错题；一是防复发句没症状，折进前一条错题里。 */
export function detectIncidents(text, { limit = 5 } = {}) {
  const units = String(text || '').split(/(?<=[。！？!?\n])/).map((s) => s.trim()).filter(Boolean)
  const groups = []
  for (const u of units) {
    // 只有“有症状且不是疑问”的句子才另起一条；补原因/补防复发的句子跟在前一条后面。
    if (groups.length && (QUESTION.test(u) || !SYMPTOM.test(u))) groups[groups.length - 1] = `${groups[groups.length - 1]}${u}`
    else groups.push(u)
  }
  const out = []
  const seen = new Set()
  for (const g of groups) {
    const d = detectIncident(g)
    if (!d || seen.has(d.symptom)) continue
    seen.add(d.symptom)
    out.push(d)
    if (out.length >= limit) break
  }
  return out
}

const detailOf = (d) => {
  const bits = []
  if (d.cause) bits.push(`原因：${d.cause}`)
  if (d.fix) bits.push(`修复：${d.fix}`)
  if (d.prevention) bits.push(`防复发：${d.prevention}`)
  return clip(bits.join('；'), 200) || '（只记了症状，原因和怎么防还没说）'
}

/** 从一条 raw 的用户消息里找错题；只读用户消息，不扫助手文档。 */
export function incidentsFromRaw(rawRef = '', { limit = 3 } = {}) {
  const rel = String(rawRef || '').replace(/^dayu\//, '')
  const file = path.isAbsolute(rel) ? rel : path.join(dataRoot(HOME), rel)
  const texts = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      const e = JSON.parse(line)
      if (e.type !== 'user/message') continue
      for (const c of (e.data?.content || [])) if (c?.type === 'text' && c.text) texts.push(c.text)
    }
  } catch { return [] }
  return detectIncidents(texts.join('\n'), { limit })
}

/** 写一张错题卡到 在用/错题/<day>.jsonl；去重靠 appendInUse 的 fromRef/head。 */
export function writeIncidentCard(row = {}, d = null) {
  if (!d) return { ok: true, skipped: true, why: '不是错题（没症状，或没说原因/怎么修/怎么防）' }
  const at = String(row.at || new Date().toISOString())
  const day = at.slice(0, 10)
  // fromRef 按症状归一：同一面墙只留一张单；id 再加上原因/修复，换了原因是另一条。
  const key = sha(cleanText(d.symptom))
  const card = {
    id: `i-${sha(`${key}|${d.cause}|${d.fix}|${d.prevention}`)}`,
    kind: '错题',
    head: clip(cleanText(d.symptom), 40),
    detail: detailOf(d),
    text: clip(cleanText(d.symptom), 40),
    keywords: ['错题'],
    tags: ['错题'],
    at,
    day,
    channel: row.channel || '手动',
    role: String(row.role || 'unbound'),
    topic: '错题',
    topicKey: '错题',
    source: '错题抽取',
    turnId: String(row.turnId || ''),
    ref: String(row.ref || ''),
    fromRef: `incident:${key}`,
    threadId: String(row.sessionId || ''),
    eventKey: String(row.turnId || row.id || ''),
    // 错题纸的四栏，照开发手记：症状 / 原因 / 怎么修 / 怎么防。严重度、复发次数留给错题本视图以后算。
    symptom: clip(cleanText(d.symptom), 60),
    cause: clip(d.cause || '', 80),
    fix: clip(d.fix || '', 80),
    prevention: clip(d.prevention || '', 80),
    confidence: d.confidence || '推测',
    status: 'active',
    // 2026-11-19：错题天生该常看（怕再犯），新品就是「上游」，不再一律中游。
    tier: '上游',
    useCount: 0,
    lastUsed: at,
    createdAt: at,
    links: [],
  }
  return { ...appendInUse('错题', day, card), card }
}

/** 从一段话直接抽第一张错题写下来；没有就跳过。 */
export function writeIncidentText(row = {}, text = '') {
  return writeIncidentCard(row, detectIncident(text))
}
