// 分歧（一等对象）：2026-11-03 老板与 B站评论共同定下的做法。
/* 标签
 * id: lib-divergences
 * kind: module
 * summary: 分歧（一等对象）：两张卡对同一件事说法不同时，单独记一条分歧挂住两张卡 id，注入只渲染分歧。
 * tags: 分歧, 多角色, 注入
 * created: 2026-11-11 01:20:00
 * changed: 2026-11-11 01:20:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式；2026-11-03 与 B站评论共同定）
 * audience: 她、多角色注入、维护者
 * owner: 老板（这是他和评论共同定的一等对象）
 * mutable: 可改存储；**不许改成"并排两张卡"**（那就把判断成本丢给读者）
 * usage: 记一条分歧（挂两个卡 id）→ 注入只渲染这一条
 * why: 并排两张卡暗示"两条都成立"，而且排版把判断成本丢给读的人
 * result: 一条分歧记录 + 各自的衰减
 */
//
// 为什么不给两张卡各打一个标：
//   并排两张卡 = 把判断成本丢给读的人，而且排版暗示「并排 = 两条都成立」。
//   单独一条分歧记录挂住两张卡的 id，注入只渲染这条分歧；卡本体各走各的衰减。
//
// 为什么不缩字：
//   缩字会丢关键字（「逐项核对一致」缩成「核对一致」就变了意思）。原话照抄，
//   只在前面加 A/B 与完整时间。省的是「卡片重复出现」，不是「把话缩掉」。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = path.join(HOME, 'dayu', 'library', '分歧.jsonl')

export const DIVERGENCE_FILE = FILE

const readJsonl = (f) => {
  try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] }
}

/** 一条分歧的样子：
 *  { id, subject, why, sides: [{ cardId, text, at }], at, status: 'open'|'decided', decided?: {pick, why, at} }
 *  text 是原话（不缩），at 是那张卡自己的时间。
 */
export function listDivergences({ role = '', status = 'open', limit = 3 } = {}) {
  // 2026-11-03：同一条分歧可能被追加过"已关"，只认最新那一版（不然关了还在注入里显示）
  const latest = new Map()
  for (const d of readJsonl(FILE)) latest.set(d.id, d)
  return [...latest.values()]
    .filter((d) => !status || d.status === status)
    .filter((d) => !role || !d.role || d.role === role || d.role === 'unknown')
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, limit)
}

export function appendDivergence(d) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.appendFileSync(FILE, JSON.stringify(d) + '\n', 'utf8')
  return d
}

/** 注入用：一条分歧渲染成「标题 + A/B 原话 + 各自时间」。不裁正文。 */
export function renderDivergence(d) {
  if (!d) return ''
  const when = (s) => String(s || '').slice(0, 19).replace('T', ' ')
  const lines = [`## 两说：${d.subject || '同一件事有两种说法'}`]
  d.sides.slice(0, 2).forEach((s, i) => {
    lines.push(`${'ABC'[i]}（${when(s.at)}）：${String(s.text || '').slice(0, 34)}`)
  })
  return lines.join('\n')
}
