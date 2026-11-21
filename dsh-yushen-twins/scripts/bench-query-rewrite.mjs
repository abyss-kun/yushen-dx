// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-03 01:52｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：语义检索第一档）｜scripts/bench-query-rewrite.mjs:1-131｜新增：用真实索引卡对比「原查询命中数 vs 改写后命中数」的小基准｜为什么：光有测试不够，得知道这一档到底多召回了几条；但不能拿真索引试跑，只能只读拷几份卡到临时家｜验证：& $node scripts/bench-query-rewrite.mjs → 4 份真实卡（约 350 行），5 条查询原 24 → 改写后 47（+23）；读不到卡时打印「跳过」且不产生数字｜可改：可改（查询与卡组合可换，口径不许编）
//
// 语义检索第一档 · 增益基准（只读真实家里的一小份，所有写入都在临时目录）。
//
// 做什么：
//   ① 从 ~/.dsh/dayu/library 只读拷 4 份真实索引卡到临时家（不当成她的正式索引）；
//   ② 在临时家里 buildIndex()（绝不碰 ~/.dsh/dayu/runtime/倒排.json）；
//   ③ 对每条真实查询：recallNow(原句) vs recallNow(每个改写变体) 的命中并集，数差多少；
//   ④ 打印每条查询的原始命中 / 改写命中 / 增益 / 新增来自哪个变体。
//
// 口径（别改）：
//   · 命中数用 recallNow 去重后的 total（limit 拉满，不靠随机挑三条）；
//   · 原查询走现有链路（lib/recall-now.js，含它自己的别名扩展），改写后 = 各变体命中并集；
//   · 读不到库/建不出索引 → 打印「跳过」并退出 0，**不编数字**。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildIndex, homeDir } from '../lib/inverted.js'
import { recallNow } from '../lib/recall-now.js'
import { rewrite, loadAliases, toGroups } from '../lib/query-rewrite.js'

const LIBRARY = path.join(homeDir(), 'dayu', 'library')

// 只拷这几份：够覆盖记忆/经验/知识/原文四类，加起来不到 300KB。
const CARD_FILES = [
  '在用/记忆/2026-11-03.jsonl',
  '在用/经验/2026-11-03.jsonl',
  '在用/知识/2026-11-02.jsonl',
  '手抄本/工作台/2026-11-03.jsonl',
]

// 5 条真实问句：前 3 条预期靠「跨写法 / 全半角」拿到增益，后 2 条是对照组（预期≈0）。
const QUERIES = [
  { q: 'repair-helper 装在哪', note: '跨写法（补丁表）' },
  { q: 'ＧｉｔＨｕｂ 怎么连', note: '全半角归一' },
  { q: 'trace 检查', note: '跨写法（补丁表）' },
  { q: '快照还在吗', note: '对照：纯中文同义词' },
  { q: '倒排重建过吗', note: '补丁表（倒排→倒排索引）' },
]

const hitKey = (h) => (h.id ? `id:${h.id}` : `${h.kind}|${h.file || h.role || ''}:${h.line || String(h.text || '').slice(0, 40)}`)

let tmp = ''
function cleanupTmp() {
  if (!tmp) return
  // 只清自己 mkdtemp 出来的临时家（路径前缀不匹配就留着，不冒险删）。
  const resolved = path.resolve(tmp)
  const tmpRoot = path.resolve(os.tmpdir())
  if (resolved.startsWith(tmpRoot + path.sep) && path.basename(resolved).startsWith('yushen-qrw-bench-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }) } catch { /* 清不掉也不影响结论 */ }
  }
}

function skip(reason) {
  console.log(`跳过：${reason}`)
  console.log('没有产生任何增益数字（读不到真实索引卡就不编）。')
  cleanupTmp()
  process.exit(0)
}

function displayWidth(s) {
  return [...String(s)].reduce((n, ch) => n + (/[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 2 : 1), 0)
}
function padDisplay(s, width) {
  const text = String(s)
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)))
}

if (!fs.existsSync(LIBRARY)) skip(`读不到 ${LIBRARY}（真实索引卡目录不存在）`)

tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-qrw-bench-'))
const coldDir = path.join(tmp, 'dayu', 'runtime', '记忆冷档')
const started = Date.now()
let copied = 0
let built = null

try {
  fs.mkdirSync(coldDir, { recursive: true })
  for (const rel of CARD_FILES) {
    const src = path.join(LIBRARY, rel)
    if (!fs.existsSync(src)) continue
    const name = rel.replace(/\//g, '-')
    fs.copyFileSync(src, path.join(coldDir, name))
    copied += 1
  }
  if (!copied) skip(`真实索引卡一份都没拷到（${LIBRARY} 下没有预期文件）`)

  built = buildIndex({ home: tmp })
  if (!built.ok || !built.docs) skip(`临时索引建出来是空的（doc ${built?.docs ?? 0}），不做基准`)

  const aliases = loadAliases()
  const groupCount = toGroups(aliases).length
  const loadMs = Date.now() - started

  console.log('语义检索第一档 · 查询改写增益（真实索引卡，临时家）')
  console.log(`索引卡：${copied} 份 / ${built.docs} 行 / ${built.tokens} token（从 ${LIBRARY} 只读拷贝；临时家 ${tmp}）`)
  console.log(`别名：${groupCount} 组（真实表 + 补丁合并后）；临时索引 ${(built.bytes / 1024).toFixed(0)}KB，建索引 ${built.ms}ms，准备共 ${loadMs}ms`)
  console.log('')
  console.log(`${padDisplay('查询', 26)}${padDisplay('原命中', 8)}${padDisplay('改写后', 8)}${padDisplay('增益', 7)}新增来自 / 说明`)
  console.log('-'.repeat(96))

  let totalBase = 0
  let totalNew = 0
  const rows = []

  for (const { q, note } of QUERIES) {
    const base = recallNow(q, { home: tmp, limit: 100000 })
    const baseKeys = new Set(base.hits.map(hitKey))
    const plan = rewrite(q, { aliases })
    const added = new Map()
    for (const variant of plan.variants) {
      const r = recallNow(variant, { home: tmp, limit: 100000 })
      for (const h of r.hits) {
        const key = hitKey(h)
        if (!baseKeys.has(key) && !added.has(key)) added.set(key, variant)
      }
    }
    const rewritten = baseKeys.size + added.size
    const gain = added.size
    totalBase += baseKeys.size
    totalNew += rewritten
    const firstVariant = added.size ? [...added.values()][0] : ''
    rows.push({ q, note, plan, base: baseKeys.size, rewritten, gain, firstVariant })
    const source = gain ? `变体「${firstVariant}」` : '无新增（现有链路已覆盖）'
    console.log(`${padDisplay(q, 26)}${padDisplay(baseKeys.size, 8)}${padDisplay(rewritten, 8)}${padDisplay(gain > 0 ? `+${gain}` : '0', 7)}${source} ｜${note}`)
  }

  console.log('-'.repeat(96))
  console.log(`${padDisplay('合计', 26)}${padDisplay(totalBase, 8)}${padDisplay(totalNew, 8)}${padDisplay(totalNew - totalBase > 0 ? `+${totalNew - totalBase}` : '0', 7)}`)

  // 每条查询的变体都摊开，父会话接线时能直接看到改写长什么样。
  console.log('\n改写变体（按查询）：')
  for (const row of rows) {
    console.log(`· ${row.q} → ${row.plan.variants.map((v) => `「${v}」`).join(' ')}`)
  }

  const zeroControls = rows.filter((r) => r.note.startsWith('对照') && r.gain === 0).length
  if (zeroControls) {
    console.log(`\n结论：${zeroControls} 条纯中文同义词对照查询增益为 0——现有 recall-now 的 expandAliases 本来就会把同组词都加进候选，查询改写在这条路上不重复加分。`)
  }
  console.log('      有增益的查询都靠「全半角/大小写归一」或「跨写法补丁表」；这两块是现有链路真缺的。')
  console.log('      口径提醒：这里比的是召回条数，不是准确率——关键词召回会泛化（例如「修复助手」会带出含「修复」的无关行），增益数字不代表每条都对题。')
} catch (error) {
  console.error(`基准失败：${error?.stack || error}`)
  process.exitCode = 1
} finally {
  cleanupTmp()
}
