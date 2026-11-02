// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 关键节点（库）：从操作日志、记忆里的决定、事故单里抽，按天排成一天一份。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { workspace } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export function buildKeyPoints({ root = workspace() } = {}) {
  const OUT = path.join(root, '记忆', '关键节点')
  fs.mkdirSync(OUT, { recursive: true })
  const byDate = new Map()
  const add = (date, at, who, what, why) => {
    if (!date) return
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push({ at, who, what, why })
  }

  // 1) 操作日志（人写的四行）
  const opDir = path.join(HOME, 'dayu', '操作日志')
  if (fs.existsSync(opDir)) {
    for (const f of fs.readdirSync(opDir)) {
      const text = fs.readFileSync(path.join(opDir, f), 'utf8')
      for (const block of text.split(/\n(?=## )/)) {
        const m = /^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::\d{2})? · ([^·\n]+) · ([^\n]+)/.exec(block)
        if (!m) continue
        const what = (/- 做了什么：(.+)/.exec(block) || [])[1] || ''
        const why = (/- 为什么：(.+)/.exec(block) || [])[1] || ''
        add(m[1], m[2], m[3].trim(), what.trim(), why.trim())
      }
    }
  }

  // 2) 记忆里的真·节点（事故/决定/分工/教训）；人群画像那类不算
  for (const role of ['dayu', 'xiaoyu', 'dragon']) {
    const f = path.join(HOME, 'dayu', 'soul', 'memory', `${role}.json`)
    if (!fs.existsSync(f)) continue
    try {
      const m = JSON.parse(fs.readFileSync(f, 'utf8'))
      for (const e of m.events || []) {
        const text = String(e.text || '')
        if (/^(摘要|习惯|关系|动态|更早|心情|好感)[：:]/.test(text)) continue
        if (!/事故|决定|定下|分工|教训|重启|恢复|删除|备份策略/.test(text)) continue
        const date = String(e.at || '').slice(0, 10)
        add(date, new Date(String(e.at)).toUTCString().slice(17, 22), role === 'dayu' ? '大鱼' : role === 'xiaoyu' ? '小鱼' : '照微', text.replace(/\s+/g, ' ').slice(0, 80), '来自记忆')
      }
    } catch { /* 坏文件跳过 */ }
  }

  // 3) 事故单
  try {
    const inc = JSON.parse(fs.readFileSync(path.join(HOME, 'dayu', 'incidents.json'), 'utf8'))
    const list = Array.isArray(inc) ? inc : (inc.items || inc.incidents || [])
    for (const it of list) {
      const date = String(it.at || it.openedAt || '').slice(0, 10)
      add(date, String(it.at || '').slice(11, 16), '事故单', String(it.title || it.text || '').slice(0, 80), '事故')
    }
  } catch { /* 没有事故单 */ }

  let days = 0, rows = 0
  for (const [date, list] of [...byDate.entries()].sort()) {
    list.sort((a, b) => String(a.at).localeCompare(String(b.at)))
    const body = [
      `# ${date} · 关键节点`,
      '',
      `> 这一天里的转折；全量正文在 记忆/<谁>/完整记忆/${date}-*.md。`,
      '',
      ...list.map((r) => `## ${date} ${r.at} · ${r.who}\n\n- 做了什么：${r.what}\n- 为什么：${r.why || '—'}\n`),
    ].join('\n')
    fs.writeFileSync(path.join(OUT, `${date}.md`), body, 'utf8')
    days++; rows += list.length
  }
  return { days, rows, dir: OUT }
}
