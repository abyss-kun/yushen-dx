/* 标签
 * id: alias-harvest
 * kind: module
 * tags: 检索, 别名, 数据驱动, 查不到的词
 * created: 2026-11-04 18:00:00
 * changed: 2026-11-04 17:43:43
 * author: 照微·工作台
 * authority: 老板（2026-11-04：别名单靠检索日志反向扩，数据驱动不用猜）
 * why: 别名表靠人拍脑袋写，永远漏；真凭据是"她搜了什么、什么没搜到"
 * result: 从 recall-log 里挑出 0 命中的查询，判断"词在库里但没有别名组"还是"压根没有"，产出待补清单
 * mutable: 可改
 */
// 用法：node scripts/alias-harvest.mjs [--json] [--limit 50]
// 输出：~/.dsh/dayu/catalog/待补别名.md（人看）+ 控制台摘要
//
// 判据：
//   · recall-log 里 hits=0 的 query → 她说"没搜到"
//   · 拿这个词去倒排索引里试：**正文里有**但查不到 → 多半缺别名组（该补）
//   · 正文里也没有 → 真的没有这件东西（不用补别名）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const json = args.includes('--json')
const limIdx = args.indexOf('--limit')
const limit = limIdx >= 0 ? Math.max(5, Number(args[limIdx + 1]) || 50) : 50

const { hardTimeout } = await import(pathToFileURL(path.join(ROOT, 'lib', 'offline-guard.js')).href)
hardTimeout(5, 'alias-harvest.mjs')

const readJsonl = (f) => {
  try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] }
}

// 1) 她说"没搜到"的词
const zero = readJsonl(path.join(D, 'runtime', 'recall-log.jsonl'))
  .filter((r) => Number(r.hits) === 0 && r.query)
  .map((r) => String(r.query).trim())
  .filter((q) => q.length >= 2)

// 2) 去索引里试：正文有没有这个词
let idx = null
try { idx = JSON.parse(fs.readFileSync(path.join(D, 'runtime', '倒排.json'), 'utf8')) } catch { idx = null }
const { tokenize, searchIndex } = idx ? await import(pathToFileURL(path.join(ROOT, 'lib', 'inverted.js')).href) : {}

// 3) 现有别名组，避免重复建议
let groups = {}
try { groups = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'aliases.json'), 'utf8')) } catch { groups = {} }
const covered = new Set()
for (const [k, v] of Object.entries(groups)) {
  if (k.startsWith('_') || !Array.isArray(v)) continue
  for (const w of [k, ...v]) covered.add(String(w).toLowerCase())
}

const rows = []
for (const q of [...new Set(zero)].slice(0, limit)) {
  let inText = 0
  if (idx) {
    try { inText = searchIndex(idx, tokenize(q).slice(0, 6)).size } catch { inText = 0 }
  }
  rows.push({
    q,
    inText,
    verdict: inText > 0 ? '正文里有 → 缺别名/缺上架' : '正文也没有 → 可能真没有',
    hasGroup: covered.has(q.toLowerCase()),
  })
}

const needAlias = rows.filter((r) => r.inText > 0)
const digest = `待补别名：${needAlias.length} 个词（正文有、但查不到）／共看了 ${rows.length} 个空查询`

if (!json) {
  console.log(digest)
  for (const r of needAlias.slice(0, 12)) console.log(`  · ${r.q}（正文命中 ${r.inText} 行${r.hasGroup ? '，已有别名组' : ''}）`)
  for (const r of rows.filter((x) => x.inText === 0).slice(0, 5)) console.log(`  ○ ${r.q} → 正文里也没有`)
}

// 写清单（人照着补 lib/aliases.json）
try {
  const out = path.join(D, 'catalog', '待补别名.md')
  const md = [
    `# 待补别名 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    '',
    `> ${digest}`,
    '> 判据：她说"没搜到"（recall-log 里 hits=0），但正文索引里其实有 → 多半是说法不一样，缺别名组。',
    '',
    '## 该补的（正文有、查不到）',
    '',
    ...(needAlias.length ? needAlias.map((r) => `- \`${r.q}\`（正文 ${r.inText} 行）`) : ['（没有）']),
    '',
    '## 正文里也没有（可能真没有这件东西）',
    '',
    ...(rows.filter((r) => r.inText === 0).slice(0, 30).map((r) => `- \`${r.q}\``)),
    '',
    '补法：把同义说法加进 `lib/aliases.json`：`{"新的词": ["它其实叫法1", "叫法2"]}`。',
  ].join('\n')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, md, 'utf8')
  if (!json) console.log(`\n清单：${out}`)
} catch { /* 写不上不影响结论 */ }

if (json) console.log(JSON.stringify({ at: new Date().toISOString(), digest, needAlias, rows }, null, 2))
