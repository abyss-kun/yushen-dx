// 工作记录：我（开发侧）每动一步，都要落到鱼神的账上，能被小鱼搜到。
// 数据：~/.dsh/dayu/worklog.jsonl

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'worklog.jsonl')

export function recordWork({ what, files = [], evidence = '', kind = 'change', note = '', tq = '' } = {}) {
  const text = String(what || '').trim()
  if (!text) throw new Error('what 不能为空（这次改了什么）')
  const list = Array.isArray(files) ? files.map((f) => String(f).slice(0, 160)).slice(0, 20) : []
  const row = { at: new Date().toISOString(), kind: String(kind).slice(0, 20), what: text.slice(0, 400), files: list, evidence: String(evidence || '').slice(0, 300), note: String(note || '').slice(0, 300), tq: String(tq || '').slice(0, 600) }
  fs.mkdirSync(DATA, { recursive: true })
  fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8')
  return row
}

export function listWork(limit = 30) {
  try {
    const lines = fs.readFileSync(FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    return lines.slice(-Math.max(1, Math.min(200, limit))).reverse().map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

export function searchWork(q, limit = 20) {
  const text = String(q || '').trim().toLowerCase()
  if (!text) return []
  return listWork(500).filter((w) => [w.what, w.evidence, w.note, ...(w.files || [])].join(' ').toLowerCase().includes(text)).slice(0, limit)
}
