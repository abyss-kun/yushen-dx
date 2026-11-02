// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-01 19:22｜大鱼·工作台(子代理)｜授权：主人｜scripts/memory-chain.mjs 全文件（同批新增 lib/memory-links.js，改 find-any.mjs / regression.mjs）｜记忆链条 CLI：add/list/show/search/link，人看的输出，不甩 json｜为什么：老板要「顺着线翻回去」的入口，一条命令就能看整条线｜可改：可改；别把 link 做成会改 <role>.json 的写入口
// 记忆链条 CLI：把一件事情的「前因 → 谁做了什么 → 结果 → 教训」写成一条线。
//
// 2026-11-01 老板：「别一条条孤零零记『今天被骂了』，记成『因为我没看参考图 → 被指出来 →
// 我改错方向』。以后问一句就能顺着线翻回去。」——这份是人的入口，不是给机器读的 json。
//
// 用法：
//   node scripts/memory-chain.mjs add --role dayu --title "封面折腾一晚上" \
//        --step "17:01|老板|圈出参考图" --step "17:01|我|按记忆改错那张" --lesson "先比对再动手"
//   node scripts/memory-chain.mjs list --role dayu [--limit 20]
//   node scripts/memory-chain.mjs show <id>
//   node scripts/memory-chain.mjs search <词> [--role dayu] [--brief]
//   node scripts/memory-chain.mjs link --role dayu --event m-xxxx --chain c-xxxx
//
// --step 可重复，格式 "时间|谁|做了什么"（三段用 | 隔开；缺段留空也行）。
// 存哪：~/.dsh/dayu/soul/memory/链条.jsonl + 链接.jsonl（<role>.json 一个字段都不动）。
// 用静态 import（不是 await import）：lib/dead-exports.js 只认 import 语句，
// 写成动态导入会被判成「没人接的导出」，那条断言就红了（2026-11-01 第一版就是这么红的）。
import { appendLink, readChains, getChain, chainOf, linkEvent, eventsOfChain, CHAIN_FILE } from '../lib/memory-links.js'

const args = process.argv.slice(2)
const cmd = String(args[0] || 'list').trim()
const positional = args.slice(1).filter((a) => !a.startsWith('--'))
/** 单个 --flag 的值。 */
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? String(args[i + 1] || '') : ''
}
/** 可重复的 --flag（--step 要多次传）。 */
const flags = (name) => args.reduce((out, a, i) => (a === `--${name}` ? [...out, String(args[i + 1] || '')] : out), [])
const has = (name) => args.includes(`--${name}`)

/** ISO → 本地「YYYY-MM-DD HH:MM」，人看的。已经像人写的本地时间（空格分隔、没时区尾）就原样给。 */
function when(iso) {
  const s = String(iso || '').trim()
  if (!s) return '—'
  // 注意别把 ISO 的 "…T11:18…Z" 当成人写的时间：带 T 的一律走 Date 换算，否则显示会差 8 小时
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return s.slice(0, 16)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 一句教训，长的截断（列表里别铺满屏；要看全的用 show）。 */
const brief = (text, n = 60) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return '（还没写教训）'
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function die(msg) { console.error(msg); process.exit(2) }

// 参数不合法（role 带 ..、eventId 带斜杠这类）lib 会 throw TypeError：
// 在这里收成一句人话 + 退出码 2，别把一堆栈甩到人脸上；真异常照旧抛（不掩盖 bug）。
process.on('uncaughtException', (e) => {
  if (e instanceof TypeError) { console.error(String(e.message || e)); process.exit(2) }
  console.error(e)
  process.exit(1)
})

function renderList(rows, role) {
  const who = role ? `（${role}）` : '（所有角色）'
  if (!rows.length) return `链条${who}：还没有。\n写一条：node scripts/memory-chain.mjs add --role dayu --title "…" --step "时间|谁|做了什么" --lesson "…"`
  const out = [`链条${who}：${rows.length} 条`, '']
  rows.forEach((c, i) => {
    out.push(`${i + 1}. ${c.title}  [${c.id}]`)
    out.push(`   ${c.steps.length} 步 · 建 ${when(c.createdAt)}${c.role ? ` · ${c.role}` : ''}`)
    out.push(`   教训：${brief(c.lesson)}`)
    const linked = eventsOfChain(c.role, c.id)
    if (linked.length) out.push(`   挂着 ${linked.length} 条记忆事件：${linked.map((e) => e.id).join(' / ')}`)
    out.push('')
  })
  return out.join('\n').trimEnd()
}

function renderShow(c) {
  const out = [`# ${c.title}`, '']
  out.push(`id    ${c.id}`)
  out.push(`角色  ${c.role || '—'}`)
  out.push(`建    ${when(c.createdAt)}`)
  if (c.tags.length) out.push(`标签  ${c.tags.join(' · ')}`)
  out.push('')
  out.push('## 这条线')
  out.push('')
  if (!c.steps.length) out.push('（还没写步骤）')
  c.steps.forEach((s, i) => {
    out.push(`${i + 1}. ${[s.at || '（没写时间）', s.who || '（没写谁）'].join(' · ')}`)
    out.push(`   ${s.what}`)
  })
  out.push('')
  out.push(`## 教训`)
  out.push('')
  out.push(c.lesson || '（还没写教训——没有教训的链，只是一串事）')
  const linked = eventsOfChain(c.role, c.id)
  if (linked.length) {
    out.push('')
    out.push('## 挂着的记忆事件（原文）')
    out.push('')
    for (const e of linked) {
      if (!e.found) { out.push(`- ${e.id} —— 热档里没找到（可能在冷档：~/.dsh/dayu/runtime/<role>/记忆冷档/）`); continue }
      out.push(`- ${e.id} · ${when(e.at)} · ${e.channel || '—'} · ${e.kind || '—'}`)
      out.push(`  ${String(e.text).replace(/\s+/g, ' ').slice(0, 220)}`)
    }
  }
  return out.join('\n').trimEnd()
}

if (cmd === 'add') {
  const role = flag('role')
  const title = flag('title')
  if (!role || !title) die('add 要 --role 和 --title（例：--role dayu --title "封面折腾一晚上"）')
  const steps = flags('step').filter((s) => s.trim())
  const res = appendLink(role, {
    title,
    steps,
    lesson: flag('lesson'),
    tags: flag('tags'),
  })
  if (!res.ok) die(`没写成：${res.reason || '未知原因'}`)
  const chain = getChain(res.role, res.id)
  console.log(res.duplicate
    ? `这条链已经有了（同一 role/标题/步骤/教训 = 同一个 id），没重复记：${res.id}`
    : `记好了：${res.id}  《${chain?.title || title}》${chain ? chain.steps.length : steps.length} 步`)
  console.log(`文件：${CHAIN_FILE}`)
  console.log(`现在一共 ${res.count} 条链。看它：node scripts/memory-chain.mjs show ${res.id}`)
} else if (cmd === 'list') {
  const role = flag('role')
  const limit = Number(flag('limit')) || 20
  console.log(renderList(readChains(role).slice(-limit).reverse(), role))
} else if (cmd === 'show') {
  const id = positional[0] || flag('id')
  if (!id) die('show 要给链 id（node scripts/memory-chain.mjs show c-xxxxxxxx）')
  const c = getChain(flag('role'), id)
  if (!c) die(`没有这条链：${id}（用 list 看现有 id）`)
  console.log(renderShow(c))
} else if (cmd === 'search') {
  const role = flag('role')
  const q = positional.join(' ').trim() || flag('q')
  if (!q) die('search 要给一个词（node scripts/memory-chain.mjs search 封面）')
  const limit = Number(flag('limit')) || 10
  const res = chainOf(role, q, { limit })
  if (!res.chains.length) {
    console.log(has('brief') ? '' : `搜「${q}」：没命中`)
    process.exit(0)
  }
  if (has('brief')) {
    // 给 find-any 用的一行式：命中的整条线压缩成「标题 → 教训」
    for (const c of res.chains) console.log(`[链条] ${c.title} → ${brief(c.lesson, 70)}`)
    process.exit(0)
  }
  const out = [`搜「${q}」：命中 ${res.total} 条`, '']
  for (const c of res.chains) {
    out.push(`- [${c.id}] ${c.title}（${c.steps.length} 步${c.role ? ` · ${c.role}` : ''}）`)
    out.push(`  教训：${brief(c.lesson, 90)}`)
    // 命中的那一步也带出来，别让人猜是哪句撞上的
    const token = q.toLowerCase().split(/\s+/).filter(Boolean)[0] || ''
    const step = c.steps.find((s) => `${s.at} ${s.who} ${s.what}`.toLowerCase().includes(token))
    if (step) out.push(`  撞上这一步：${step.at || '—'} · ${step.who || '—'} · ${brief(step.what, 70)}`)
    if (c.events.length) out.push(`  挂着：${c.events.map((e) => e.id).join(' / ')}`)
    out.push('')
  }
  console.log(out.join('\n').trimEnd())
} else if (cmd === 'link') {
  const role = flag('role')
  const event = flag('event')
  const chain = flag('chain')
  if (!role || !event || !chain) die('link 要 --role、--event（记忆事件 id，m-xxxx）、--chain（链条 id，c-xxxx）')
  const res = linkEvent(role, event, chain)
  if (!res.ok) die(`没挂上：${res.reason || '未知原因'}`)
  console.log(res.duplicate
    ? `已经挂过了：${res.eventId} → ${res.chainId}`
    : `挂上了：${res.eventId} → ${res.chainId}${res.event === 'not-in-hot-memory' ? '（注意：热档里没这条 id，可能在冷档）' : ''}`)
} else {
  die(`不认识的命令：${cmd}\n可用：add / list / show / search / link`)
}
