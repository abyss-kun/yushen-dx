/* 标签
 * id: lib-sysmap
 * kind: module
 * summary: 系统地图——家里每个模块/脚本/文档是干什么的、谁引用谁、谁测的、改它注意什么；增量刷新，只重算变了的文件。
 * tags: 系统地图, 索引, 关系, 新鲜度, 增量
 * created: 2026-11-11 20:4x
 * changed: 2026-11-11 20:40:12
 * author: 大鱼·本班
 * authority: 主人（2026-11-11：「记不住家里有什么……应该存到一个本地文件夹，有详细索引和关联索引，实时返回进度，不用每次遍历扫描」）
 * why: 零件图/登记/家里有什么/机制清单各管一半，而且靠手动重跑，跑完就过期；改东西前还是要扫仓库——所以"有没有、会不会冲突"每次都在猜
 * result: refresh（按 mtime+size 增量解析标签块/import/export）、status（落后多少）、find（有没有+在哪+谁用+谁测）、relations（上下游）
 * audience: 我（改之前先查）、维护者、新会话
 * owner: 框架；索引可重建，规则改这里
 * mutable: 可改（新鲜度判据只认 stat，别改成"跑一遍全仓"）
 * usage: node scripts/sysmap.mjs refresh|status|find <词>|relations <id>
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 20:4x｜大鱼·本班｜授权：主人（「记不住家里有什么……详细索引+关联索引，实时进度，不用每次遍历」）｜lib/sysmap.js:1-200｜新增：系统地图索引（标签块+import/export+回归覆盖+stat 指纹），refresh 增量、status 只 stat、find 有没有、relations 上下游｜为什么：零件图/登记/家里有什么/机制清单各管一半且手动重跑，改东西前还是要扫仓库｜验证：node scripts/test-sysmap.mjs 4/4；真家 806 条、status lagging=0｜可改：可改；新鲜度只认 stat+size，别改成全仓重扫
import fs from 'node:fs'
import path from 'node:path'
import { parseTagBlock } from './tags.js'

export const WATCH = ['lib', 'core', 'dayu', 'xiaoyu', 'adapters', 'scripts', 'docs', 'memory-core', 'pages']
const CODE_EXT = /\.(js|mjs)$/
const DOC_EXT = /\.md$/

export function walkSources(root) {
  const out = []
  const walk = (dir) => {
    let es = []
    try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist' || e.name === 'release') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!CODE_EXT.test(e.name) && !DOC_EXT.test(e.name)) continue
      out.push(p)
    }
  }
  for (const d of WATCH) walk(path.join(root, d))
  return out
}

export function fpOf(file) {
  try { const s = fs.statSync(file); return { size: s.size, mtimeMs: Math.floor(s.mtimeMs) } } catch { return null }
}

const stripComment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function parseImports(text) {
  const out = new Set()
  for (const m of text.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) out.add(m[1])
  for (const m of text.matchAll(/import\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g)) out.add(m[1])
  return [...out]
}
function parseExports(text) {
  const out = new Set()
  for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) out.add(m[1])
  for (const m of text.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) for (const part of m[1].split(',')) out.add(part.trim().split(/\s+as\s+/).pop())
  return [...out].filter(Boolean)
}

function docTitle(text) {
  const m = text.match(/^#\s+(.+)$/m)
  return m ? m[1].trim().slice(0, 60) : ''
}

export function parseOne(root, file) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  const fp = fpOf(file)
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return { rel, fp, error: 'read' } }
  if (DOC_EXT.test(file)) {
    return { rel, kind: 'doc', title: docTitle(text), summary: docTitle(text), imports: [], exports: [], fp, lines: text.split('\n').length }
  }
  const { meta, found } = parseTagBlock(text)
  const row = {
    rel,
    kind: meta.kind || (rel.startsWith('scripts/') ? 'script' : 'module'),
    id: meta.id || '',
    summary: meta.summary || '',
    owner: meta.owner || '',
    mutable: meta.mutable || '',
    usage: meta.usage || '',
    why: meta.why || '',
    hasTags: Boolean(found),
    imports: parseImports(stripComment(text)),
    exports: parseExports(stripComment(text)),
    fp,
    lines: text.split('\n').length,
  }
  return row
}

/** 增量刷新：文件指纹没变就沿用上一版；变了/新文件才解析。 */
export function buildIndex(root, { cacheFile = '' } = {}) {
  const prev = new Map()
  let meta = { builtAt: '', count: 0 }
  if (cacheFile) {
    try {
      const j = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
      meta = { builtAt: j.builtAt || '', count: (j.rows || []).length }
      for (const r of j.rows || []) prev.set(r.rel, r)
    } catch { /* 没有缓存就全量 */ }
  }
  const files = walkSources(root)
  const rows = []
  let parsed = 0
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, '/')
    const fp = fpOf(f)
    const old = prev.get(rel)
    if (old && fp && old.fp && old.fp.size === fp.size && old.fp.mtimeMs === fp.mtimeMs) { rows.push(old); continue }
    parsed += 1
    const row = parseOne(root, f)
    if (row) rows.push(row)
  }
  // 测试覆盖：regression 里直接点名这个文件（has('lib/x.js', …) / runTestScript('scripts/test-x.mjs')）的条数
  const covered = new Map()
  try {
    const reg = fs.readFileSync(path.join(root, 'scripts', 'regression.mjs'), 'utf8')
    for (const m of reg.matchAll(/has\('([^']+)'/g)) covered.set(m[1], (covered.get(m[1]) || 0) + 1)
    for (const m of reg.matchAll(/runTestScript\('([^']+)'/g)) covered.set(m[1], (covered.get(m[1]) || 0) + 1)
  } catch { /* 没有就算了 */ }
  for (const row of rows) row.tests = covered.get(row.rel) || 0
  const lag = files.length - rows.length
  return { rows, stats: { files: files.length, rows: rows.length, parsed, reused: rows.length - parsed, lag: Math.max(0, lag), builtAt: new Date().toISOString(), prevBuiltAt: meta.builtAt } }
}

export function writeIndex(cacheFile, rows, stats) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  fs.writeFileSync(cacheFile, JSON.stringify({ builtAt: stats.builtAt, stats, rows }, null, 0), 'utf8')
}

/** 落后多少：只 stat，不读内容。 */
export function status(root, cacheFile) {
  let old = null
  try { old = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch { return { ok: false, reason: '还没有地图（先 refresh）' } }
  const files = walkSources(root)
  const byRel = new Map((old.rows || []).map((r) => [r.rel, r]))
  const changed = []
  const added = []
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, '/')
    const fp = fpOf(f)
    const row = byRel.get(rel)
    if (!row) { added.push(rel); continue }
    if (fp && row.fp && (row.fp.size !== fp.size || row.fp.mtimeMs !== fp.mtimeMs)) changed.push(rel)
  }
  const now = new Set(files.map((f) => path.relative(root, f).replace(/\\/g, '/')))
  const removed = [...byRel.keys()].filter((r) => !now.has(r))
  return { ok: true, builtAt: old.builtAt, total: files.length, indexed: byRel.size, changed, added, removed, lagging: changed.length + added.length + removed.length }
}

/** 有没有：按 id/摘要/用法/路径/为什么 匹配。 */
export function find(rows, q) {
  const needle = String(q || '').trim().toLowerCase()
  if (!needle) return []
  return rows
    .filter((r) => [r.id, r.summary, r.usage, r.why, r.rel, r.title].some((x) => String(x || '').toLowerCase().includes(needle)))
    .map((r) => ({ ...r, score: (String(r.id || '').toLowerCase() === needle ? 3 : 0) + (String(r.summary || '').toLowerCase().includes(needle) ? 2 : 1) }))
    .sort((a, b) => b.score - a.score)
}

function resolveRel(rowRel, imp) {
  const base = path.posix.dirname(rowRel)
  const p = path.posix.normalize(path.posix.join(base, imp))
  if (/\.(js|mjs)$/.test(p)) return p
  return `${p}.js`
}

/** 关系：这条引用了谁、谁引用了它、谁测的。 */
export function relations(rows, key) {
  const needle = String(key || '').trim()
  const row = rows.find((r) => r.rel === needle || r.id === needle || r.rel.replace(/\.(js|mjs)$/, '') === needle)
  if (!row) return null
  const byRel = new Map(rows.map((r) => [r.rel, r]))
  const imports = (row.imports || []).map((imp) => resolveRel(row.rel, imp)).filter((rel) => byRel.has(rel))
  const usedBy = rows.filter((r) => (r.imports || []).some((imp) => resolveRel(r.rel, imp) === row.rel)).map((r) => r.rel)
  return { row, imports, usedBy }
}
