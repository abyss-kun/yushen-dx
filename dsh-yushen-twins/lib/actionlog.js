// 动作记录：谁点了什么、请求到没到、成没成。只追加，不覆盖。
// 目的：下次“点了没反应”，先翻这里，不靠倒推。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'actions.jsonl')

export function recordAction(row = {}) {
  try {
    fs.mkdirSync(DATA, { recursive: true })
    const line = {
      at: new Date().toISOString(),
      kind: String(row.kind || 'api').slice(0, 40),
      path: String(row.path || '').slice(0, 160),
      method: String(row.method || '').slice(0, 10),
      status: Number(row.status) || 0,
      ms: Number(row.ms) || 0,
      ok: row.ok !== false,
      note: String(row.note || '').slice(0, 200),
    }
    fs.appendFileSync(FILE, JSON.stringify(line) + '\n', 'utf8')
    return line
  } catch { return null }
}

export function listActions(limit = 30) {
  try {
    const lines = fs.readFileSync(FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    return lines.slice(-Math.max(1, Math.min(200, limit))).reverse().map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
