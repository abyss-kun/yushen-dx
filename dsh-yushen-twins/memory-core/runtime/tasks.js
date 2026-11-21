/* 标签
 * id: memory-core-tasks
 * kind: module
 * summary: 从明确承诺里抽待办卡：只认“要做/答应/提醒我/明天…”，疑问和假设不算。
 * tags: 待办, 承诺, 任务卡, 抽取, 单一实现
 * created: 2026-11-13 19:55:00
 * changed: 2026-11-13 19:55:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：后台继续，自动抽待办/承诺）
 * audience: 以后议程、页面、维护
 * owner: 框架；宁可漏，不可把“要不要”当任务
 * mutable: 可改；疑问/假设/过程不抽
 * usage: detectTask(text) / writeTaskCard(row,text)
 * why: 待办现在各存一套，没从明确承诺进卡片
 * result: 明确的“要做/答应”能落成任务卡；不确定的不写
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { dataRoot } from './root.js'
import { appendInUse } from './shallow.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const clip = (s, n = 100) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
const cleanTaskText = (s) => String(s || '')
  .replace(/（[^）]*(?:分钟前|已搁置|已过期|待定|刚刚|昨天)[^）]*）/g, '')
  .replace(/\([^)]*(?:分钟前|已搁置|已过期|待定|刚刚|昨天)[^)]*\)/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const DUE = /(今天|明天|后天|今晚|明早|下周[一二三四五六日天]?|本周[一二三四五六日天]?|这周|月底|月底前|稍后|晚点|回头|待会|一会儿)/
const ASK = /(吗|么|要不要|是否|可不可以|能不能|如果|要是|假设|万一)/
const STRONG = /((?:我|她|我们|姐姐|老板|对方).{0,8}(?:答应|承诺)(?:要|会|做|给|在|明天|后天|下回|下次|今晚|这周|过|你|我|他|她)|记得(?:要|去|把|明天|后天|今晚|下回|下次)|提醒我|别忘|说好|约好)/
const RULE = /(不管|每次|除非|一律|禁止|不许|规则|原则|流程)/
const PAST = /(做完了|已完成|已经|曾|刚刚|昨天|之前|过了|搞定|跑通|提交了|写完了|拉过|改完|收尾)/
const FUTURE = /(明天|后天|下周[一二三四五六日天]?|今晚|明早|稍后|回头|待会|一会儿|下次)/
const MODAL = /(?:我|她|我们).{0,3}(?:要|会|得|去|把|答应|承诺|记得|提醒|别忘)/
const INTENT = /(要|会|得|去|把|答应|承诺|记得|提醒我|别忘|待办)[^。！？]{0,50}(做|修|写|发|回|查|看|整理|交|补|改|跑|买|约|问|确认|处理|准备|收尾)/

/** 只认明确要做的事；疑问/假设/纯过程返回 null。 */
export function detectTask(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length < 6 || t.length > 400) return null
  if (ASK.test(t)) return null
  // 文档/示例/调试串不是任务：自动扫描不能把“比如/样例/写卡后”写成待办。
  if (/(样例|示例|看了这个|我又想到|写卡后|symptom|fromRef|head=|只认明确)/.test(t)) return null
  if (RULE.test(t) && !STRONG.test(t)) return null
  if (/^(她准备|我正在|刚刚|先看看|准备去|打算先)/.test(t)) return null
  if (!STRONG.test(t) && PAST.test(t)) return null
  const due = (t.match(DUE) || [])[1] || ''
  const strong = STRONG.test(t)
  if (!strong && !FUTURE.test(t)) return null
  if (!strong && !MODAL.test(t)) return null
  if (!strong && !INTENT.test(t)) return null
  const action = clip(cleanTaskText(t), 90)
  return {
    action,
    due,
    confidence: strong ? '确定' : '推测',
    strong,
  }
}

/** 从一段长文里按句找任务；一句一句判，避免整段有问号就全否。 */
export function detectTasks(text, { limit = 5 } = {}) {
  const parts = String(text || '')
    .split(/(?<=[。！？!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out = []
  const seen = new Set()
  for (const p of parts) {
    const d = detectTask(p)
    if (!d || seen.has(d.action)) continue
    seen.add(d.action)
    out.push(d)
    if (out.length >= limit) break
  }
  return out
}

/** 从一条 raw 的“用户消息”里找任务；助手说明/文档不扫，避免把示例当待办。 */
export function tasksFromRaw(rawRef = '', { limit = 5, includeAssistant = false } = {}) {
  const rel = String(rawRef || '').replace(/^dayu\//, '')
  const file = path.isAbsolute(rel) ? rel : path.join(dataRoot(HOME), rel)
  const texts = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      const e = JSON.parse(line)
      // 用户说的承诺照旧；她自己在回答里明确答应/说好的，也要进未闭合账。
      if (e.type !== 'user/message' && !(includeAssistant && e.type === 'assistant/message')) continue
      for (const c of (e.data?.content || [])) if (c?.type === 'text' && c.text) texts.push(c.text)
    }
  } catch { return [] }
  return detectTasks(texts.join('\n'), { limit })
}

export function tasksFromRow(row = {}, { limit = 5 } = {}) {
  return tasksFromRaw(row.rawRef || '', { limit })
}

export function writeTaskFrom(row = {}, d = null) {
  if (!d) return { ok: true, skipped: true, why: '不是明确任务' }
  const at = String(row.at || new Date().toISOString())
  const day = at.slice(0, 10)
  const key = sha(cleanTaskText(d.action))
  const card = {
    id: `t-${sha(`${key}|${d.due}`)}`,
    kind: '任务',
    head: clip(d.due ? `${d.due}：${d.action}` : d.action, 40),
    detail: d.action,
    text: d.action,
    keywords: ['待办', ...(d.due ? [d.due] : [])],
    tags: ['待办', ...(d.due ? [d.due] : [])],
    at,
    day,
    channel: row.channel || '手动',
    role: String(row.role || 'unbound'),
    topic: '待办',
    topicKey: '待办',
    source: '待办抽取',
    turnId: String(row.turnId || ''),
    ref: String(row.ref || ''),
    fromRef: `task:${key}`,
    threadId: String(row.sessionId || ''),
    eventKey: String(row.turnId || row.id || ''),
    status: 'open',
    tier: '中游',
    due: d.due,
    confidence: d.confidence,
    useCount: 0,
    lastUsed: at,
    createdAt: at,
    links: [],
  }
  return { ...appendInUse('任务', day, card), card }
}

export function writeTaskCard(row = {}, text = '') {
  const d = detectTask(text)
  if (!d) return { ok: true, skipped: true, why: '不是明确任务' }
  return writeTaskFrom(row, d)
}
