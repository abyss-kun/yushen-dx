// 知情：软件里发生的事，她们默认知道一个摘要；细节自己去翻。
// 只读本地 journal；不联网、不调模型；有字数上限，避免把上下文撑爆。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { redact } from './redact.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu', 'journal')

function dayKey(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 最近发生的软件事件：默认最近 2 天、最多 8 条、700 字。 */
export function recentAwareness({ limit = 8, maxChars = 700, days = 2, now = new Date() } = {}) {
  const rows = readRows({ days, now })
  const picked = rows.slice(-Math.max(1, Math.min(50, limit)))
  const items = []
  let used = 0
  for (const row of picked.reverse()) {
    const t = String(row.at || '').slice(11, 16)
    const who = row.source || row.role || row.kind || ''
    const text = redact(String(row.text || '')).text.replace(/\s+/g, ' ').slice(0, 90)
    if (!text) continue
    const line = `- ${t}${who ? ` [${who}]` : ''} ${text}`
    if (used + line.length > maxChars) break
    items.push(line)
    used += line.length
  }
  return { items, text: items.join('\n'), count: rows.length }
}

function readRows({ days = 2, now = new Date() } = {}) {
  const files = []
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getTime() - i * 86400000)
    const f = path.join(DIR, `${dayKey(d)}.jsonl`)
    if (fs.existsSync(f)) files.push(f)
  }
  const rows = []
  for (const file of files.reverse()) {
    let lines = []
    try { lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean) } catch { continue }
    for (const line of lines.slice(-400)) {
      try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  }
  return rows
}

/** 神念的"指针"：不塞内容，只告诉她有多少、最近什么时候。看不看由她。 */
export function awarenessIndex({ days = 2, now = new Date() } = {}) {
  const rows = readRows({ days, now })
  const last = rows[rows.length - 1]
  return { count: rows.length, latestAt: last ? String(last.at || '') : '' }
}

/**
 * 她自己决定看多细：
 * - headline：只有时间/来源
 * - skim：时间/来源 + 一句摘要（默认）
 * - read：较完整正文（仍脱敏，截断）
 */
export function look({ depth = 'skim', limit = 10, q = '', days = 2, now = new Date(), maxChars = 3000 } = {}) {
  const needle = String(q || '').toLowerCase().trim()
  let rows = readRows({ days, now })
  if (needle) rows = rows.filter((row) => String(row.text || '').toLowerCase().includes(needle))
  rows = rows.slice(-Math.max(1, Math.min(100, Number(limit) || 10)))
  const lines = []
  let used = 0
  for (const row of rows.reverse()) {
    const t = String(row.at || '').replace('T', ' ').slice(0, 19)
    const who = row.source || row.role || row.kind || ''
    const raw = redact(String(row.text || '')).text.replace(/\s+/g, ' ')
    const body = depth === 'headline' ? '' : depth === 'read' ? raw.slice(0, 500) : raw.slice(0, 80)
    const line = `- ${t}${who ? ` [${who}]` : ''}${body ? ` ${body}` : ''}`
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length
  }
  return { depth, count: rows.length, text: lines.join('\n') }
}
