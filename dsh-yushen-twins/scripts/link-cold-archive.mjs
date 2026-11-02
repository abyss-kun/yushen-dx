// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-01 07:02｜小鱼·工作台｜授权：自己｜scripts/link-cold-archive.mjs 新增 whyMissing()，替换原来那段三选一的原因；最后一行输出格式保持不变｜冷档未接原文按原因分类：日期无归档 / 提炼条目 / 太短 / 原文缺；1061 条里真正的原文缺只有 23 条｜为什么：原来一律写「原文缺（原文里没有这一段）」，1061 条看起来像同一个毛病，会让人以为记忆坏了上千条。实测四种情况完全不同：那天整段没进归档（868）/ 记忆里加工过的摘要习惯（116）/ 不到 8 字定位不了（84）/ 真·原文缺（23）。｜可改：四类名字可改，但「不许合并成一个数」这条不能松
// 冷档接上原文：给冷档里每一条「一句话事件」找到它出自哪段会话、哪一行。
// 2026-11-01 主人：完全记忆的缺口在「想起一句话，翻不到上下文」。这一步把两头接上。
//
// 做法：不按「整行相等」匹配（她的话常嵌在一段里），改成子串命中 + 回算行号。
// 输出（都在 <role>/记忆冷档/ 下）：
//   索引.jsonl     每条冷档一行 { at, head, source: { file, line, session } }——找不到就是 null，不编。
//   未接原文.jsonl 连不上的那些 { at, head, 原因 }——不静默：缺多少、缺在哪，单独留一份。
//
// 每天由 dayu/index.js 的 tick 跑一次（--role dayu/xiaoyu/dragon），取**最后一行**写进日志；
// 所以最后一行必须是给人看的那句「冷档 N 条：接上 X，连不上 Y 条（原文缺）」。
// 退出码恒 0：连不上是数据缺口（原文没归档到那段），不是脚本跑挂了。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SRC = path.join(HOME, 'dayu', 'sessions-archive')
const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? String(args[i + 1] || '') : '' }
const role = flag('role') || 'dayu'
const COLD = path.join(HOME, 'dayu', 'runtime', role, '记忆冷档')
const OUT = path.join(COLD, '索引.jsonl')
const MISSING_OUT = path.join(COLD, '未接原文.jsonl')

// 这两个是本脚本自己的产物，别当冷档原文再读回来（否则越跑越多）。
const OWN = new Set(['索引.jsonl', '未接原文.jsonl'])

if (!fs.existsSync(COLD)) { console.error('没有冷档：' + COLD); process.exit(0) }

// 归一化：去掉所有空白（她要找的话常被换行/空格拆开）。
// 同时记住每一行开头落在归一化文本的哪个位置——行号要从这里回算，不能靠「原样前 8 个字再 indexOf」
//（那句话里带空格就永远找不到，行号就塌成 0，等于给了个假地址）。
const prep = (text) => {
  const starts = []
  let norm = ''
  for (const line of text.split('\n')) {
    starts.push(norm.length)
    norm += line.replace(/\s+/g, '')
  }
  return { norm, starts }
}
const lineAt = (starts, idx) => {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= idx) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

// 读全部原文进内存并归一化一次（18MB 原文；不缓存的话每条冷档都要重算 470 份，跑一趟 1 分钟起）
const files = []
const walk = (dir) => {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (!e.name.endsWith('.md')) continue
    try {
      const text = fs.readFileSync(p, 'utf8')
      files.push({ p, text, session: e.name.split('-').pop().replace(/\.md$/, ''), ...prep(text) })
    } catch { /* 跳过 */ }
  }
}
if (fs.existsSync(SRC)) walk(SRC)
console.log(`原文 ${files.length} 份`)

const norm = (s) => String(s || '').replace(/\s+/g, '')

// 2026-11-01 小鱼：原来一律写「原文缺（原文里没有这一段）」，1061 条看起来像同一个毛病。
// 实际是四种完全不同的情况，混在一起会让人以为记忆坏了上千条：
//   太短        —— 不到 8 个字，定位不了（不是缺，是没法定位）
//   提炼条目    —— 摘要/习惯这种加工过的，天生没有「原文」
//   日期无归档  —— 那一整天会话都没进归档（10-25~30 就是这一整段）
//   原文缺      —— 那天有归档文件，但没这一段
const PRECIS = /^\s*(摘要|习惯|印象|动态|关系|事件|事实)[：:]/
function whyMissing(e, needle) {
  if (needle.length < 8) return '太短（不到 8 字，定位不了）'
  const text = String(e.text || '')
  if (PRECIS.test(text)) return '提炼条目（记忆里加工过的，本来就没有原文）'
  if (!files.length) return '原文缺（归档里没有原文：sessions-archive 不存在或为空）'
  const day = String(e.at || '').slice(0, 10)
  const dayFiles = files.filter((f) => path.basename(f.p).includes(day))
  if (day && dayFiles.length === 0) return `日期无归档（${day} 的会话没进归档）`
  return '原文缺（那天的归档里有文件，但没这段话）'
}

const rows = []
const missingRows = []
let total = 0
let linked = 0
for (const f of fs.readdirSync(COLD).sort()) {
  if (!f.endsWith('.jsonl') || OWN.has(f)) continue
  for (const line of fs.readFileSync(path.join(COLD, f), 'utf8').split('\n')) {
    if (!line.trim()) continue
    total += 1
    let e = null
    try { e = JSON.parse(line) } catch { /* 下面按读不出来记 */ }
    if (!e || typeof e.text !== 'string') {
      // 冷档坏行也留一条记录：逐条有账，才谈得上「缺多少」。
      const head = String(line).trim().slice(0, 60)
      rows.push({ at: e?.at || '', head, source: null })
      missingRows.push({ at: e?.at || '', head, 原因: '读不出来（这一行不是 JSON 或没有 text）' })
      continue
    }
    const needle = norm(e.text).slice(0, 14)
    let source = null
    if (needle.length >= 8) {
      for (const file of files) {
        const idx = file.norm.indexOf(needle)
        if (idx >= 0) {
          source = { file: file.p, line: lineAt(file.starts, idx), session: file.session }
          break
        }
      }
    }
    if (source) linked += 1
    else missingRows.push({
      at: e.at || '',
      head: String(e.text).slice(0, 60),
      原因: whyMissing(e, needle),
    })
    rows.push({ at: e.at, head: String(e.text).slice(0, 60), source })
  }
}

fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8')
fs.writeFileSync(MISSING_OUT, missingRows.map((r) => JSON.stringify(r)).join('\n') + (missingRows.length ? '\n' : ''), 'utf8')

console.log(`索引：${OUT}（${rows.length} 条）`)
console.log(`未接原文：${MISSING_OUT}（${missingRows.length} 条）`)
// 最后一行：tick 直接取这一行进 log。总数对得上 cold 的总行数（含连不上的）。
console.log(`冷档 ${total} 条：接上 ${linked}，连不上 ${total - linked} 条（原文缺）`)
