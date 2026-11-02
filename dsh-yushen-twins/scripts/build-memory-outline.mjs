// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 记忆大纲：一份总目录，分级、带标签，让她一眼看到「我都记着什么」。
// 2026-11-01 主人：分级排列、加标签、一份总的记忆大纲；检索按情况来。
//
// 输出：~/.dsh/dayu/soul/memory/大纲.md
// 分级：core（身份/关系/承诺/事故）→ important（重要的事）→ normal（日常）
// 上限：core 30 / important 200（三人合计），判据见 docs/记忆分级.md；数从 memory-tier-audit.mjs 取，不另写一份。
// 标签：从 kind/channel/正文关键词推（事故/决定/承诺/关系/日常/工作/情绪）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getCharacter } from '../lib/characters.js'
import { CAPS } from './memory-tier-audit.mjs'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const OUT = path.join(HOME, 'dayu', 'soul', 'memory', '大纲.md')

const TIERS = [
  ['core', '一、核心（每轮带着）'],
  ['important', '二、重要（按需翻）'],
  ['normal', '三、日常（只留检索，不进每轮）'],
]
const tagOf = (e) => {
  const t = `${e.kind || ''} ${e.text || ''}`
  if (/事故|崩|丢|失效|坏了/.test(t)) return '事故'
  if (/定下|决定|分工|规则|改成/.test(t)) return '决定'
  if (/答应|承诺|一定|不再/.test(t)) return '承诺'
  if (/喜欢|怕|难过|开心|累|舍不得/.test(t)) return '情绪'
  if (/关系|姐姐|妹妹|主人/.test(t)) return '关系'
  if (/跑|改|修|写|建|删|备份/.test(t)) return '工作'
  return '日常'
}
const day = (at) => String(at || '').slice(0, 10)

const roles = ['dayu', 'xiaoyu', 'dragon']
const nameOf = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
const sections = []
const counts = { core: 0, important: 0, normal: 0 }

for (const role of roles) {
  let mem = null
  try { mem = JSON.parse(fs.readFileSync(getCharacter(role).memory, 'utf8')) } catch { continue }
  const events = (mem.events || []).map((e) => ({ ...e, tier: e.tier || (e.pinned ? 'core' : 'normal') }))
  const lines = [`## ${nameOf[role] || role}（${events.length} 条事件 · 习惯 ${(mem.habits || []).length} · 关系 ${(mem.dynamics || []).length}）`, '']
  lines.push(`摘要：${String(mem.summary || '').slice(0, 200) || '（还没有）'}`, '')
  for (const [tier, title] of TIERS) {
    const list = events.filter((e) => e.tier === tier)
    counts[tier] += list.length
    lines.push(`### ${title} · ${list.length} 条`, '')
    for (const e of list.slice(-40)) lines.push(`- ${day(e.at)} · [${tagOf(e)}] ${String(e.text || '').replace(/\s+/g, ' ').slice(0, 60)}`)
    if (!list.length) lines.push('-（空）')
    lines.push('')
  }
  sections.push(lines.join('\n'))
}

const over = []
if (counts.core > CAPS.core) over.push(`核心超上限 ${counts.core - CAPS.core} 条`)
if (counts.important > CAPS.important) over.push(`重要超上限 ${counts.important - CAPS.important} 条`)

const md = [
  '# 记忆大纲',
  '',
  `> 生成：${new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')}（Asia/Shanghai）`,
  '> 分级：core 每轮带着 · important 按需翻 · normal 只留检索。',
  `> 上限：核心 ${CAPS.core} · 重要 ${CAPS.important}（三人合计）；判据见 \`docs/记忆分级.md\`。`,
  '> 检索顺序：先看这份大纲 → 拿关键词用 `find-any` / `yushen_self action=memory` 翻 → 再查会话原文兜底。',
  `> 合计：核心 ${counts.core} / ${CAPS.core} · 重要 ${counts.important} / ${CAPS.important} · 日常 ${counts.normal}`,
  ...(over.length ? [`> ⚠ ${over.join('，')}——跑 \`scripts/memory-tier-audit.mjs\` 看该降哪几条，加 \`--apply\` 真降。`] : []),
  '',
  ...sections,
].join('\n')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, md, 'utf8')
console.log(`大纲：${OUT}（core ${counts.core} / important ${counts.important} / normal ${counts.normal}）`)
