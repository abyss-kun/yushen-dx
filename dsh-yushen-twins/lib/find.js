// 统一本地查找：先账本/代码/文档/记忆，最后才是聊天记录。零模型、零联网。
// 目标是"知道是哪一个"：返回类型、标题、路径、时间、片段、分数，让人/她挑。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { workspace } from './paths.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SKIP = /[\\/](node_modules|\.git|dist|\.cache|protection[\\/]store|attachments)[\\/]/i
const TEXT = /\.(md|txt|json|jsonl|js|mjs|cjs|ts|yml|yaml|ps1|cmd|html|css)$/i

function roots() {
  return [
    { dir: path.resolve(HERE, '..'), label: '插件' },
    { dir: path.join(HOME, 'dayu'), label: '鱼神数据' },
    { dir: workspace(), label: '工作区' },
  ].filter((r) => { try { return fs.existsSync(r.dir) } catch { return false } })
}

function walk(dir, out, depth = 0) {
  if (depth > 6 || out.length > 4000) return
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (SKIP.test(full)) continue
    if (e.isDirectory()) { walk(full, out, depth + 1); continue }
    if (!TEXT.test(e.name)) continue
    try { if (fs.statSync(full).size > 2 * 1024 * 1024) continue } catch { continue }
    out.push(full)
  }
}

function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return ''
  const start = Math.max(0, i - 70)
  return text.slice(start, Math.min(text.length, i + q.length + 90)).replace(/\s+/g, ' ')
}

/** 文件 + 账本 + 记忆 + 可选聊天记录。聊天默认不扫。 */
export function findAnything(q, { limit = 12, sessions = null, deepSessions = false } = {}) {
  const needle = String(q || '').trim()
  if (!needle) return { ok: true, q: '', items: [] }
  const lower = needle.toLowerCase()
  const items = []
  const files = []
  for (const r of roots()) walk(r.dir, files)
  for (const file of files) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    if (!text.toLowerCase().includes(lower)) continue
    const rel = file.replace(/\\/g, '/')
    const hits = (text.toLowerCase().split(lower).length - 1)
    const nameHit = path.basename(file).toLowerCase().includes(lower) ? 8 : 0
    const ledger = /(residence|awakening|characters|ranks|freetime|growth|owners?)\.json$/i.test(file) ? 20 : 0
    items.push({
      kind: ledger ? 'ledger' : 'file',
      title: path.basename(file),
      path: rel,
      snippet: snippet(text, needle).slice(0, 180),
      score: nameHit + ledger + Math.min(hits, 6),
      at: (() => { try { return fs.statSync(file).mtime.toISOString() } catch { return '' } })(),
    })
  }
  // 聊天记录：只在显式要的时候扫，且优先级最低
  if (sessions && deepSessions) {
    try {
      for (const row of sessions) {
        items.push({ kind: 'session', title: row.title || '(会话)', path: row.id, snippet: String(row.snippet || '').slice(0, 180), score: 1, at: row.at || '' })
      }
    } catch { /* 忽略 */ }
  }
  items.sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)))
  return { ok: true, q: needle, items: items.slice(0, Math.max(1, Math.min(50, limit))), scanned: files.length, deepSessions: Boolean(deepSessions) }
}
