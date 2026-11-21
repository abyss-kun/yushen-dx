/* 标签
 * id: lib-library-chain
 * kind: module
 * summary: 图书馆的链：逐轮原文 → 手抄本 → 待提炼 → 在用；纯写文件、不调模型。
 * audience: 她（翻旧账）、提炼脚本、新角色
 * owner: 框架；四层结构老板定的，别新建层
 * mutable: 可改（只加层要先想清"不新建存储"那条）
 * usage: appendTurn 每轮写原文；libraryLookup 从"在用→手抄本"找；instantBlock 给即时层
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 22:20｜大鱼·子会话（工作台）｜授权：主人（本次任务书：把「每轮写完 live」接成一条链）｜lib/library-chain.js:1-260｜新增：本轮原文→手抄本(type:"raw")→粗提炼增量→待提炼指针；并提供即时层查询与「在用→手抄本→指路」检索｜为什么：原文只在 live 里，粗提炼要人手跑；她每轮读不到「刚才那句」，查记忆也只有热档一条路｜验证：node --check lib/library-chain.js 通过；node scripts/test-library-chain.mjs 6/6；node scripts/regression.mjs 全绿（断言见 regression 5xx 段）｜可改：可改（存储结构别动；要加层先想清楚「不新建存储」那条）
//
// 图书馆的四层（2026-11-02 老板定的结构，这里只负责「接上」）：
//   live/            逐轮原文（已经是事实源，本文件不改它）
//   手抄本/<通道>/<日>.jsonl   粗提炼条目（coarse:true，带 head/标签/ref）；**不再抄一份原文**（原文只在 live 一份）
//   待提炼/<通道>/<类别>/<日>.jsonl  指针（等精提炼；0 成本）
//   在用/            提炼过的（她平常真正读的）
//
// 一条链（每轮，纯写文件、不调模型、毫秒级）：
//   appendTurn 写完 live（原文唯一一份）
//   → coarseTurn（一条粗条目 + 一条待提炼指针）→ 更新 digest-state
//
// 为什么原文不进手抄本（2026-11-02 老板定，2026-11-11 校准说法）：原文全文只在 live 存一份（唯一真源），
// 手抄本只存索引卡（找得到，但不用读完），只增不删；rawRow/archiveRaw 只给老数据和测试用。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { today } from './time.js'
import { closedLookup } from './shelf.js'
export { closedLookup }
import { classifyEntry, FILTER_VERSION } from './filter.js'
import { dataRoot } from './root.js'
import { feedbackIndex } from './feedback.js'
import { tierOf } from './tier.js'
import { tombstoneIndex, isTombstoned } from './tombstone.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = dataRoot(HOME)
export const LIVE = path.join(DATA, 'live')
export const LIB = path.join(DATA, 'library')
export const STATE_FILE = path.join(LIB, 'meta', 'digest-state.json')
export const KINDS = Object.freeze(['记忆', '经验', '知识'])

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)

/** live 路径 → 通道名（和 coarse-digest 原来的口径一致，别另起一套）。 */
export function channelOfLive(file) {
  const p = String(file || '')
  if (p.includes('工作台')) return '工作台'
  if (p.includes('QQ')) return 'QQ'
  if (p.includes('B站')) return 'B站'
  if (p.includes('手机')) return '手机'
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 2] || '其它'
}

/** 场景键 → 通道名（注入时用：工作台看工作台，QQ 看 QQ）。 */
export function channelOfScene(scene) {
  if (['desk', 'workbench', 'workspace'].includes(String(scene))) return '工作台'
  if (['qq', 'social'].includes(String(scene))) return 'QQ'
  if (['bili', 'bilibili'].includes(String(scene))) return 'B站'
  return '工作台'
}

export const MIDDLE_DIR = '中层'
export const MIDDLE_LEGACY = '手抄本'
export const libFileOf = (channel, day) => path.join(LIB, MIDDLE_DIR, channel, `${day}.jsonl`)
export const legacyLibFileOf = (channel, day) => path.join(LIB, MIDDLE_LEGACY, channel, `${day}.jsonl`)
export const pendingFileOf = (channel, kind, day) => path.join(LIB, '待提炼', channel, kind, `${day}.jsonl`)

// ── 标签（从 scripts/coarse-digest.mjs 原样搬来，规则不变；脚本改成 import 这里的一份） ──
const STOP = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '就', '都', '也', '和', '不', '有', '这', '那', '个', '把', '被', '要', '会', '说', '做', '一', '没', '很', '还', '去', '来'])
export function keywords(text) {
  const words = String(text).match(/[\u4e00-\u9fa5]{2,6}|[A-Za-z][A-Za-z0-9_.-]{2,}/g) || []
  const freq = new Map()
  for (const w of words) { if (STOP.has(w)) continue; freq.set(w, (freq.get(w) || 0) + 1) }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w)
}
const ACTIONS = [
  ['改代码', /改了|修复|重构|提交|写了个|加了个|删了|改成/],
  ['修bug', /bug|报错|崩了|挂了|不工作|修好/],
  ['看视频', /BV[A-Za-z0-9]{10}|视频|看了|弹幕|评论区/],
  ['读文档', /文档|读到|翻了|资料|手册|文档里/],
  ['做图做片', /封面|立绘|出图|剪辑|渲染|视频版/],
  ['判断决定', /判断|定了|决定|拍板|取舍|选/],
  ['承诺答应', /答应|我会|马上|交给我|放心|保证/],
  ['纠错冲突', /说错|不对|纠正|冲突|矛盾|吵架|怼/],
  ['别人的事', /群里|他说|她说|老板说|群友|小鱼说/],
  ['行情数据', /播放|涨粉|数据|价格|花费|余额/],
]
export const guessWorth = (text) => (/决定|定了|以后|记住|规则|不许|必须|答应|教训|不要再|注意|判断/.test(String(text)) ? '高' : '低')
export const guessAbout = (text, who) => {
  const at = String(text).match(/@([\u4e00-\u9fa5A-Za-z0-9_]{1,12})/)
  if (at) return at[1]
  if (/老板|主人|你/.test(text)) return '老板'
  if (/小鱼|妹妹/.test(text)) return '小鱼'
  if (/照微/.test(text)) return '照微'
  return who || ''
}
export const guessSource = (who) => (who === '老板' ? '老板说的' : who === '她' ? '她说的' : who ? '别人说的' : '未知')
export const guessConfidence = (text) => (/推测|可能|大概|估计|好像|听说/.test(text) ? '推测' : '确定')
export const guessImportance = (text) => (/决定|定了|以后|记住|规则|不许|必须/.test(text) ? '高' : '普通')
export const guessKind = (text) => {
  if (/教训|下次|别再|不要再|注意/.test(text)) return '经验'
  if (/书上|据说|资料|查到|文档|参考|别人说/.test(text)) return '知识'
  return '记忆'
}

/**
 * 一条粗条目。id 幂等：通道|文件名|行号|前60字（同一轮跑几次都只有一条）。
 * 字段和 scripts/coarse-digest.mjs 原来写进手抄本的一模一样，不改旧数据的形状。
 */
export function coarseRow({ channel, base, day, time, who, role = '', line, body, refBase = '', turnId = '', sessionId = '', turn = 0, rawRef = '', keep = undefined, filterWhy = '' }) {
  // 2026-11-02：正文里带着「- 发生了什么：/ - 关键：」这两行元数据，直接当正文会又长又乱。
  // 索引卡的正文只保留"人说的那句"，关键词从整段里抽。
  const rawBody = String(body || '')
  const cleaned = rawBody.split('\n').filter((l) => !/^-\s*(发生了什么|关键)：/.test(l.trim())).join(' ').replace(/\s+/g, ' ').trim()
  const text = (cleaned || rawBody.replace(/\s+/g, ' ').trim()).slice(0, 400)
  if (!text) return null
  const auto = classifyEntry({ text, who })
  const keepFlag = keep === undefined ? auto.keep : Boolean(keep)
  const why = filterWhy || auto.why
  const fp = sha(`${turnId}|${line}|${text}`)
  const id = 'c-' + sha(`${channel}|${base}|${line}|${text.slice(0, 60)}`)
  // 2026-11-02：老代码不看 time 已经带秒，一律再拼 ":00"，手抄本里长出一批 "T22:12:51:00"。
  // 新数据一律 HH:MM:SS；老数据不追改（只增不删，排序照旧）。
  const t0 = String(time || '00:00:00')
  const hms = t0.length <= 5 ? `${t0}:00` : t0.slice(0, 8)
  return {
    id,
    at: `${day}T${hms}`,
    day, channel,
    session: String(base || '').replace(/\.md$/, ''),
    sessionId: String(sessionId || ''),
    turnId: String(turnId || ''),
    turn: Number(turn) || 0,
    rawRef: String(rawRef || ''),
    who,
    role: String(role || ''),
    head: text.slice(0, 60),
    keywords: keywords(text),
    kind: auto.kind || guessKind(text),
    worth: keepFlag ? (auto.worth || guessWorth(text)) : '低',
    keep: keepFlag,
    filterWhy: why,
    fp,
    state: keepFlag ? 'queued' : 'filtered',
    filterVersion: FILTER_VERSION,
    about: guessAbout(text, who),
    sourceLevel: guessSource(who),
    confidence: guessConfidence(text),
    importance: guessImportance(text),
    // 指回 live 原文：refBase 由调用方给（完整相对路径）；没给就退成通道/文件名，别编一个假路径。
    ref: `${refBase || `dayu/live/${channel}/${base}`}:${line}`,
    chars: text.length,
    coarse: true,
  }
}

/** 本轮原文一行（原样；不截断）。ref 指回 live 原文件的行。 */
export function rawRow({ channel, day, session, role, who, at, text, ref, line }) {
  const body = String(text || '')
  if (!body.trim()) return null
  return {
    id: 'r-' + sha(`${channel}|${session}|${line}|${body.slice(0, 60)}`),
    type: 'raw',
    at: String(at || `${day}T00:00:00`),
    day, channel, session, role: String(role || ''), who: String(who || ''),
    text: body,
    chars: body.length,
    ref: String(ref || ''),
    line: Number(line) || 0,
  }
}

const appendJson = (file, rows) => {
  if (!rows.length) return 0
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return rows.length
}

/** ① 原文先落地：这一步不许因为后面失败而回滚。 */
export function archiveRaw(row) {
  if (!row) return { ok: false, reason: '空' }
  const file = libFileOf(row.channel, row.day)
  appendJson(file, [row])
  return { ok: true, file, id: row.id }
}

/** ② 一条粗条目 + 一条待提炼指针（幂等：同一天文件里已有的 id 不会再写）。 */
const seenCache = new Map()   // 文件 → 已写过的 id；每个进程只读一次（每轮都读 600KB 账本太亏）
function seenIds(file) {
  let s = seenCache.get(file)
  if (s) return s
  s = new Set()
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const i = line.indexOf('"id":"')
      if (i >= 0) s.add(line.slice(i + 6, line.indexOf('"', i + 6)))
    }
  } catch { /* 还没有文件 */ }
  seenCache.set(file, s)
  return s
}

export function writeCoarse(rows, { pending = true } = {}) {
  let added = 0
  const byFile = new Map()
  for (const r of rows) {
    if (!r) continue
    const key = libFileOf(r.channel, r.day)
    if (!byFile.has(key)) byFile.set(key, [])
    byFile.get(key).push(r)
  }
  for (const [file, list] of byFile) {
    const existing = seenIds(file)
    const fresh = list.filter((r) => !existing.has(r.id))
    if (!fresh.length) continue
    appendJson(file, fresh)
    for (const r of fresh) existing.add(r.id)
    if (pending) {
      const byPending = new Map()
      for (const r of fresh) {
        if (r.keep === false) continue
        const p = pendingFileOf(r.channel, r.kind, r.day)
        if (!byPending.has(p)) byPending.set(p, [])
        byPending.get(p).push({ id: r.id, kind: r.kind, at: r.at, ref: r.ref, state: 'queued', turnId: r.turnId || '', sessionId: r.sessionId || '', turn: Number(r.turn) || 0, rawRef: r.rawRef || '', keep: r.keep !== false, filterWhy: r.filterWhy || '', fp: r.fp || '', filterVersion: r.filterVersion || FILTER_VERSION })
      }
      for (const [p, list2] of byPending) appendJson(p, list2)
    }
    added += fresh.length
  }
  return added
}

/** 解析一个 live 文件 → 粗条目（不写盘）。 */
export function parseLiveFile(file) {
  const channel = channelOfLive(file)
  const base = path.basename(file)
  const day = (base.match(/^\d{4}-\d{2}-\d{2}/) || [today()])[0]
  let lines
  try { lines = fs.readFileSync(file, 'utf8').split('\n') } catch { return [] }
  const rows = []
  const rel = path.relative(HOME, file).replace(/\\/g, '/')
  let cur = null
  const push = () => {
    if (!cur) return
    const row = coarseRow({ channel, base, day, time: cur.time, who: cur.who, line: cur.line, body: cur.body, refBase: rel })
    if (row) rows.push(row)
  }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###+\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*·\s*(.+)$/)
    if (m) { push(); cur = { time: m[1], who: m[2].trim(), body: '', line: i + 1 }; continue }
    if (cur) cur.body += lines[i] + '\n'
  }
  push()
  return rows
}

// ── digest-state：按文件 mtime/size 记「已经处理到哪」，增量不全扫 ──
export function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8').replace(/^\uFEFF/, '')) } catch { return { version: 1, files: {} } }
}
export function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1) + '\n', 'utf8')
  } catch { /* 状态写不下不影响原文 */ }
}
function touchState(st, key, patch) {
  st.files = st.files || {}
  st.files[key] = { ...(st.files[key] || {}), ...patch, at: new Date().toISOString() }
  writeState(st)
  return st
}

/** 增量跑一个 live 文件：mtime+size 没变就跳过（这就是「不要每次全扫」）。 */
export function digestLiveFile(file, { force = false, dry = false } = {}) {
  let st = readState()
  const key = path.relative(LIVE, file).replace(/\\/g, '/')
  let size = 0
  let mtimeMs = 0
  try { const s = fs.statSync(file); size = s.size; mtimeMs = s.mtimeMs } catch { return { ok: false, reason: '读不到', file } }
  const prev = st.files?.[key]
  if (!force && prev && prev.size === size && prev.mtimeMs === mtimeMs) {
    return { ok: true, skipped: true, added: 0, file, key }
  }
  const rows = parseLiveFile(file)
  if (dry) return { ok: true, dry: true, added: 0, parsed: rows.length, file, key }
  const added = writeCoarse(rows)
  st = readState()
  touchState(st, key, { size, mtimeMs, turns: rows.length, added })
  return { ok: true, added, parsed: rows.length, file, key }
}

/** 批量：按 --days 扫 live（新文件 / 改过的文件才真跑）。 */
export function digestAll({ days = 1 } = {}) {
  const files = []
  const walk = (d) => {
    if (!fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.md')) continue
      try { if (Date.now() - fs.statSync(p).mtimeMs > days * 86400e3) continue } catch { continue }
      files.push(p)
    }
  }
  walk(LIVE)
  let added = 0
  let ran = 0
  let skipped = 0
  for (const f of files) {
    const r = digestLiveFile(f)
    if (r.skipped) { skipped += 1; continue }
    ran += 1
    added += r.added || 0
  }
  return { ok: true, files: files.length, ran, skipped, added }
}

/**
 * 一条链：原文 → 粗提炼 → 指针。只写文件，不调模型。
 * 返回每一步的耗时（毫秒），给「延迟」验尸用。
 */
export function ingestTurn({ channel, day, session, role, who, at, text, ref, line, base, file, body: block = '', turnId = '', sessionId = '', turn = 0, keep = undefined, filterWhy = '' }) {
  const t0 = performance.now()
  // 2026-11-02 老板：「会话原文和逐轮粗提的手抄本区别」——区别在粒度，不是内容。
  // 原文全文只在 live 存一份（唯一真源）；手抄本只存索引卡（head+标签+ref），不再抄全文。
  // rawRow/archiveRaw 留着给老数据和测试用，但每轮链路不再调用。
  const rawMs = performance.now() - t0
  const a = { ok: true }
  let coarseMs = 0
  let added = 0
  let coarseRef = ''
  let pendingRef = ''
  let err = ''
  if (a.ok) {
    const t1 = performance.now()
    try {
      const refBase = file ? path.relative(HOME, file).replace(/\\/g, '/') : ''
      // 粗条目的正文要和「事后整份重扫」算出来的一字不差，否则两条路会各写一条、重复入库。
      // 扫文件时是从标题行（### …）下一行开始收的，所以这里也从那一行之后切。
      const b = String(block || '')
      const body = b.includes('\n') ? b.slice(b.indexOf('\n') + 1) : text
      const row = coarseRow({ channel, base: String(base || ''), day, time: String(at || '').slice(11, 19) || '00:00:00', who, role, line, body, refBase, turnId, sessionId, turn, rawRef: sessionId && turn ? `dayu/live/raw/${sessionId}/${turn}.jsonl` : '', keep, filterWhy })
      added = writeCoarse(row ? [row] : [], { pending: false })
      if (row) {
        coarseRef = `${path.relative(HOME, libFileOf(row.channel, row.day)).replace(/\\/g, '/')}#${row.id}`
        pendingRef = ''
      }
      const st = readState()
      const key = `${channel}/${base || '-'}`
      touchState(st, key, { turns: (st.files?.[key]?.turns || 0) + 1 })
    } catch (e) { err = String(e?.message || e).slice(0, 80) }
    coarseMs = performance.now() - t1
  }
  return { ok: a.ok, rawFile: a.file, added, rawMs, coarseMs, err, at: Date.now(), refs: { coarse: coarseRef, pending: pendingRef } }
}

// ── 即时层：不新建存储，直接查手抄本（读文件尾巴，别把整天的账本读进来） ──
function tailLines(file, maxBytes = 131072) {
  try {
    const fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    fs.closeSync(fd)
    let text = buf.toString('utf8')
    if (start > 0) text = text.slice(text.indexOf('\n') + 1)
    return text.split('\n').filter(Boolean)
  } catch { return [] }
}


/**
 * 注入用的「刚才那句」：今天 + 本通道最近 N 条原文，每条 ≤40 字，整块 ≤100 字。
 * 不新建存储——内容就是手抄本里那几行。
 */
export function instantBlock(role, scene = 'desk', { limit = 5, budget = 100 } = {}) {
  const channel = channelOfScene(scene)
  const day = today()
  // 2026-11-02：raw 不再写（原文只在 live），即时层改读粗条目，文字取 head。
  // 2026-11-13：精提炼写进「在用」的结论也要进即时层；只读手抄本会让浅层白炼。
  const fbi = feedbackIndex()
  const tombs = tombstoneIndex()
  const shallow = recentInUse(channel, '', 12)
    .map((r) => ({ ...r, _tier: tierOf(r, fbi.get(String(r.turnId)) || fbi.get(String(r.fromRef)) || null) }))
    .filter((r) => r._tier === '顶游' || r._tier === '上游' || r._tier === '中游')
  const coarse = recentCoarse(channel, day, 12).map((r) => ({ ...r, _tier: '中游', _fresh: true }))
  const seen = new Set()
  const prio = (r) => (r._tier === '顶游' ? 0 : r._tier === '上游' ? 1 : r._fresh ? 2 : 3)
  const rows = [...shallow, ...coarse]
    .filter((r) => r.role === role || (!r.role && role === 'dayu') || !r.role)
    .filter((r) => !isTombstoned({ turnId: r.turnId, ref: r.ref || r.fromRef || r.rawRef || '' }, tombs))
    .filter((r) => {
      const k = String(r.turnId || r.fromRef || r.id || r.head || '')
      if (!k) return true
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => (prio(a) - prio(b)) || String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, limit)
  if (!rows.length) return ''
  const head = '刚才（中层/浅层）：'
  const who = (r) => (r.who === '老板' ? '老板' : r.who === '她' ? '她' : clip(r.who, 4) || '谁')
  const fmt = (r, cap) => `- ${who(r)}：${clip(r.text || r.head || '', cap)}`
  const size = (ls) => head.length + 1 + ls.join('\n').length
  let lines = rows.map((r) => fmt(r, 40))
  while (lines.length > 1 && size(lines) > budget) lines.pop()
  if (size(lines) > budget) {
    const last = rows[rows.length - 1]
    let cap = 40
    while (cap > 1 && size([fmt(last, cap)]) > budget) cap -= 1
    lines = [fmt(last, Math.max(1, cap))]
  }
  return [head, ...lines].join('\n')
}

// 2026-11-02：即时层的读法——同一天的手抄本、只要索引卡（非 raw），按行序取最后几条。
function recentCoarse(channel, day, n = 12) {
  const rows = []
  for (const f of [libFileOf(channel, day), legacyLibFileOf(channel, day)]) {
    rows.push(...tailLines(f, 65536).map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean).filter((r) => r.type !== 'raw'))
  }
  return rows.sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).slice(-n)
}

// 浅层：精提炼写进 在用 的结论；只取同一天、同通道。
function recentInUse(channel, day = '', n = 12) {
  const out = []
  for (const f of filesUnder(path.join(LIB, '在用'))) {
    if (day && !f.endsWith(`${day}.jsonl`)) continue
    for (const r of readJsonl(f)) {
      if (day && String(r.day || '') !== day) continue
      if (String(r.channel || '') === channel) out.push(r)
    }
  }
  return out.sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).slice(-n)
}

// ── 检索：在用 → 手抄本 → 指路（live 原文） ──
function readJsonl(file) {
  const out = []
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return out }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(String(line).replace(/^\uFEFF/, ''))) } catch { /* 坏行跳过 */ }
  }
  return out
}
function filesUnder(dir) {
  const out = []
  const walk = (d) => {
    let ents = []
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.jsonl')) out.push(p)
    }
  }
  walk(dir)
  return out
}

/**
 * 按词/类别/时间找记忆。顺序：在用（她平常读的）→ 手抄本（完整原文）→ 闭架（旧书，不优先）→ 都没有就指路去 live。
 * 手抄本里 raw 与粗条目都在：raw 是原话，coarse 是带标签的粗条目。
 * 2026-11-11（library-shelf）：闭架是最后一站——在用/手抄本都没有结果才翻；命中标 zone=闭架，让她知道这是旧书。
 */
// 改｜2026-11-11 19:0x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接 §二 图书馆定稿：闭架可查、不优先）｜lib/library-chain.js:412-470｜libraryLookup 加第三站：在用/手抄本都没命中时翻闭架，结果带 zone=闭架 与 closedRel｜为什么：条目一个月不用就搬进闭架后，检索如果看不见它，等于"关进去就丢了"；但闭架也不能排到在用前面，否则旧书挤掉新书｜验证：node scripts/test-library-closed.mjs 通过（只有闭架里有那条时能查到、且有 zone）；node scripts/regression.mjs 全绿｜可改：可改；闭架永远排最后，不许提到前面
export function libraryLookup({ q = '', kind = '', day = '', limit = 5, layers = ['在用', '手抄本'] } = {}) {
  const needle = String(q || '').trim()
  const kindWant = String(kind || '').trim()
  const kinds = kindWant ? KINDS.filter((k) => k === kindWant || kindWant === 'exp' || kindWant === 'mem') : KINDS
  const pick = (rows, layer) => rows
    .filter((r) => !kindWant || kinds.includes(r.kind || guessKind(r.text || r.head || '')))
    .filter((r) => !day || String(r.day || r.at || '').startsWith(day))
    // 2026-11-03 老板：「标了不用等于没标」——appliesTo（以后什么情况用得上）本来就是给人找东西用的，检索时算命中
    .filter((r) => !needle || String(r.text || r.head || '').includes(needle) || String(r.keywords || '').includes(needle) || String(r.appliesTo || '').includes(needle))
  const out = { query: needle, kind: kindWant, day, 在用: [], 手抄本: [], 闭架: [], next: '' }
  for (const layer of layers) {
    const dirs = (layer === '手抄本' || layer === '中层') ? [MIDDLE_DIR, MIDDLE_LEGACY] : [layer]
    const hits = []
    for (const dir of dirs) for (const f of filesUnder(path.join(LIB, dir))) hits.push(...pick(readJsonl(f), layer))
    hits.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    out[layer] = hits.slice(0, Math.max(1, Number(limit) || 5)).map((r) => ({
      at: r.at || '', kind: r.kind || '', who: r.who || '', channel: r.channel || '',
      text: clip(r.text || r.head || '', 120), ref: r.ref || '', id: r.id || '',
      ...(Array.isArray(r.people) && r.people.length ? { people: r.people.slice(0, 3) } : {}),
      ...(r.appliesTo ? { appliesTo: clip(r.appliesTo, 40) } : {}),
    }))
    // 在用找到就不往下翻（和 scripts/library.mjs lookup 一个口径）
    if (layer === '在用' && out.在用.length) break
  }
  let found = out.在用.length + out.手抄本.length
  // 闭架：只在上面都没命中时翻（可查、不优先）。
  if (!found) {
    try {
      out.闭架 = closedLookup({ q: needle, kind: kindWant, day, limit }).map((r) => ({
        at: r.at || '', kind: r.kind || '', who: r.who || '', channel: r.channel || '',
        text: clip(r.text || r.head || '', 120), ref: r.ref || '', id: r.id || '',
        zone: '闭架', closedRel: r.closedRel || '',
        ...(Array.isArray(r.people) && r.people.length ? { people: r.people.slice(0, 3) } : {}),
        ...(r.appliesTo ? { appliesTo: clip(r.appliesTo, 40) } : {}),
      }))
    } catch { out.闭架 = [] }
    found = out.闭架.length
  }
  if (!found) {
    out.next = `在用、手抄本、闭架都没有。下一站：live 原文 —— node dsh-yushen-twins/scripts/find-any.mjs ${needle || '<关键词>'}`
  }
  return out
}

function libStats() {
  const count = (layer) => {
    let rows = 0
    let files = 0
    for (const f of filesUnder(path.join(LIB, layer))) { files += 1; rows += readJsonl(f).length }
    return { files, rows }
  }
  return { 在用: count('在用'), 中层: count('中层'), 手抄本: count('手抄本'), 待提炼: count('待提炼') }
}
