/* 标签
 * id: lib-recall-hook
 * kind: module
 * tags: 检索, 触发, 该搜什么, 记忆
 * created: 2026-11-04 13:30:00
 * changed: 2026-11-11 00:47:31
 * author: 照微·工作台
 * authority: 老板（2026-11-04：怎么让你们想搜什么搜什么，问一句能自己搜到，不问也会搜）
 * why: 检索器早就有，但一天三百多回合只搜了 8 次——缺的不是能力，是「该搜了」这个提醒
 * result: 给「问一句 → 自己搜」这一环提供纯本地线索；不改判断、不替她答
 * mutable: 可改
 * audience: 框架（注入前抽"该搜什么"）、她
 * owner: 框架；只用规则，不调模型
 * usage: hintsFor(text) → 值得去翻的线索（引号词/时间词/问法/实体）
 * summary: 「该搜什么」的抽取器：引号词 / 时间词 / 问法 / 实体，只用规则，不调模型。
 */
// 「该搜什么」的抽取器（2026-11-04）：
//   为什么有它：find-any / search / recall 都在，但 11-03 那天 3247 次工具调用里只有 8 次是检索。
//   所以第一步不是再造检索，而是——把话里「值得去翻旧账」的东西指出来（只用规则，不调模型）。
//
// 抽四类线索：
//   ① 引号里的词：她说「花瓶」→ 搜 花瓶
//   ② 时间词：昨天/上次/之前/那天/10-30/10月30日 → 那是"翻旧账"的信号
//   ③ 问法：为什么/怎么/谁/哪次/是不是 → 可能要出处
//   ④ 专有名词：已知的人名/项目名（从 owner.json / charter.json / 名册里读，读不到就用内置几个）
//
// 只输出"建议搜什么"，不输出结论；搜不搜、用不用，都是她自己决定。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TIME_WORDS = ['昨天', '前天', '上次', '之前', '那天', '那次', '当时', '刚才', '上周', '上个月', '去年', '原来', '以前']
const ASK_WORDS = ['为什么', '怎么', '怎么会', '谁', '哪次', '哪个', '是不是', '有没有', '记不记得', '还记得']

function knowNames() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const names = new Set(['大鱼', '小鱼', '照微', '主人', '花瓶'])
  try {
    const ch = JSON.parse(fs.readFileSync(path.join(home, 'dayu', 'charter.json'), 'utf8'))
    for (const v of Object.values(ch.identity || {})) {
      if (v && v.name) names.add(String(v.name))
      if (v && v.alias) names.add(String(v.alias))
    }
  } catch { /* 读不到就用内置 */ }
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(home, 'dayu', 'characters.json'), 'utf8'))
    for (const c of rows.characters || []) if (c.name) names.add(String(c.name))
  } catch { /* 同上 */ }
  return names
}

/**
 * 从一句话里抽出「该搜什么」。
 * @param {string} text 她说的话/问题
 * @returns {{keywords:string[], times:string[], asks:string[], names:string[], line:string}}
 */
export function hintsFor(text = '') {
  const s = String(text || '')
  const keywords = new Set()

  // ① 引号里的话（中英文引号都认）
  for (const m of s.matchAll(/[「『"“”'‘’《]([^」』"“”'‘’》]{1,40})[」』"“”'‘’》]/g)) {
    const w = m[1].trim()
    if (w.length >= 2 && w.length <= 40) keywords.add(w)
  }

  // ② 时间词 + 具体日期
  const times = []
  for (const w of TIME_WORDS) if (s.includes(w)) times.push(w)
  for (const m of s.matchAll(/(\d{1,2}\s*[-月]\s*\d{1,2}\s*日?|\d{4}-\d{2}-\d{2})/g)) times.push(m[1].replace(/\s+/g, ''))

  // ③ 问法（只在句子真像在问的时候）
  const asks = ASK_WORDS.filter((w) => s.includes(w))

  // ④ 专有名词
  const names = [...knowNames()].filter((n) => n && s.includes(n))

  // 关键词 = 引号词 + 专有名词（去重、限量）
  for (const n of names) keywords.add(n)
  const list = [...keywords].slice(0, 6)

  const wants = []
  if (times.length) wants.push(`时间是「${times.slice(0, 3).join('/')}」`)
  if (names.length) wants.push(`提到了「${names.slice(0, 3).join('、')}」`)
  if (asks.length) wants.push(`在问「${asks.slice(0, 3).join('、')}」`)
  const line = list.length || times.length
    ? `这句话值得先翻旧账（${wants.join('；') || '引号里有具体词'}）：可以搜「${(list.length ? list : times).slice(0, 4).join('」「')}」——记忆、库、会话原文里找，别凭印象答。`
    : ''
  return { keywords: list, times: [...new Set(times)].slice(0, 5), asks, names, line }
}
