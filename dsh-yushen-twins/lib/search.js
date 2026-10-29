// 鱼神 · Copyright (c) 2026 用户. All rights reserved.
// 检索层：工作区文件 + 历史会话（zstd 压缩的 jsonl），只读、限量。
// 给总台用：需要某一段时，去工作区和各个对话框里找回来。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SESSIONS = path.join(HOME, 'sessions')
const DATA = path.join(HOME, 'dayu')
const CONFIG = path.join(DATA, 'search.json')

const TEXT_EXT = new Set(['.md', '.txt', '.json', '.jsonl', '.js', '.mjs', '.cjs', '.ts', '.yml', '.yaml', '.css', '.html', '.log', '.py', '.ps1', '.bat'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'archive', 'dist', 'build', '.venv', '__pycache__', 'backups', 'tmp', '.tmp'])

function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
    return {
      roots: Array.isArray(raw.roots) ? raw.roots.filter((x) => typeof x === 'string') : [],
      sessionRoots: Array.isArray(raw.sessionRoots) ? raw.sessionRoots.filter((x) => typeof x === 'string') : [],
    }
  } catch {
    return { roots: [], sessionRoots: [] }
  }
}

function walkSessionRoot(root, out, depth = 0) {
  if (depth > 7) return
  let entries = []
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) { walkSessionRoot(full, out, depth + 1); continue }
    if (entry.name !== 'session.v4.jsonl.zstd') continue
    try {
      const st = fs.statSync(full)
      out.push({ file: full, id: path.basename(path.dirname(full)), mtime: st.mtimeMs, size: st.size })
    } catch { /* 跳过 */ }
  }
}

function sessionFiles(limit = 40) {
  const out = []
  let wsDirs = []
  try { wsDirs = fs.readdirSync(SESSIONS, { withFileTypes: true }).filter((d) => d.isDirectory()) } catch { return out }
  for (const ws of wsDirs) {
    let dirs = []
    try { dirs = fs.readdirSync(path.join(SESSIONS, ws.name), { withFileTypes: true }).filter((d) => d.isDirectory()) } catch { continue }
    for (const d of dirs) {
      const file = path.join(SESSIONS, ws.name, d.name, 'session.v4.jsonl.zstd')
      try {
        const st = fs.statSync(file)
        out.push({ file, id: d.name, mtime: st.mtimeMs, size: st.size })
      } catch { /* 没有就别算 */ }
    }
  }
  // 额外的会话仓库（老的备份、被收纳的会话目录）
  for (const root of readConfig().sessionRoots) walkSessionRoot(root, out)
  out.sort((a, b) => b.mtime - a.mtime)
  return out.slice(0, limit)
}

function decompress(file, maxBytes = 4 * 1024 * 1024) {
  const buf = fs.readFileSync(file)
  return zlib.zstdDecompressSync(buf, { maxOutputLength: maxBytes }).toString('utf8')
}

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const textCache = new Map()

/** 会话文件是很多个 zstd 帧拼起来的；逐帧解，解到上限为止。 */
function decompressFrames(buf, maxChars = 2 * 1024 * 1024) {
  const parts = []
  let total = 0
  let pos = 0
  while (pos < buf.length && total < maxChars) {
    const start = buf.indexOf(MAGIC, pos)
    if (start === -1) break
    const next = buf.indexOf(MAGIC, start + 4)
    const end = next === -1 ? buf.length : next
    try {
      const out = zlib.zstdDecompressSync(buf.subarray(start, end), { maxOutputLength: maxChars })
      parts.push(out)
      total += out.length
    } catch { /* 坏帧跳过 */ }
    pos = end
  }
  return Buffer.concat(parts).toString('utf8')
}

function sessionText(item) {
  const key = `${item.file}:${item.mtime}`
  const cached = textCache.get(key)
  if (cached) return cached
  let text = ''
  try { text = decompressFrames(fs.readFileSync(item.file)) } catch { text = '' }
  textCache.set(key, text)
  if (textCache.size > 12) {
    const oldest = textCache.keys().next().value
    textCache.delete(oldest)
  }
  return text
}

function firstLineInfo(text) {
  try {
    const line = text.split('\n', 1)[0]
    const meta = JSON.parse(line)
    return { cwd: String(meta.cwd ?? ''), id: String(meta.id ?? ''), at: Number(meta.createdAt ?? 0) }
  } catch {
    return {}
  }
}

/** 最近会话用过的 cwd，作为工作区搜索的默认根。 */
export function defaultRoots(limit = 12) {
  const cfg = readConfig()
  if (cfg.roots.length) return cfg.roots
  const roots = new Set()
  for (const item of sessionFiles(limit)) {
    try {
      const info = firstLineInfo(decompress(item.file, 256 * 1024))
      if (info.cwd) roots.add(info.cwd)
    } catch { /* 坏文件跳过 */ }
    if (roots.size >= 4) break
  }
  if (roots.size === 0) roots.add(process.cwd())
  return [...roots]
}

export function searchWorkspace(q, { roots = defaultRoots(), limit = 10 } = {}) {
  const needle = q.toLowerCase()
  const hits = []
  let scanned = 0
  const walk = (dir, depth) => {
    if (hits.length >= limit || scanned > 400 || depth > 4) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (hits.length >= limit || scanned > 400) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!TEXT_EXT.has(ext)) continue
      let st
      try { st = fs.statSync(full) } catch { continue }
      if (st.size > 256 * 1024) continue
      scanned += 1
      let text = ''
      try { text = fs.readFileSync(full, 'utf8') } catch { continue }
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].toLowerCase().includes(needle)) {
          hits.push({ kind: 'file', source: full, line: i + 1, text: lines[i].trim().slice(0, 240) })
          break
        }
      }
    }
  }
  for (const root of roots) {
    if (hits.length >= limit) break
    walk(root, 0)
  }
  return hits
}

function snippetOf(line) {
  try {
    const obj = JSON.parse(line)
    const content = obj?.data?.message?.content ?? obj?.data?.content ?? obj?.data?.inserted?.[0]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.filter((c) => c?.type === 'text').map((c) => c.text).join(' ')
    if (obj?.data?.title) return String(obj.data.title)
  } catch { /* 用原始行 */ }
  return line
}

function scoreLine(line) {
  if (/"type"\s*:\s*"user\/message"|"role"\s*:\s*"user"|"kind"\s*:\s*"user"/.test(line)) return 3
  if (/"type"\s*:\s*"assistant\/message"|"role"\s*:\s*"assistant"/.test(line)) return 2
  return 1
}

export function searchSessions(q, { limit = 10, files = 20, deep = false } = {}) {
  const needle = q.toLowerCase()
  const candidates = []
  // deep：扫全部会话（含 search.json 里配置的额外会话仓库），不只看最近几十条
  for (const item of sessionFiles(deep ? 2000 : files)) {
    if (!deep && candidates.length >= limit) break
    if (item.size > 6 * 1024 * 1024) continue
    const text = sessionText(item)
    if (!text) continue
    const info = firstLineInfo(text)
    const titleMatch = /"title"\s*:\s*"([^"]{1,80})"/.exec(text)
    let picked = ''
    let score = 0
    for (const line of text.split('\n')) {
      if (!line || !line.toLowerCase().includes(needle)) continue
      // 工作区说明/system-reminder 不算“那次对话”，跳过
      if (/system-reminder|Instructions from:|# 工作区共享资料入口|AGENTS\.md/.test(line)) continue
      picked = line
      score = scoreLine(line)
      break
    }
    if (!picked) continue
    candidates.push({
      kind: 'session',
      source: item.id,
      title: titleMatch ? titleMatch[1] : '',
      cwd: info.cwd || '',
      at: info.at || item.mtime,
      score,
      text: String(snippetOf(picked)).trim().slice(0, 240),
    })
  }
  // 深搜时先给「用户自己说过的话」，再按时间新到旧
  if (deep) candidates.sort((a, b) => (b.score - a.score) || (b.at - a.at))
  // 备份目录里同一个会话会出现多份，按会话 id 去重，只留第一条
  const seen = new Set()
  const unique = []
  for (const hit of candidates) {
    if (seen.has(hit.source)) continue
    seen.add(hit.source)
    unique.push(hit)
  }
  return unique.slice(0, limit)
}

export function searchAll(q, { limit = 10, deep = false } = {}) {
  if (!q || !q.trim()) return []
  if (deep) {
    // 深搜时先给会话，再补文件；文件至少留 2 条，档案类命中不会被挤没。
    const sessionLimit = Math.max(2, limit - 2)
    const sessions = searchSessions(q, { limit: sessionLimit, deep: true })
    const files = searchWorkspace(q, { limit: Math.max(2, limit - sessions.length) })
    return [...sessions, ...files].slice(0, limit)
  }
  const half = Math.max(1, Math.floor(limit / 2))
  return [...searchWorkspace(q, { limit: half }), ...searchSessions(q, { limit: half })].slice(0, limit)
}
