/* 标签
 * id: library-lookup
 * kind: module
 * tags: 图书馆, 查重, 加机制前先查, 检索
 * created: 2026-11-04 17:55:00
 * changed: 2026-11-04 17:39:04
 * author: 照微·工作台
 * authority: 老板（2026-11-04：以后加什么机制、改什么机制，先查图书馆看看存不存在）
 * why: 不查就加，最容易造出第二个同名东西——最后两个都在长，谁也不知道哪个算数
 * result: 一条命令查六处（书目/文档/代码/导出/回归断言/机制清单），直接告诉你"已有/相近/没有"
 * mutable: 可改
 */
// 用法：node scripts/library-lookup.mjs <关键词> [--json] [--limit 15]
// 查六处：
//   ① 总书目（标题、小区、书位路径）——"这书在不在架上"
//   ② 框架文档 docs/*.md（文件名 + 正文标题）
//   ③ 代码（lib/ core/ dayu/ scripts/ 的文件名与导出名）
//   ④ 回归断言（regression.mjs 里的 ok('...') 标题）——机制是不是已经有条断言盯着
//   ⑤ 机制清单（机制名）
//   ⑥ 图书馆目录（区/小区名）
// 输出结论：已有（命中 ≥2 处）/ 相近（1 处）/ 没有。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const json = args.includes('--json')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? Math.max(1, Number(args[limitIdx + 1]) || 15) : 15
const q = args.filter((a) => !a.startsWith('--') && a !== String(limit))[0] || ''
if (!q) {
  console.error('用法：node scripts/library-lookup.mjs <关键词>')
  process.exit(2)
}

const { hardTimeout } = await import(pathToFileURL(path.join(ROOT, 'lib', 'offline-guard.js')).href)
hardTimeout(5, 'library-lookup.mjs')

const needle = q.toLowerCase()
const hits = { catalog: [], docs: [], code: [], checks: [], mechanism: [], zones: [], aliases: [] }

// 2026-11-04 优化：查重不能只靠"逐字包含"——你说"快照"，库里写的是"备份"，就查不到。
// 所以先做两件事：① 用别名表把词扩开（lib/aliases.json）② 词扩开后仍然走同样的六处。
const expand = []
try {
  const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'aliases.json'), 'utf8'))
  for (const [key, list] of Object.entries(aliases)) {
    if (key.startsWith('_') || !Array.isArray(list)) continue
    const group = [key, ...list]
    if (group.some((w) => String(w).toLowerCase().includes(needle))) {
      hits.aliases.push(`${key}：${group.join('/')}`)
      expand.push(...group)
    }
  }
} catch { /* 没有别名表 */ }
const terms = [...new Set([q, ...expand])].slice(0, 6)

// ① 总书目（原词 + 别名）
try {
  const rows = fs.readFileSync(path.join(D, 'catalog', '总书目.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  for (const r of rows) {
    const hay = `${r.title} ${r.where} ${(r.keys || []).join(' ')} ${r.intro}`.toLowerCase()
    if (terms.some((t) => hay.includes(String(t).toLowerCase()))) hits.catalog.push({ id: r.id, cls: r.cls, title: r.title, where: r.where, zone: r.zone })
    if (hits.catalog.length >= limit) break
  }
} catch { /* 没有书目 */ }

// ② 文档
try {
  for (const name of fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md'))) {
    const file = path.join(ROOT, 'docs', name)
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    const head = (text.match(/^#\s+(.+)$/m) || [])[1] || ''
    if (terms.some((x) => (name + head).toLowerCase().includes(String(x).toLowerCase()))) hits.docs.push({ file: `docs/${name}`, title: head })
    if (hits.docs.length >= limit) break
  }
} catch { /* 没有 docs */ }

// ③ 代码（文件名 + 导出名）
try {
  for (const dir of ['lib', 'core', 'scripts', 'dayu']) {
    const full = path.join(ROOT, dir)
    if (!fs.existsSync(full)) continue
    for (const name of fs.readdirSync(full)) {
      if (!/\.(js|mjs)$/.test(name)) continue
      if (name.toLowerCase().includes(needle)) { hits.code.push({ file: `${dir}/${name}`, why: '文件名命中' }); continue }
      if (hits.code.length >= limit) break
      let text = ''
      try { text = fs.readFileSync(path.join(full, name), 'utf8') } catch { continue }
      // 中文词没有 ascii 形式：不许拿空正则去匹配导出名，否则"任何导出"都会被算成命中（查"量子纠缠"也报"已有"）
      const asciiKey = needle.replace(/[^a-z0-9_]/gi, '')
      const m = asciiKey ? text.match(new RegExp(`export\\s+(?:async\\s+)?function\\s+([A-Za-z0-9_]*${asciiKey}[A-Za-z0-9_]*)`, 'i')) : null
      if (m) hits.code.push({ file: `${dir}/${name}`, why: `导出 ${m[1]}` })
      if (hits.code.length >= limit) break
    }
  }
} catch { /* 查不了代码 */ }

// ④ 回归断言标题
try {
  const reg = fs.readFileSync(path.join(ROOT, 'scripts', 'regression.mjs'), 'utf8')
  for (const m of reg.matchAll(/ok\('([^']+)'/g)) {
    if (terms.some((x) => m[1].toLowerCase().includes(String(x).toLowerCase()))) hits.checks.push(m[1])
    if (hits.checks.length >= limit) break
  }
} catch { /* 没回归 */ }

// ⑤ 机制清单
try {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', '机制清单.md'), 'utf8')
  for (const line of doc.split('\n')) {
    if (line.startsWith('|') && terms.some((x) => line.toLowerCase().includes(String(x).toLowerCase()))) hits.mechanism.push(line.split('|')[1].trim())
  }
} catch { /* 没清单 */ }

// ⑥ 目录里的区/小区名
try {
  const dirs = fs.readdirSync(path.join(D, 'catalog', '区')).filter((f) => f.endsWith('.md'))
  for (const f of dirs) {
    const text = fs.readFileSync(path.join(D, 'catalog', '区', f), 'utf8')
    if (terms.some((x) => text.toLowerCase().includes(String(x).toLowerCase()))) hits.zones.push(f.replace(/\.md$/, ''))
  }
} catch { /* 没区目录 */ }

const total = Object.values(hits).reduce((s, a) => s + a.length, 0)
// 2026-11-04 优化：目录/文档/代码都没命中时，别直接说"没有"——再翻一次倒排索引（全屋正文），
// 给"最接近的内容出处"。这样查重只需要一个入口：书目 → 别名 → 正文索引。
let deep = []
if (total === 0) {
  try {
    const idxFile = path.join(D, 'runtime', '倒排.json')
    if (fs.existsSync(idxFile)) {
      const { tokenize, searchIndex } = await import(pathToFileURL(path.join(ROOT, 'lib', 'inverted.js')).href)
      const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'))
      const toks = tokenize(q).slice(0, 8)
      const scored = [...searchIndex(idx, toks).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      deep = scored.map(([id, n]) => {
        const d = (idx.docs || [])[id] || {}
        return { file: d.file || '?', line: d.line || 0, text: String(d.text || '').slice(0, 80), hits: n }
      })
    }
  } catch { /* 没索引或读不动就不深搜 */ }
}
const verdict = (total + deep.length) >= 2 ? '已有（先去看它，别再造一个）' : (total + deep.length) === 1 ? '相近（说清和它什么关系）' : '没有（可以动手，记得在机制清单加一行）'

if (json) {
  console.log(JSON.stringify({ q, terms, verdict, total, hits }, null, 2))
  process.exit(0)
}

const ZONE_NAMES = { A: '身份/本体', B: '记忆', C: '经验/错题', D: '知识', E: '工作/操作', F: '原文/记录', G: '媒体', H: '日记', I: '框架文档', J: '改动与行动', X: '已剔' }
// 2026-11-04 优化：命中之后直接告诉你"去哪个区"——省一次翻总目。
const zoneHint = [...new Set(hits.catalog.map((c) => c.cls))].filter(Boolean)
console.log(`查「${q}」：${verdict}`)
if (terms.length > 1) console.log(`（别名扩开：${terms.slice(1).join('、')}）`)
if (zoneHint.length) {
  console.log(`去这几区找：${zoneHint.map((c) => `${c} ${ZONE_NAMES[c] || ''}（catalog/区/${c}-${String(ZONE_NAMES[c] || '').replace(/[\\/]/g, '-')}.md）`).join('；')}`)
}
const show = args.includes('--more') ? 8 : 3
if (deep.length) {
  console.log(`\n【正文索引】${deep.length} 处（目录没中，这是全屋正文里最接近的）`)
  for (const d of deep) console.log(`  - ${d.file}:${d.line}｜${d.text}`)
}
for (const [k, label] of [['catalog', '书目'], ['docs', '文档'], ['code', '代码'], ['checks', '回归断言'], ['mechanism', '机制清单'], ['zones', '区目录'], ['aliases', '别名命中']]) {
  const arr = hits[k]
  if (!arr.length) continue
  console.log(`\n【${label}】${arr.length} 处${arr.length > show ? `（只列前 ${show}，--more 看全部）` : ''}`)
  for (const it of arr.slice(0, show)) {
    if (typeof it === 'string') console.log(`  - ${it}`)
    else if (k === 'catalog') console.log(`  - ${it.id}｜${String(it.title).slice(0, 30)}｜${it.where}（${it.zone}）`)
    else if (k === 'docs') console.log(`  - ${it.file}｜${String(it.title).slice(0, 30)}`)
    else console.log(`  - ${it.file}｜${it.why}`)
  }
}
