// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 倒排索引（2026-11-02）：把 live 原文与冷档切成「行级文档」，建成 token → 行号。
//
// 目的：不增加任何 LLM 调用，只把「该翻哪几行」缩到索引里——检索更准、更快。
// 原则：**它是加速器，不是开关**。索引不存在/坏了，recall-now.js 自动退回原来的逐文件扫描。
//
// 落盘：~/.dsh/dayu/runtime/倒排.json
//   {builtAt, docs:[{src:"live|冷档", file, line, text, ...}], index:{token:[docId,...]}, files:{...}}
// 增量：files 里记每个文件的 mtime+size；没变就复用旧 doc，变了才重建这个文件的行。
// 截断：索引 JSON > 50MB 时，live 只留最近 60 天，冷档（记忆）全量保留，并在输出里说明。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const STOP = new Set(['什么', '怎么', '为什', '那个', '这个', '我们', '你们', '他们', '一个', '就是', '不是', '可以', '现在', '上次', '那次', '之前', '还是', '没有'])

// 2026-11-02：二元组里混进「你还」「还记」这种没意义的碎片，结果被拖偏。
// 含虚词字的二元组一律不要，只留名词性的片段。
const WEAK = /[你我他她它的了吗呢吧啊是在有这那个上次就都也还怎什哪谁记]/

export const MAX_BYTES = 50 * 1024 * 1024
export const RECENT_DAYS = 60
export const INDEX_NAME = '倒排.json'

// 冷档目录里这两份是「索引/账本」，不是事件；扫进去只会把检索拖偏。
const SKIP_COLD_FILES = new Set(['索引.jsonl', '未接原文.jsonl'])

export function homeDir() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function indexPath(home) {
  return path.join(home || homeDir(), 'dayu', 'runtime', INDEX_NAME)
}

/** token 规则（和 recall-now 的 keywords() 同源）：ASCII 词转小写 + 中文二元组，去虚词与停止词。 */
export function tokenize(text) {
  const s = String(text || '')
  const ascii = (s.match(/[A-Za-z0-9_]{2,}/g) || []).map((x) => x.toLowerCase())
  const cn = []
  const han = s.replace(/[^\u4e00-\u9fa5]/g, '')
  for (let i = 0; i < han.length - 1; i++) {
    const g = han.slice(i, i + 2)
    if (!STOP.has(g) && !WEAK.test(g)) cn.push(g)
  }
  return [...new Set([...ascii, ...cn])]
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

function normHome(home) {
  return path.resolve(String(home || homeDir()))
}

function relOf(home, abs) {
  return path.relative(home, abs).split(path.sep).join('/')
}

/** live 下所有 .md（递归）。 */
function listLive(home) {
  const root = path.join(home, 'dayu', 'live')
  const out = []
  const walk = (dir) => {
    let rows = []
    try { rows = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of rows) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) out.push({ abs: p, src: 'live', role: '' })
    }
  }
  walk(root)
  return out
}

/** 冷档：runtime/记忆冷档/*.jsonl + runtime/<role>/记忆冷档/*.jsonl（旧位置和新位置都认）。 */
function listCold(home) {
  const runtime = path.join(home, 'dayu', 'runtime')
  const dirs = []
  const flat = path.join(runtime, '记忆冷档')
  if (fs.existsSync(flat)) dirs.push({ dir: flat, role: '' })
  let rows = []
  try { rows = fs.readdirSync(runtime, { withFileTypes: true }) } catch { rows = [] }
  for (const e of rows) {
    if (!e.isDirectory()) continue
    const d = path.join(runtime, e.name, '记忆冷档')
    if (fs.existsSync(d) && path.resolve(d) !== path.resolve(flat)) dirs.push({ dir: d, role: e.name })
  }
  const out = []
  for (const { dir, role } of dirs) {
    let files = []
    try { files = fs.readdirSync(dir) } catch { continue }
    for (const f of files) {
      if (!f.endsWith('.jsonl') || SKIP_COLD_FILES.has(f)) continue
      out.push({ abs: path.join(dir, f), src: '冷档', role })
    }
  }
  return out
}

/** 一个文件 → 行级 doc。live 一行一条；冷档一行一条事件（解析不出 text 就用整行原文）。 */
function docsOfFile(home, f) {
  let text = ''
  try { text = fs.readFileSync(f.abs, 'utf8').replace(/^\uFEFF/, '') } catch { return [] }
  const lines = text.split(/\r?\n/)
  const rel = relOf(home, f.abs)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (!trimmed) continue
    const doc = { src: f.src, file: rel, line: i + 1, text: f.src === 'live' ? raw : trimmed }
    if (f.src === '冷档') {
      let ev = null
      try { ev = JSON.parse(trimmed) } catch { ev = null }
      if (ev && typeof ev === 'object') {
        doc.text = typeof ev.text === 'string' ? ev.text : (typeof ev.head === 'string' ? ev.head : trimmed)
        doc.role = String(ev.role || f.role || path.basename(rel, '.jsonl'))
        if (ev.at) doc.at = String(ev.at)
        if (ev.id) doc.id = String(ev.id)
        if (ev.validUntil) doc.validUntil = String(ev.validUntil)
      } else {
        doc.role = f.role
      }
    }
    if (!doc.text || !doc.text.trim()) continue
    // 一个 token 都没有的行，索引里也搜不到，不必存
    if (!tokenize(doc.text).length) continue
    out.push(doc)
  }
  return out
}

function buildMap(docs) {
  const index = Object.create(null)
  for (let id = 0; id < docs.length; id += 1) {
    for (const t of tokenize(docs[id].text)) {
      if (!index[t]) index[t] = []
      // 同一行重复 token 只记一次（tokenize 已去重，这里防坏数据）
      if (index[t][index[t].length - 1] !== id) index[t].push(id)
    }
  }
  return index
}

function bytesOf(payload) {
  try { return Buffer.byteLength(JSON.stringify(payload), 'utf8') } catch { return Infinity }
}

/**
 * 增量重建。返回 {ok, docs, tokens, ms, bytes, reused, rebuilt, truncated, file}。
 * 不抛错：读不了的文件跳过（坏一个文件不拖垮整份索引）。
 */
export function buildIndex({ home = '', force = false, now = Date.now() } = {}) {
  const started = Date.now()
  const H = normHome(home)
  const target = indexPath(H)
  const old = force ? null : readJson(target)
  const oldFiles = old && old.files && typeof old.files === 'object' ? old.files : {}
  const oldByFile = new Map()
  for (const d of (Array.isArray(old?.docs) ? old.docs : [])) {
    if (!d || typeof d.file !== 'string') continue
    if (!oldByFile.has(d.file)) oldByFile.set(d.file, [])
    oldByFile.get(d.file).push(d)
  }

  const entries = [...listLive(H), ...listCold(H)]
  const docs = []
  const files = {}
  let reused = 0
  let rebuilt = 0
  const list = entries
    .map((f) => {
      let st = null
      try { st = fs.statSync(f.abs) } catch { st = null }
      return st ? { ...f, mtimeMs: st.mtimeMs, size: st.size } : null
    })
    .filter(Boolean)
    .sort((a, b) => relOf(H, a.abs).localeCompare(relOf(H, b.abs)))

  for (const f of list) {
    const rel = relOf(H, f.abs)
    files[rel] = { mtimeMs: f.mtimeMs, size: f.size, src: f.src }
    const prev = oldFiles[rel]
    const canReuse = !force && prev && Number(prev.mtimeMs) === f.mtimeMs && Number(prev.size) === f.size && oldByFile.has(rel)
    if (canReuse) {
      for (const d of oldByFile.get(rel)) docs.push(d)
      reused += 1
      continue
    }
    rebuilt += 1
    for (const d of docsOfFile(H, f)) docs.push(d)
  }

  const payload = {
    version: 1,
    builtAt: new Date().toISOString(),
    home: H,
    docs,
    index: buildMap(docs),
    files,
  }

  let truncated = null
  let bytes = bytesOf(payload)
  if (bytes > MAX_BYTES) {
    const cutoff = now - RECENT_DAYS * 86400e3
    const before = payload.docs.length
    payload.docs = payload.docs.filter((d) => {
      if (d.src !== 'live') return true                       // 冷档 = 记忆，全量保留
      const m = Number(payload.files[d.file]?.mtimeMs || 0)
      return m >= cutoff                                      // live 只留最近 60 天
    })
    payload.index = buildMap(payload.docs)
    payload.truncated = {
      at: new Date().toISOString(),
      reason: `索引超过 50MB：live 只留最近 ${RECENT_DAYS} 天，冷档（记忆）全量保留`,
      droppedDocs: before - payload.docs.length,
      keptLiveDays: RECENT_DAYS,
    }
    truncated = payload.truncated
    bytes = bytesOf(payload)
  }

  const raw = JSON.stringify(payload)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.${Math.random().toString(16).slice(2, 8)}.tmp`
  try {
    fs.writeFileSync(tmp, raw, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(tmp, target)
  } finally {
    try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }) } catch { /* 清不掉也不影响结果 */ }
  }

  return {
    ok: true,
    file: target,
    docs: payload.docs.length,
    tokens: Object.keys(payload.index).length,
    bytes,
    ms: Date.now() - started,
    reused,
    rebuilt,
    files: Object.keys(payload.files).length,
    truncated,
    oversize: bytes > MAX_BYTES,
  }
}

/** 读索引；不存在/坏/空 → null（调用方退回旧扫描，不报错）。 */
export function loadIndex(home = '') {
  const j = readJson(indexPath(normHome(home)))
  if (!j || !Array.isArray(j.docs) || !j.docs.length || !j.index || typeof j.index !== 'object') return null
  return j
}

/** 查索引：返回 Map<docId, 命中的 token 数>（行号 = docs 下标）。 */
export function searchIndex(index, tokens = []) {
  const out = new Map()
  if (!index || !index.index) return out
  for (const t of tokens) {
    const ids = index.index[t]
    if (!Array.isArray(ids)) continue
    for (const id of ids) out.set(id, (out.get(id) || 0) + 1)
  }
  return out
}
