// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 书架：每本书先看目录，再决定翻哪一页。只读本地，不调模型。
//
// 统一格式（所有书一样）：{ id, title, at, where, tags, hint, line }
//   title 是什么、at 什么时候、where 在哪（通道/来源）、tags 关键字。
// 书单：手册 / 解法 / 错题 / 交接 / 工作区 / 记忆 / 故事 / 心念。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { handbookIndex } from './handbook.js'
import { listSolutions } from './solutions.js'
import { listIncidents } from './incidents.js'
import { readBoard } from './board.js'
import { knowledgeBook } from './paths.js'
import { handoffDisplayTime } from './handoff-name.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

export const BOOKS = Object.freeze([
  { id: 'handbook', title: '手册', what: '规矩、岗位、怎么干',
    how: '先看目录挑主题，别整本读。铁律和底线不用查——它们一直在这儿。' },
  { id: 'solutions', title: '解法', what: '踩过的坑怎么解',
    how: '卡住时先按现象搜标签，找到就照做，别从头重推。做完补一条验证方式。' },
  { id: 'incidents', title: '错题', what: '出过的错、怎么防',
    how: '动手前扫一眼同类；结单时写"怎么防复发"，不写"以后注意"。' },
  { id: 'handoff', title: '交接', what: '上一班干到哪',
    how: '接手前只读最近一份。写的时候只写三行：做到哪、下一步、卡在哪。' },
  { id: 'workspace', title: '工作区', what: '这台电脑上的活怎么接',
    how: '换机器、换班才翻。平时不用看。' },
  { id: 'memory', title: '记忆', what: '她自己记着的人和事',
    how: '见人之前翻一下这个人；新事聊完顺手记一条，别攒。' },
  { id: 'story', title: '故事', what: '发生过的事，写成短篇',
    how: '想讲的时候才翻。写短，一件事一段，不写流水账。' },
  { id: 'mind', title: '心念', what: '她的兴趣、疑问、没做完的',
    how: '闲下来翻。想到什么随手加一条，不解释、不展开。' },
  { id: 'board', title: '公告', what: '所有人都该知道的决定',
    how: '醒来先看目录，别读详情。写的时候六项齐全：时间/地点/谁/什么事/想表达什么/影响谁。' },
  { id: 'owner', title: '主人', what: '他是谁、他要什么、我该怎么对他',
    how: '不确定该怎么对他时翻。只看「他要什么」和「不要对他做」两节就够。',
  },
  { id: 'letters', title: '信箱', what: '别的身体留给你的话',
    how: '醒来扫一眼就够。回不回都行；要回就回在同一个话题里，别开新的。' },
  // 2026-11-01 主人：像书一样——书名、目录、简介、使用说明。原文/错题/媒体/日记各一本。
  { id: 'live', title: '实录', what: '逐轮抄下来的原话（按天、通道、标题）',
    how: '只有记不清"当时到底怎么说的"才翻。先看索引，再点某一天；平时不要读。' },
  { id: 'mistakes', title: '错题', what: '谁踩的坑、为什么踩、怎么避开',
    how: '动手前按关键词扫一眼同类。写的时候三样齐：谁、为什么、怎么避开。' },
  { id: 'library', title: '媒体', what: '图片、视频、音频、文档：谁、什么时候、在哪',
    how: '要找片子或素材时翻。按类型和日期筛，别整本读。' },
  { id: 'diary', title: '日记', what: '她写给自己的、写给主人的',
    how: '想她的时候翻 owner 那本；她自己翻 private 那本。不对外引用。' },
])

const WORKSPACE_BOOK = knowledgeBook()

function clip(text, n = 48) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n)}…` : s
}

/** 统一一行：所有书都长这样，读的人不用为每本记一套格式。 */
function row({ id = '', title = '', at = '', where = '', tags = [], hint = '' }) {
  const tagList = (tags || []).filter(Boolean).slice(0, 6)
  // 全部强制成字符串：undefined 会被 JSON 丢掉，宿主判成非无损
  return {
    id: String(id ?? ''),
    title: clip(title, 60),
    at: String(at || '').slice(0, 19).replace('T', ' '),
    where: String(where ?? ''),
    tags: tagList,
    hint: clip(hint, 50),
    line: [clip(title, 60), String(at || '').slice(0, 10), where, tagList.join('/')].filter(Boolean).join('｜'),
  }
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

export function shelf() {
  return { books: BOOKS.map(({ id, title, what, how }) => ({ id, title, what, how })) }
}

function handbooks() {
  const index = handbookIndex()
  return (index?.topics || []).map((t) => row({
    id: t.id,
    title: t.title,
    where: '手册',
    tags: t.roles?.length ? t.roles : (t.keywords || []).slice(0, 4),
  }))
}

function solutions() {
  return listSolutions({ limit: 100 }).map((s) => row({
    id: s.id,
    title: s.problem,
    where: '解法库',
    tags: s.tags,
    hint: s.verification,
  }))
}

function incidents() {
  const open = (s) => s === 'open' || s === 'fixing'
  return listIncidents({ limit: 100 })
    .slice()
    .sort((a, b) => (open(b.status) - open(a.status)) || String(b.id).localeCompare(String(a.id)))
    .map((i) => row({
      id: i.id,
      title: `${open(i.status) ? '未结' : '已结'}｜${i.title}`,
      at: i.at,
      where: '事故',
      tags: [i.status, i.sessionId].filter(Boolean),
      hint: i.text,
    }))
}

function handoffs() {
  const dir = path.join(DATA, 'handoff')
  let names = []
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort().reverse() } catch { return [] }
  return names.slice(0, 30).map((name) => {
    let first = ''
    try {
      first = fs.readFileSync(path.join(dir, name), 'utf8')
        .split(/\r?\n/).map((l) => l.replace(/^#+\s*/, '').trim())
        .find((l) => l.length > 0) || ''
    } catch { /* 读不到就只给时间 */ }
    const stamp = name.replace(/\.md$/, '')
    return row({
      id: stamp,
      title: first || stamp,
      at: handoffDisplayTime(name),
      where: '换班',
      tags: ['交接'],
    })
  })
}

function workspace() {
  let text = ''
  try { text = fs.readFileSync(WORKSPACE_BOOK, 'utf8') } catch { return [] }
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/)
    if (m) { rows.push(row({ id: m[1], title: m[2].trim(), at: m[1], where: '工作区', tags: ['交接'], hint: m[3].trim() })); continue }
    const h = line.match(/^###\s+(.+)$/)
    if (h) rows.push(row({ title: h[1], where: '工作区', tags: ['交接'] }))
    if (rows.length >= 60) break
  }
  return rows
}

function memory(role) {
  const file = path.join(DATA, 'soul', 'memory', `${role}.json`)
  const m = readJson(file)
  if (!m) return []
  const out = []
  for (const e of (m.events || []).slice(-80).reverse()) {
    out.push(row({ at: e.at, where: e.channel || '本体', title: e.text, tags: [e.kind].filter(Boolean) }))
  }
  for (const h of (m.habits || []).slice(-40)) out.push(row({ where: '习惯', title: h, tags: ['习惯'] }))
  for (const d of (m.dynamics || []).slice(-40)) out.push(row({ where: '关系', title: typeof d === 'string' ? d : (d.text || ''), tags: ['关系'] }))
  for (const [who, text] of Object.entries(m.impressions || {})) {
    out.push(row({ where: '印象', title: `${who}：${typeof text === 'string' ? text : (text?.text || '')}`, tags: ['印象'] }))
  }
  return out
}

function story() {
  const dir = path.join(DATA, 'story')
  let names = []
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort().reverse() } catch { return [] }
  return names.slice(0, 80).map((name) => {
    const base = name.replace(/\.md$/, '')
    const m = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/)
    return row({ id: base, title: m ? m[2] : base, at: m ? m[1] : '', where: '故事', tags: ['故事'] })
  })
}

function mind(role) {
  const file = path.join(DATA, 'mind', `${role}.json`)
  const doc = readJson(file)
  if (!doc) return []
  const items = Array.isArray(doc) ? doc : (doc.items || [])
  return items.slice(-80).reverse().map((it) => row({
    id: it.id,
    title: it.text || it.detail || '',
    at: it.at || it.createdAt,
    where: '心念',
    tags: [it.kind, it.state].filter(Boolean),
    hint: it.detail,
  }))
}


function board(role = 'dayu') {
  const b = readBoard({ role })
  const out = []
  for (const it of b.global) out.push(row({ id: it.title, title: '[总] ' + it.title, at: it.at, where: '公告', tags: ['公告'], hint: it.what }))
  for (const it of b.mine) out.push(row({ id: it.title, title: '[我] ' + it.title, at: it.at, where: '我的板', tags: ['我'], hint: it.what }))
  return out
}


function letters(role) {
  const dir = path.join(DATA, 'letters', role)
  let files = []
  try { files = fs.readdirSync(dir).filter((n) => n.endsWith('.md')) } catch { return [] }
  const out = []
  for (const f of files) {
    let text = ''
    try { text = fs.readFileSync(path.join(dir, f), 'utf8') } catch { continue }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^-\s+(.+)$/)
      if (m) out.push(row({ title: m[1].trim(), where: '信箱', tags: [f.replace(/\.md$/, '')] }))
    }
  }
  return out.slice(-40).reverse()
}
function owner() {
  const file = path.join(DATA, 'owner.md')
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  let sec = ''
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)$/)
    if (h) { sec = h[1].trim(); continue }
    const m = line.match(/^-\s+(.+)$/)
    if (m) {
      const t = m[1].trim()
      const dt = t.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/)
      out.push(row({ title: dt ? dt[2] : t, at: dt ? dt[1] : '', where: sec || '主人', tags: ['主人'] }))
    }
  }
  return out
}
/** 实录目录：来自 live/索引.jsonl（哪天、通道、标题、段数、关键字）。 */
function live() {
  const file = path.join(DATA, 'live', '索引.jsonl')
  const rows = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      const r = JSON.parse(line)
      rows.push(row({ id: r.file || '', title: `${r.date || ''} ${r.title || ''}`.trim(), at: r.date || '', where: r.place || '', tags: String(r.keys || '').split(/[、,]/).filter(Boolean), hint: `${r.segs || 0} 段` }))
    }
  } catch { return [] }
  return rows.reverse()
}
/** 错题目录：谁踩的、踩了什么、怎么避开。 */
function mistakes() {
  const file = path.join(DATA, 'mistakes', '错题本.jsonl')
  const rows = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      const r = JSON.parse(line)
      rows.push(row({ id: r.at || '', title: `${r.who}：${r.what}`.slice(0, 60), at: r.at || '', where: r.where || '', tags: [r.scope || '', r.by || ''], hint: r.how || '' }))
    }
  } catch { return [] }
  return rows.reverse()
}
/** 媒体目录：图片/视频/音频/文档。 */
function library() {
  const file = path.join(DATA, 'library', 'media.jsonl')
  const rows = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      const r = JSON.parse(line)
      rows.push(row({ id: r.path || '', title: r.标题 || '', at: r.时间 || '', where: r.目录 || '', tags: [r.类型 || '', r.谁 || ''], hint: r.谁 || '' }))
    }
  } catch { return [] }
  return rows.reverse()
}
/** 日记目录：private 写给自己、owner 写给他。 */
function diary(who = 'dayu') {
  const dir = path.join(DATA, 'diary', who)
  const rows = []
  for (const book of ['private', 'owner']) {
    const file = path.join(dir, `${book}.jsonl`)
    try {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue
        const r = JSON.parse(line)
        rows.push(row({ id: r.at || '', title: `${book === 'owner' ? '给主人' : '给自己'}：${String(r.text || '').slice(0, 40)}`, at: r.at || '', where: book, tags: ['日记'], hint: r.source || '' }))
      }
    } catch { /* 这本没有就跳过 */ }
  }
  return rows.reverse()
}
/** 一本书的目录；没有这本就如实说没有，不编。 */
export function contents(book = '', { limit = 40, role = 'dayu' } = {}) {
  const id = String(book || '').trim()
  const meta = BOOKS.find((b) => b.id === id)
  if (!meta) return { ok: false, error: `没有这本：${id || '（空）'}；可选 ${BOOKS.map((b) => b.id).join(' / ')}` }
  const who = String(role || 'dayu').replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 40)
  const all = id === 'handbook' ? handbooks()
    : id === 'solutions' ? solutions()
      : id === 'incidents' ? incidents()
        : id === 'handoff' ? handoffs()
          : id === 'workspace' ? workspace()
            : id === 'memory' ? memory(who)
              : id === 'story' ? story()
                : id === 'board' ? board(who)
                  : id === 'letters' ? letters(who)
                    : id === 'owner' ? owner()
                      : id === 'live' ? live()
                        : id === 'mistakes' ? mistakes()
                          : id === 'library' ? library()
                            : id === 'diary' ? diary(who)
                              : mind(who)
  return {
    ok: true,
    book: { id: meta.id, title: meta.title, what: meta.what, how: meta.how },
    // 2026-11-01：diary 读的是 who（谁的日记），返回里也得带上——否则面板会显示成默认角色。
    role: ['memory', 'mind', 'diary'].includes(id) ? who : '',
    total: all.length,
    items: all.slice(0, Math.max(1, Math.min(200, Number(limit) || 40))),
    note: all.length === 0 ? '这本还是空的（或文件不在）——空着就是空着，不编。' : '',
  }
}
