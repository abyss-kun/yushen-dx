// 纠结记录：两难时她自己说的话，原样留一份，供以后复盘。
// 只记本地文本；不调模型、不联网。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu', 'thoughts')
const MAX = 4000

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function recordThought({ role = '', text = '', sessionId = '', at = new Date().toISOString() } = {}) {
  const value = String(text || '').trim().slice(0, MAX)
  if (!value) return { ok: false, reason: '空内容' }
  const row = { at, role: String(role || ''), sessionId: String(sessionId || ''), text: value }
  fs.mkdirSync(DIR, { recursive: true })
  fs.appendFileSync(path.join(DIR, `${dayKey(new Date(at))}.jsonl`), `${JSON.stringify(row)}\n`)
  return { ok: true, row }
}

export function listThoughts({ role = '', date = '', limit = 20 } = {}) {
  const file = path.join(DIR, `${date || dayKey()}.jsonl`)
  let rows = []
  try {
    rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
  if (role) rows = rows.filter((r) => r.role === role)
  return rows.slice(-Math.max(1, Math.min(200, Number(limit) || 20)))
}
