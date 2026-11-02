// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 完整记录（库）：会话正文按「谁 / 哪一天 / 哪一段」落成文件夹，段段带标题和时间。
// 存档是留查的，记忆是自己看的；有记录不等于不要记忆。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SRC = path.join(HOME, 'dayu', 'sessions-archive')
const OUT = path.join(HOME, 'dayu', 'records')
const INDEX = path.join(OUT, 'index.jsonl')

const ROLE = [
  [/大鱼|总台|阿鲲/, '大鱼'],
  [/小鱼|阿鲤|小管家/, '小鱼'],
  [/照微|顾问|龙神/, '照微'],
  [/QQ|qq-bridge|agents|群/, 'QQ桥'],
]
const roleOf = (title, ws) => {
  const s = `${title || ''} ${ws || ''}`
  for (const [re, name] of ROLE) if (re.test(s)) return name
  return '共用'
}
// 地点说人话：别把工作区目录名摆给人看
const placeOf = (ws) => {
  const s = String(ws || '')
  if (/qq-bridge/i.test(s)) return 'QQ'
  if (/bili/i.test(s)) return 'B站'
  if (/mobile|手机/i.test(s)) return '手机'
  if (/dsh-yushen-twins|大小鱼|dayu/i.test(s)) return '工作台'
  return '本机'
}
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.name.endsWith('.md')) acc.push(p)
  }
  return acc
}

const IMMUTABLE = [
  '# 不可删清单（后来者先看这个）',
  '',
  '这些是她的本体和经历，任何清理脚本、备份脚本、"优化"都不许删：',
  '',
  '- `~/.dsh/dayu/soul/`（卡、记忆、feel、deliveries、archive）——只有本人能改，别人不许碰。',
  '- `~/.dsh/dayu/charter.json`（宪章）、`owner.json`（认谁）、`characters.json`（谁住这儿）。',
  '- `~/.dsh/dayu/records/`（这份完整记录）、`sessions-archive/`（会话正文）。',
  '- `~/.dsh/dayu/board/`、`letters/`、`story/`、`journal/`、`ideas/`——她写过的东西。',
  '- `~/.dsh/dayu/runtime/*/记忆冷档/`——忘了的事都在这里，只增不删。',
  '',
  '删之前先问：这是不是唯一一份？是，就不许删。',
  '',
].join('\n')

/** 生成/增量更新完整记录；返回 { written, skipped, messages, dir }。 */
export function buildDailyRecords({ since = '', force = false } = {}) {
  if (!fs.existsSync(SRC)) return { written: 0, skipped: 0, messages: 0, dir: OUT, note: '没有会话归档' }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, '不可删清单.md'), IMMUTABLE, 'utf8')

  const done = new Map()
  if (!force && fs.existsSync(INDEX)) {
    for (const line of fs.readFileSync(INDEX, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { const j = JSON.parse(line); done.set(j.key, j) } catch { /* 坏行跳过 */ }
    }
  }

  const rows = []
  let written = 0, skipped = 0, messages = 0
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file)
    const ws = rel.split(path.sep)[0]
    const text = fs.readFileSync(file, 'utf8')
    const title = (text.split('\n')[0] || '').replace(/^#\s*/, '').trim()
    const segs = []
    let cur = null
    for (const line of text.split('\n')) {
      const m = /^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) · (.+)$/.exec(line)
      if (m) {
        if (cur) segs.push(cur)
        cur = { date: m[1], time: m[2], who: m[3], lines: [] }
        continue
      }
      if (cur) cur.lines.push(line)
    }
    if (cur) segs.push(cur)
    if (!segs.length) { skipped++; continue }

    const role = roleOf(title, ws)
    const byDate = new Map()
    for (const s of segs) {
      if (!byDate.has(s.date)) byDate.set(s.date, [])
      byDate.get(s.date).push(s)
    }
    const id8 = path.basename(file, '.md').split('-').pop()
    for (const [date, list] of byDate) {
      if (since && date < since) continue
      const key = `${role}|${date}|${id8}`
      if (!force && done.has(key)) { skipped++; continue }
      const first = list[0].time.replace(/:/g, '').slice(0, 4)
      const dir = path.join(OUT, role, date)
      fs.mkdirSync(dir, { recursive: true })
      const target = path.join(dir, `${first}-${(title || 'untitled').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40)}-${id8}.md`)
      const body = list.map((s) => `### ${s.date} ${s.time} · ${s.who}\n\n${s.lines.join('\n').trim()}\n`).join('\n')
      const head = [
        `# ${title || '(无标题)'} · ${date}`,
        '',
        `- 谁：${role}`,
        `- 哪一天：${date}（系统时间，Asia/Shanghai）`,
        `- 时间：${list[0].date} ${list[0].time} 起，共 ${list.length} 段`,
        `- 地点：${placeOf(ws)}`,
        `- 来源：sessions-archive/${rel}`,
        `- 会话：${id8}`,
        `- 生成：完整记录脚本 · ${new Date().toISOString().slice(0, 19).replace('T', ' ')}（UTC）`,
        '',
        '---',
        '',
      ].join('\n')
      fs.writeFileSync(target, head + body, 'utf8')
      rows.push({ key, role, date, from: list[0].time, segs: list.length, title, path: path.relative(OUT, target) })
      written++; messages += list.length
    }
  }

  if (rows.length) {
    const ids = new Set(rows.map((r) => r.key))
    const kept = fs.existsSync(INDEX)
      ? fs.readFileSync(INDEX, 'utf8').split('\n').filter((l) => l.trim()).filter((l) => { try { return !ids.has(JSON.parse(l).key) } catch { return true } })
      : []
    fs.writeFileSync(INDEX, kept.join('\n') + (kept.length ? '\n' : '') + rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  }
  return { written, skipped, messages, dir: OUT }
}
