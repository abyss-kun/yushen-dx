// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 总书目：像图书馆那样，一件东西一张卡片，带索书号。
// 2026-11-01 主人：现实里图书馆那么大，为什么一搜就出来？因为有索书号、目录卡、分类。
//
// 分类（简化中图法，8 类）：
//   A 身份/本体   B 记忆   C 经验/错题/解法   D 知识
//   E 工作/交付/操作   F 会话原文/记录   G 媒体   H 日记/私密
// 索书号：<类>-<YYMM>-<三位序号>
//
// 输出：~/.dsh/dayu/catalog/总书目.jsonl + 总书目.md
// 用法：node scripts/build-catalog.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DAYU = path.join(HOME, 'dayu')
const OUT = path.join(DAYU, 'catalog')
const JSONL = path.join(OUT, '总书目.jsonl')
const MD = path.join(OUT, '总书目.md')

const rows = []
const add = (cls, title, at, where, intro, keys = []) => {
  const date = String(at || '').replace(/[^\d-]/g, '').slice(0, 10) || '1970-01-01'
  const yymm = date.slice(2, 4) + date.slice(5, 7)
  rows.push({ cls, title: String(title || '').slice(0, 60), at: date, where, intro: String(intro || '').slice(0, 100), keys: keys.filter(Boolean).slice(0, 4), yymm })
}
const readJsonl = (file) => {
  const out = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { out.push(JSON.parse(line)) } catch { /* 跳过 */ }
    }
  } catch { /* 没有 */ }
  return out
}

// A 身份/本体：卡与宪章
for (const [file, title] of [
  [path.join(DAYU, 'soul', 'cards', 'dayu.desk.md'), '大鱼·本体卡'],
  [path.join(DAYU, 'soul', 'cards', 'dayu.social.md'), '大鱼·社交卡'],
  [path.join(DAYU, 'soul', 'cards', 'xiaoyu.social.md'), '小鱼·社交卡'],
  [path.join(DAYU, 'soul', 'cards', 'dragon.desk.md'), '照微·本体卡'],
]) {
  if (fs.existsSync(file)) add('A', title, '2026-10-31', file.replace(DAYU + path.sep, ''), '身份：她是谁', ['身份'])
}

// B 记忆：三人事件 + 大纲
for (const role of ['dayu', 'xiaoyu', 'dragon']) {
  let mem = null
  try { mem = JSON.parse(fs.readFileSync(path.join(DAYU, 'soul', 'memory', `${role}.json`), 'utf8')) } catch { continue }
  for (const e of (mem.events || []).slice(-80)) {
    add('B', e.text, e.at, `soul/memory/${role}.json`, `[${e.tier || 'normal'}] ${e.channel || ''}`, [e.kind])
  }
}

// C 经验：错题本 + 解法
for (const r of readJsonl(path.join(DAYU, 'mistakes', '错题本.jsonl'))) add('C', `${r.who}：${r.what}`, r.at, 'mistakes/错题本.jsonl', r.how, ['错题'])
try {
  for (const f of fs.readdirSync(path.join(DAYU, 'solutions'))) {
    if (!f.endsWith('.json')) continue
    const j = JSON.parse(fs.readFileSync(path.join(DAYU, 'solutions', f), 'utf8'))
    add('C', j.title || j.symptom || f, j.at || '', `solutions/${f}`, j.fix || j.solution || '', ['解法'])
  }
} catch { /* 没有 */ }

// D 知识：学习日志
try {
  const t = fs.readFileSync(path.join(DAYU, '学习日志.md'), 'utf8')
  for (const line of t.split('\n')) if (/^- \*\*/.test(line)) add('D', line.slice(0, 60), '2026-10-31', '学习日志.md', line.slice(0, 100), ['知识'])
} catch { /* 没有 */ }

// E 工作：操作日志
try {
  for (const f of fs.readdirSync(path.join(DAYU, '操作日志'))) {
    if (!f.endsWith('.md')) continue
    const t = fs.readFileSync(path.join(DAYU, '操作日志', f), 'utf8')
    for (const block of t.split(/\n(?=## )/)) {
      const m = /^## (.+?) · (.+?) · (.+)$/m.exec(block)
      if (!m) continue
      const what = (/- 做了什么：(.+)/.exec(block) || [])[1] || ''
      add('E', what, m[1], `操作日志/${f}`, m[2], [m[3]])
    }
  }
} catch { /* 没有 */ }

// F 原文：实录索引 + 记录
for (const r of readJsonl(path.join(DAYU, 'live', '索引.jsonl'))) add('F', `${r.date} ${r.title}`, r.date, `live/${r.file}`, `${r.segs} 段`, String(r.keys || '').split('、'))
try {
  for (const role of fs.readdirSync(path.join(DAYU, 'records'))) {
    const dir = path.join(DAYU, 'records', role)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const day of fs.readdirSync(dir)) {
      for (const f of fs.readdirSync(path.join(dir, day))) {
        if (!f.endsWith('.md')) continue
        add('F', `${role} ${day} ${f.replace(/\.md$/, '')}`, day, `records/${role}/${day}/${f}`, '完整记录', ['记录'])
      }
    }
  }
} catch { /* 没有 */ }

// G 媒体
for (const r of readJsonl(path.join(DAYU, 'library', 'media.jsonl'))) add('G', r.标题, r.时间, r.目录, `${r.类型} · ${r.谁}`, [r.类型, r.谁])

// H 日记
for (const role of ['dayu', 'xiaoyu', 'dragon'].filter((r) => fs.existsSync(path.join(DAYU, 'diary', r)))) {
  for (const book of ['private', 'owner']) {
    for (const r of readJsonl(path.join(DAYU, 'diary', role, `${book}.jsonl`))) add('H', r.text, r.at, `diary/${role}/${book}.jsonl`, book === 'owner' ? '写给主人' : '写给自己', ['日记'])
  }
}

// 排序编号：按类 → 年月 → 时间
rows.sort((a, b) => (a.cls + a.yymm + a.at).localeCompare(b.cls + b.yymm + b.at))
const seq = {}
for (const r of rows) {
  const k = r.cls + r.yymm
  seq[k] = (seq[k] || 0) + 1
  r.id = `${r.cls}-${r.yymm}-${String(seq[k]).padStart(3, '0')}`
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(JSONL, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

const byCls = {}
for (const r of rows) byCls[r.cls] = (byCls[r.cls] || 0) + 1
const NAMES = { A: '身份/本体', B: '记忆', C: '经验/错题', D: '知识', E: '工作/操作', F: '原文/记录', G: '媒体', H: '日记' }
const md = [
  '# 总书目',
  '',
  `> 生成：${new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')}（Asia/Shanghai）`,
  `> 共 ${rows.length} 张卡片。索书号 = 类-年月-序号（如 B-2611-003）。`,
  '> 用法：先查这张总书目（找得到就不用翻原文）→ 再看目录 → 最后才调原文。',
  '',
  '## 分类统计',
  '',
  '| 类 | 名称 | 卡片数 |',
  '|---|---|---|',
  ...Object.entries(NAMES).map(([k, v]) => `| ${k} | ${v} | ${byCls[k] || 0} |`),
  '',
  '## 最近 200 张卡片',
  '',
  '| 索书号 | 类 | 标题 | 时间 | 位置 |',
  '|---|---|---|---|---|',
  ...rows.slice(-200).reverse().map((r) => `| ${r.id} | ${NAMES[r.cls]} | ${String(r.title).replace(/\|/g, '/').slice(0, 40)} | ${r.at} | ${r.where} |`),
  '',
].join('\n')
fs.writeFileSync(MD, md, 'utf8')

console.log(`总书目：${rows.length} 张（${Object.entries(byCls).map(([k, v]) => k + ' ' + v).join(' · ')}）`)
console.log('书目：' + MD)
