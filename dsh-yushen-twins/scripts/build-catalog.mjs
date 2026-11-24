// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:12｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜scripts/build-catalog.mjs:133｜总书目的生成时间改走 clock（时区标签跟着系统）｜为什么：手写偏移不是系统时间：换机器或换时区就全错，各处口径还不一致｜验证：node --check 通过；node scripts/regression.mjs 全绿；全仓扫描无手写偏移｜可改：可改（只许换成 lib/clock.js 的其他封装）
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
import { fileURLToPath } from 'node:url'
import { fmtFull, zone } from '../lib/clock.js'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DAYU = path.join(HOME, 'dayu')
const OUT = path.join(DAYU, 'catalog')
const JSONL = path.join(OUT, '总书目.jsonl')
const MD = path.join(OUT, '总书目.md')

const rows = []
// 2026-11-04 老板让查真图书馆：书脊上贴的是「分类号+著者号」（如 O17/169）。
// 所以卡片也补两样：author（谁写的=著者号）、zone（三线：开架/闭架/密集）。
const zoneOfWhere = (where = '') => {
  const w = String(where).replace(/\\/g, '/')
  if (/^archive\/|\.snapshots|^catalog\//.test(w)) return '密集'
  if (/^(手抄本|待提炼|library\/(?!在用))/.test(w) || /^solutions\/|^mistakes\//.test(w)) return '闭架'
  return '开架'
}
const add = (cls, title, at, where, intro, keys = [], author = '') => {
  const date = String(at || '').replace(/[^\d-]/g, '').slice(0, 10) || '1970-01-01'
  const yymm = date.slice(2, 4) + date.slice(5, 7)
  rows.push({
    cls,
    title: String(title || '').slice(0, 60),
    at: date,
    where,
    intro: String(intro || '').slice(0, 100),
    keys: keys.filter(Boolean).slice(0, 4),
    yymm,
    author: String(author || '').slice(0, 20),
    zone: zoneOfWhere(where),
  })
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
    add('B', e.text, e.at, `soul/memory/${role}.json`, `[${e.tier || 'normal'}] ${e.channel || ''}`, [e.kind], role)
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
    for (const r of readJsonl(path.join(DAYU, 'diary', role, `${book}.jsonl`))) add('H', r.text, r.at, `diary/${role}/${book}.jsonl`, book === 'owner' ? '写给主人' : '写给自己', ['日记'], role)
  }
}

// I 框架文档：仓库里 docs/*.md —— 2026-11-04 老板问「我们所有的相关文档、记忆、其他，是不是都能进图书馆」。
// 以前总书目只收她自己的东西（卡/记忆/日记/经验/原文），文档在仓库里、不在书目里；现在补上这一大类。
// 小区（分区）：规矩 / 设定 / 机制 / 操作 / 档案 / 其他——先看文件名，名字看不出来就看正文标题里的话。
// **物理文件不动，只上架卡片**（搬文件会断掉各处写死的路径引用）。
{
  const DOCS_DIR = path.join(ROOT_DIR, 'docs')
  const ZONES = [
    ['规矩', /(规则|机制|分工|清单|改动留痕|安全|权限|底线|边界|留痕|时间观念|隐私)/],
    ['设定', /(设定|世界观|角色|叙事|点化|阶位|文化|身份|灵魂|神格)/],
    ['机制', /(机制|分工|流程|自动|巡视|自愈|备份|索引|书目|图书馆|检索|记忆)/],
    ['操作', /(攻略|路线|阶段|验收|测试|演练|手册|步骤|安装|打包|部署|上手指南)/],
    ['档案', /(故障|事故|修复|历史|档案|旧版|归档|遗留)/],
  ]
  const zoneOf = (name, text) => {
    const head = `${name}\n${(text.match(/^#+\s+.+$/gm) || []).slice(0, 8).join('\n')}`
    for (const [zone, re] of ZONES) if (re.test(head)) return zone
    return '其他'
  }
  try {
    for (const name of fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'))) {
      const file = path.join(DOCS_DIR, name)
      let text = ''
      try { text = fs.readFileSync(file, 'utf8') } catch { continue }
      const title = (text.match(/^#\s+(.+)$/m) || [])[1] || name.replace(/\.md$/, '')
      const st = (() => { try { return fs.statSync(file) } catch { return null } })()
      const at = st ? fmtFull(st.mtime).slice(0, 10) : ''
      const zone = zoneOf(name, text)
      add('I', title, at, `docs/${name}`, `框架文档 · ${zone}`, ['框架文档', zone])
    }
  } catch { /* 没有 docs 就算了 */ }
}

// J 改动与行动：worklog（每步入账）+ changes（东西被挪/被删/被改）——2026-11-04 老板问「我今天让你们改了什么、
// 加了什么，是不是也能进图书馆」。以前这些只在 jsonl 里躺着，搜得到但不上架；现在也变成卡片。
{
  const ZONE = '改动与行动'
  for (const r of readJsonl(path.join(DAYU, 'worklog.jsonl'))) {
    add('J', r.what || r.note || '（没写改了什么）', String(r.at || '').slice(0, 10), 'worklog.jsonl',
      `${r.by || '?'} · ${r.kind || 'change'}${r.why ? ` · 为什么：${String(r.why).slice(0, 60)}` : ''}`, ['改动', ZONE], r.by || '')
  }
  for (const r of readJsonl(path.join(DAYU, 'changes.jsonl'))) {
    add('J', `${r.who || '?'} ${r.action || ''}：${r.what || ''}`, String(r.at || '').slice(0, 10), 'changes.jsonl',
      `东西被动了${r.from || r.to ? `（${r.from || '?'} → ${r.to || '?'}）` : ''}`, ['变动', ZONE], r.who || '')
  }
}

// X 已剔（2026-11-04 老板：图书馆要"剔旧留痕"）——清掉的东西不是消失，是标"已剔"，盘点时不参与对账。
try {
  for (const r of readJsonl(path.join(DAYU, 'catalog', '已剔.jsonl'))) {
    add('X', `${r.what || '已剔'}（${r.count || 0} 项）`, String(r.at || '').slice(0, 10), 'catalog/已剔.jsonl',
      `已剔 · ${r.why || ''} · ${r.authority || ''}`, ['已剔', r.kind || '遗忘'], r.who || '')
  }
} catch { /* 没有已剔记录就算了 */ }

// L 库条目（在用）：2026-11-04 盘点发现 14 条"库里有、账上没有"——库和书目是两张皮。
// 精提炼的结论一直在 ~/.dsh/dayu/library/在用/ 里，但总书目从来没收过它。补上。
{
  const LIB = path.join(DAYU, 'library', '在用')
  const walkLib = (dir, depth = 0) => {
    if (depth > 2) return
    let list = []
    try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of list) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walkLib(p, depth + 1); continue }
      if (!e.name.endsWith('.jsonl')) continue
      const rel = path.relative(DAYU, p).replace(/\\/g, '/')
      for (const r of readJsonl(p)) {
        const kind = String(e.name.includes('知识') ? '知识' : e.name.includes('经验') ? '经验' : '记忆')
        add('L', r.head || r.text || '（没有标题）', String(r.at || '').slice(0, 10) || rel.slice(-13, -6).replace(/-/g, ''),
          rel, `在用 · ${kind} · ${r.confidence || ''}`, [kind, ...(Array.isArray(r.tags) ? r.tags : [])], r.by || '')
      }
    }
  }
  walkLib(LIB)
}

// 排序编号：按类 → 年月 → 时间rows.sort((a, b) => (a.cls + a.yymm + a.at).localeCompare(b.cls + b.yymm + b.at))
const seq = {}
for (const r of rows) {
  const k = r.cls + r.yymm
  seq[k] = (seq[k] || 0) + 1
  r.id = `${r.cls}-${r.yymm}-${String(seq[k]).padStart(3, '0')}${r.author ? `/${r.author}` : ''}`
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(JSONL, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

const byCls = {}
for (const r of rows) byCls[r.cls] = (byCls[r.cls] || 0) + 1
const NAMES = { A: '身份/本体', B: '记忆', C: '经验/错题', D: '知识', E: '工作/操作', F: '原文/记录', G: '媒体', H: '日记', I: '框架文档', J: '改动与行动', X: '已剔', L: '库条目' }
const md = [
  '# 总书目',
  '',
  `> 生成：${fmtFull()}（${zone()}）`,
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

// 2026-11-04 老板：「总目太大找起来慢、会看漏；知道大概在哪区就查那区的目录，范围越小越好找。」
// 所以另出两层目录（真图书馆也是这么分的）：
//   总目 catalog/目录-总目.md   —— 只有区、张数、小区名、指针（薄，一眼看完）
//   区目 catalog/区/<类>-<名>.md —— 这个区按"小区 → 书架"分组，列到条目（中等）
// 小区不再单独出文件：区目里按小区分节，小区小的时候一个文件就够，多一层反而慢。
const ZONE_DIR = path.join(OUT, '区')
try { fs.mkdirSync(ZONE_DIR, { recursive: true }) } catch { /* 建不了就只出总目 */ }
const zoneOfRow = (r) => (r.keys && r.keys.length > 1 ? r.keys[1] : (r.keys && r.keys[0]) || '未分')
const shelfOfRow = (r) => (r.keys && r.keys.length ? r.keys.join(' · ') : '未上架')

const overview = []
const zoneFiles = []
for (const [cls, name] of Object.entries(NAMES)) {
  const mine = rows.filter((r) => r.cls === cls)
  if (!mine.length) continue
  const zones = {}
  for (const r of mine) { const z = zoneOfRow(r); zones[z] = (zones[z] || 0) + 1 }
  const fileName = `${cls}-${name.replace(/[/]/g, '-')}.md`
  const zoneList = Object.entries(zones).sort((a, b) => b[1] - a[1])
  overview.push({ cls, name, count: mine.length, zones: zoneList.length, file: `区/${fileName}` })
  const body = [
    `# ${cls} 区 · ${name}`,
    '',
    `> 共 ${mine.length} 张；小区 ${zoneList.length} 个（${zoneList.map(([z, n]) => `${z} ${n}`).join('、')}）。`,
    '> 找不到就回上一层看总目，或者直接跑 `node scripts/library-lookup.mjs <关键词>`。',
    '',
    ...zoneList.flatMap(([z]) => {
      const items = mine.filter((r) => zoneOfRow(r) === z)
      const head = [`## ${z}（${items.length}）`, '', '| 索书号 | 标题 | 时间 | 位置 |', '|---|---|---|---|']
      const lines = items.slice(0, 60).map((r) => `| ${r.id} | ${String(r.title).replace(/\|/g, '/').slice(0, 34)} | ${r.at} | ${r.where} |`)
      const tail = items.length > 60 ? ['', `…还有 ${items.length - 60} 张（这一层就不列了，用 library-lookup 查）`] : []
      return [...head, ...lines, ...tail, '']
    }),
  ].join('\n')
  try { fs.writeFileSync(path.join(ZONE_DIR, fileName), body, 'utf8'); zoneFiles.push(fileName) } catch { /* 单个区写不上不影响别的 */ }
}

const overMd = [
  '# 图书馆 · 总目',
  '',
  `> 生成：${fmtFull()}（${zone()}）｜共 ${rows.length} 张卡片，${overview.length} 个大区。`,
  '> **怎么用**：先看这张总目，知道大概在哪区 → 点开那个区的目录；范围越小越好找。',
  '> 不想翻目录就直接搜：`node scripts/library-lookup.mjs <关键词>`（它同时查书目、文档、代码、回归断言）。',
  '',
  '## 大区（一眼看完，不列条目）',
  '',
  '| 区 | 名称 | 张数 | 小区数 | 目录 |',
  '|---|---|---:|---:|---|',
  ...overview.map((o) => `| ${o.cls} | ${o.name} | ${o.count} | ${o.zones} | [${o.file}](${o.file}) |`),
  '',
  '## 小区要不要再出一层？',
  '',
  '**不要。** 小区只在「区目录」里分节——小区通常只有几到几十条，一个文件里翻得到；',
  '再拆一层文件，反而多几次"打开—返回"。真到了某个小区几百条，再拆不迟（那时候用 `library-lookup` 更快）。',
  '',
  '## 加东西之前先查',
  '',
  '要加机制/改机制之前，先跑一次 `node scripts/library-lookup.mjs <你想加的东西>`：',
  '- 命中**已有**：改它，别再造一个；',
  '- 命中**相近**：说清和它什么关系（替代/补充/并存）；',
  '- 查不到：再动手，并在 `docs/机制清单.md` 加一行。',
  '',
].join('\n')
try { fs.writeFileSync(path.join(OUT, '目录-总目.md'), overMd, 'utf8') } catch { /* 写不上不影响书目本身 */ }

console.log(`总书目：${rows.length} 张（${Object.entries(byCls).map(([k, v]) => k + ' ' + v).join(' · ')}）`)
console.log('书目：' + MD)
