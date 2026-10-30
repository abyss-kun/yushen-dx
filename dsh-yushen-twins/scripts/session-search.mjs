// 全量会话检索：不只搜最近 40 条，扫 ~/.dsh/sessions 下所有工作区、所有会话（含旧会话）。
// 用法：ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/session-search.mjs 修复助手
//      [--limit-files=2000] [--max-matches=20] [--since-days=0]
// 只读；不解压到磁盘，不写任何东西。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SESSIONS = path.join(HOME, 'sessions')
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

const argv = process.argv.slice(2)
const words = argv.filter((a) => !a.startsWith('--')).map((s) => s.trim()).filter(Boolean)
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.slice(name.length + 3)) : fallback
}
if (!words.length) {
  console.error('用法：session-search.mjs <关键词...> [--limit-files=2000] [--max-matches=20] [--since-days=0]')
  process.exit(2)
}
const limitFiles = flag('limit-files', 2000)
const maxMatches = flag('max-matches', 20)
const sinceDays = flag('since-days', 0)
const extras = argv.filter((a) => a.startsWith('--extra-root=')).map((a) => a.slice('--extra-root='.length))
const onlyExtra = argv.includes('--only-extra')
const roots = (onlyExtra ? [] : [SESSIONS]).concat(extras).filter((r) => { try { return fs.existsSync(r) } catch { return false } })

function decompressFrames(buf, maxChars = 3 * 1024 * 1024) {
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

function listFiles() {
  const out = []
  const walk = (dir, depth) => {
    if (depth > 7 || out.length >= limitFiles * 2) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { walk(full, depth + 1); continue }
      if (e.name !== 'session.v4.jsonl.zstd') continue
      try {
        const st = fs.statSync(full)
        if (sinceDays && st.mtimeMs < Date.now() - sinceDays * 86400000) continue
        out.push({ file: full, id: path.basename(path.dirname(full)), ws: path.basename(path.dirname(path.dirname(full))), mtime: st.mtimeMs, size: st.size })
      } catch { /* 跳过读不到的 */ }
    }
  }
  for (const root of roots) walk(root, 0)
  out.sort((a, b) => b.mtime - a.mtime)
  return out.slice(0, limitFiles)
}

const needles = words.map((w) => w.toLowerCase())
const files = listFiles()
const matches = []
let scanned = 0
for (const item of files) {
  scanned += 1
  let text = ''
  try { text = decompressFrames(fs.readFileSync(item.file)) } catch { continue }
  const lower = text.toLowerCase()
  if (!needles.every((n) => lower.includes(n))) continue
  const at = lower.indexOf(needles[0])
  const snippet = text.slice(Math.max(0, at - 80), at + 180).replace(/\s+/g, ' ')
  matches.push({
    id: item.id,
    workspace: item.ws,
    at: new Date(item.mtime).toLocaleString('zh-CN'),
    sizeKB: Math.round(item.size / 1024),
    snippet,
  })
  if (matches.length >= maxMatches) break
}

console.log(JSON.stringify({ ok: true, words, scanned, totalFiles: files.length, matches }, null, 2))
