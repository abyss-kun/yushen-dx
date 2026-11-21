/* 标签
 * id: lib-summary-tree
 * kind: module
 * summary: 层级摘要：一天一页、一周一页，从轮次文件里按规则折叠，不调模型。
 * tags: 摘要, 层级, 日记, 周记
 * created: 2026-11-21 21:5x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：继续——层级摘要）
 * audience: 工具、以后注入
 * owner: 框架；只读聚合，不改原文
 * usage: daySummary(day) / weekSummary({endDay}) / buildSummaries()
 * why: 轮次太多，翻不动；日/周一层是“回过神来看”的最小单位
 * result: 每层 ≤ 400 字；没有就写“没有”；只按规则折，不编
 * mutable: 可改
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const TURNS = path.join(DATA, '思考', 'turns')
const DECISION = /(决定|以后都|以后别|不要再|别用|必须|就按|改成|否决|不准|从今天起|更正)/

function readTurns(day) {
  try {
    return fs.readFileSync(path.join(TURNS, `${day}.jsonl`), 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

function sayTexts(row) {
  const out = []
  for (const s of (row.steps || [])) for (const x of (s.say || [])) if (x?.text) out.push(String(x.text))
    return out
}

function clip(s, n = 40) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n) }

/** 一天的摘要（最多 6 行）。 */
export function daySummary(day) {
  const rows = readTurns(day)
  if (!rows.length) return { ok: false, day, text: `## ${day}\n- 没有轮次记录。\n` }
  const sessions = new Set(rows.map((r) => String(r.sessionId || '')).filter(Boolean))
  const topics = []
  const decisions = []
  let tools = 0
  let completed = 0
  for (const r of rows) {
    if (String(r.status || '') === 'completed') completed += 1
    for (const u of (r.user || [])) { const t = clip(u?.text, 36); if (t && topics.length < 4 && !topics.includes(t)) topics.push(t) }
    for (const t of sayTexts(r)) if (DECISION.test(t) && decisions.length < 3) { const c = clip(t, 40); if (!decisions.includes(c)) decisions.push(c) }
    for (const s of (r.steps || [])) tools += Array.isArray(s.tools) ? s.tools.length : 0
  }
  const lines = [
    `## ${day}（${rows.length} 轮 / ${sessions.size || 1} 个会话）`,
    topics.length ? `- 主要：${topics.join('；')}` : '- 主要：没有记下',
    decisions.length ? `- 决定/改口：${decisions.join('；')}` : '- 决定/改口：没有',
    `- 工具：${tools} 次；完成 ${completed}/${rows.length}`,
  ]
  const text = lines.join('\n') + '\n'
  return { ok: true, day, turns: rows.length, sessions: sessions.size, topics, decisions, tools, completed, text }
}

function dayList(endDay, days = 7) {
  const end = Date.parse(`${endDay}T00:00:00Z`)
  const out = []
  for (let i = days - 1; i >= 0; i -= 1) out.push(new Date(end - i * 86400e3).toISOString().slice(0, 10))
  return out
}

/** 一周的摘要（把七天的日摘要折成一段）。 */
export function weekSummary({ endDay = new Date().toISOString().slice(0, 10), days = 7 } = {}) {
  const list = dayList(endDay, days)
  const parts = list.map((d) => daySummary(d)).filter((x) => x.ok)
  if (!parts.length) return { ok: false, text: `## 一周（${list[0]} ~ ${list[list.length - 1]}）\n- 没有轮次记录。\n` }
  const turns = parts.reduce((a, p) => a + p.turns, 0)
  const decisions = [...new Set(parts.flatMap((p) => p.decisions))].slice(0, 4)
  const topics = [...new Set(parts.flatMap((p) => p.topics))].slice(0, 5)
  const lines = [
    `## 一周（${list[0]} ~ ${list[list.length - 1]}，${parts.length} 天有记录 / ${turns} 轮）`,
    topics.length ? `- 主要：${topics.join('；')}` : '- 主要：没有记下',
    decisions.length ? `- 决定/改口：${decisions.join('；')}` : '- 决定/改口：没有',
    `- 有记录的天：${parts.map((p) => p.day.slice(5)).join('、')}`,
  ]
  return { ok: true, text: lines.join('\n') + '\n', days: parts.length, turns }
}

/** 写一份日/周摘要到 ~/.dsh/dayu/summaries/，返回路径。 */
export function writeSummary(day = new Date().toISOString().slice(0, 10)) {
  const ds = daySummary(day)
  const ws = weekSummary({ endDay: day })
  const dir = path.join(DATA, 'summaries')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `day-${day}.md`)
  fs.writeFileSync(file, ds.text + '\n' + ws.text, 'utf8')
  return { ok: true, file, day: ds, week: ws }
}
