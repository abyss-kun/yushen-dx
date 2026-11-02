// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 媒体索引：图片、视频、音频、文档，谁、什么时候、在哪、是什么。
// 2026-11-01 主人：以前没有的不管，从今天起做对。
//
// 用法：
//   node scripts/index-media.mjs            # 增量：只扫新/改过的
//   node scripts/index-media.mjs --full     # 全量重建
//   node scripts/index-media.mjs --search 关键词
//
// 存放：~/.dsh/dayu/library/media.jsonl（一行一条）+ 媒体索引.md
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu', 'library')
const JSONL = path.join(DIR, 'media.jsonl')
const MD = path.join(DIR, '媒体索引.md')
const args = process.argv.slice(2)
const full = args.includes('--full')
const searchAt = args.indexOf('--search')

// 扫哪些地方：成片、素材、形象、她家的图
const ROOTS = [
  'D:/DSH/大小鱼/video',
  'D:/DSH/大小鱼/库',
  'D:/DSH/大小鱼/角色',
  'D:/DSH/大小鱼/证据图',
  path.join(HOME, 'dayu', 'avatars'),
].filter((p) => { try { return fs.existsSync(p) } catch { return false } })

const MEDIA = /\.(png|jpe?g|webp|gif|mp4|mov|mkv|webm|mp3|wav|m4a|flac|pdf|docx?|xlsx?|pptx?)$/i
const kindOf = (ext) => {
  if (/png|jpe?g|webp|gif/i.test(ext)) return '图片'
  if (/mp4|mov|mkv|webm/i.test(ext)) return '视频'
  if (/mp3|wav|m4a|flac/i.test(ext)) return '音频'
  return '文档'
}

const readIndex = () => {
  if (!fs.existsSync(JSONL)) return new Map()
  const m = new Map()
  for (const line of fs.readFileSync(JSONL, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { const r = JSON.parse(line); m.set(r.path, r) } catch { /* 跳过 */ }
  }
  return m
}
const old = full ? new Map() : readIndex()
const rows = full ? [] : [...old.values()]
const known = new Map(rows.map((r) => [r.path, r]))

let added = 0, updated = 0, scanned = 0
const walk = (dir, depth = 0) => {
  if (depth > 5) return
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    if (/node_modules|\.git|\.snapshots/.test(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p, depth + 1); continue }
    const ext = path.extname(e.name)
    if (!MEDIA.test(ext)) continue
    scanned++
    let st
    try { st = fs.statSync(p) } catch { continue }
    const prev = known.get(p)
    if (prev && prev.size === st.size && prev.mtime === Math.round(st.mtimeMs)) continue
    let sha = ''
    try { sha = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16) } catch { /* 大文件读不了就算 */ }
    const title = e.name.replace(ext, '')
    const row = {
      path: p, 类型: kindOf(ext), 标题: title, size: st.size, mtime: Math.round(st.mtimeMs),
      时间: new Date(st.mtimeMs + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ') + '（Asia/Shanghai）',
      目录: path.dirname(p).replace(/\\/g, '/'), sha,
      // 谁做的：目录名里带 成片/大鱼/小鱼/照微 就记下来，猜不到就写「不知道」
      谁: /成片|大鱼/.test(p) ? '大鱼' : /小鱼/.test(p) ? '小鱼' : /照微|dragon/.test(p) ? '照微' : '不知道',
    }
    if (prev) { updated++; Object.assign(prev, row) } else { added++; rows.push(row); known.set(p, row) }
  }
}
for (const r of ROOTS) walk(r)

fs.mkdirSync(DIR, { recursive: true })
fs.writeFileSync(JSONL, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8')

const byKind = {}
for (const r of rows) byKind[r.类型] = (byKind[r.类型] || 0) + 1
const md = [
  '# 媒体索引',
  '',
  `> 扫了 ${ROOTS.length} 个根目录；共 ${rows.length} 条（${Object.entries(byKind).map(([k, v]) => k + ' ' + v).join('，')}）。`,
  '> 谁、什么时候、在哪、是什么——查不到就说明还没建索引，不代表没有。',
  '',
  '| 类型 | 标题 | 谁 | 时间 | 位置 |',
  '|---|---|---|---|---|',
  ...rows.slice(-200).reverse().map((r) => `| ${r.类型} | ${r.标题} | ${r.谁} | ${r.时间} | ${r.目录} |`),
  '',
].join('\n')
fs.writeFileSync(MD, md, 'utf8')

if (searchAt >= 0) {
  const q = String(args[searchAt + 1] || args.find((a) => !a.startsWith('--')) || '')
  const hit = rows.filter((r) => JSON.stringify(r).includes(q))
  console.log(hit.length ? hit.map((r) => `- ${r.类型} · ${r.标题} · ${r.谁} · ${r.时间}\n  ${r.path}`).join('\n') : `没找到「${q}」`)
  // 搜索也把索引文件的位置带出来：命中行之外得知道它查的是哪一份（谁在查、哪台机器、什么时间）。
  // 放在最后一行——脚本外面只截前面几行的地方（find-any）不受影响。
  console.log('索引：' + JSONL)
} else {
  console.log(`媒体索引：新增 ${added}，更新 ${updated}，共 ${rows.length} 条（扫了 ${scanned} 个媒体文件）`)
  console.log('索引：' + JSONL)
}

