// 鱼神双子星 · 状态适配器
// 两件事，边界分得很清楚：
//   1) 外部心情**只读**：只解析 mood 数据文件（YUSHEN_MOOD_FILE / DSH_HOME/dayu /
//      BILI_STATE_DIR 或默认 DSH_HOME/bili-duty），不读外部插件代码、不 import 外部模块、
//      不执行、不写回任何外部数据。
//   2) 鱼神自己的状态**只写本地**：~/.dsh/dayu/state/<role>.json 与 ~/.dsh/dayu/diary/<role>/<book>.jsonl。
// 角色（role）与日记本（book）都走白名单；任何路径都由白名单值拼出来，杜绝穿越。
// 策略（policy）不调模型，逐字对齐 dsh-bili-scroll 的 moodPolicy（index.js:240-255，2026-10-23 核对）。
// 心情默认属于小鱼（B 站）；大鱼要读必须显式给 YUSHEN_MOOD_FILE 或 BILI_STATE_DIR 做授权映射。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const ROLES = Object.freeze(['dayu', 'xiaoyu'])
export const DIARY_BOOKS = Object.freeze(['private', 'owner'])
export const STATE_WRITE_FIELDS = Object.freeze(['mood', 'expression', 'lastReason'])

export const MAX_DIARY_TEXT = 1000
export const MAX_EXPRESSION = 80
export const MAX_REASON = 200
export const MAX_NOTE = 300
export const MAX_CATEGORY = 40
export const MAX_SOURCE = 60
export const MAX_EXTERNAL_REASON = 200
export const MAX_EXTERNAL_NOTE = 120 // 与 B 站 mood-history 的 note 上限一致
export const MAX_HISTORY = 20
export const MAX_OBSERVATIONS = 20
export const MAX_NOTES = 50

const DEFAULT_STATE = Object.freeze({ mood: 50, expression: '平静', lastReason: '', updatedAt: null })

const READ_ONLY_LIMITS = Object.freeze([
  '外部心情只读：只解析 mood 数据文件，不读外部插件代码、不执行、不写回外部',
  'mood 是外部给出的估值，不等同于她此刻的真实情绪',
  '读的是文件原值，不模拟 B 站心情的自然恢复（+2/小时、上限 85）',
  '不调用模型：策略只按阈值查表',
])

const DAYU_NO_MAPPING = '外部心情默认属于小鱼（B 站）；大鱼未获显式映射（YUSHEN_MOOD_FILE / BILI_STATE_DIR），本次不读'

// ---------- 基础工具 ----------

function dshHome() {
  // 必须每次调用时解析：测试会用临时 DSH_HOME 覆盖环境，模块加载时锁死就读不到了。
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function dayuDir() {
  return path.join(dshHome(), 'dayu')
}

function nowIso() {
  return new Date().toISOString()
}

function safeText(value, max) {
  if (value == null) return ''
  return String(value).trim().slice(0, max)
}

function clampMood(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, n))
}

// 白名单严格匹配：不做 trim、不做大小写宽容。多一个空格就算非法，
// 宁可报错也不要把 'dayu ' 悄悄当成 dayu 写到磁盘上。
function assertRole(role) {
  const r = typeof role === 'string' ? role : null
  if (!ROLES.includes(r)) {
    throw new Error(`未知角色：${String(role)}（只允许 ${ROLES.join(' / ')}）`)
  }
  return r
}

function assertBook(book) {
  const b = typeof book === 'string' ? book : null
  if (!DIARY_BOOKS.includes(b)) {
    throw new Error(`未知日记本：${String(book)}（只允许 ${DIARY_BOOKS.join(' / ')}）`)
  }
  return b
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* 清不掉就算了，别掩盖原始错误 */ }
    throw err
  }
}

// ---------- 心情策略（纯查表，不叫模型） ----------
// 逐条对齐 dsh-bili-scroll/index.js:240-255 的 moodPolicy：
//   skipChance 0.05 / 0.15 / 0.35 / 0.7，picks 5 / 4 / 3 / 2，comment >=35，reply >=45，
//   vent <35，stranger：>=85 brag、<35 vent、其余 none。
// level 只是为了读起来方便，阈值与 skipChance 的四档一致（>=70 / >=50 / >=35 / <35）。
export function moodPolicy(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const mood = Math.min(100, Math.max(0, n))
  return {
    level: mood >= 70 ? 'high' : mood >= 50 ? 'stable' : mood >= 35 ? 'tired' : 'low',
    skipChance: mood >= 70 ? 0.05 : mood >= 50 ? 0.15 : mood >= 35 ? 0.35 : 0.7,
    picks: mood >= 70 ? 5 : mood >= 50 ? 4 : mood >= 35 ? 3 : 2,
    comment: mood >= 35,
    reply: mood >= 45,
    vent: mood < 35,
    stranger: mood >= 85 ? 'brag' : mood < 35 ? 'vent' : 'none',
  }
}

// ---------- 外部心情：只读探测 ----------

function tryJson(text) {
  try { return { ok: true, value: JSON.parse(text) } } catch { return { ok: false } }
}

function normalizeAt(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{10,13}$/.test(trimmed)) return normalizeAt(Number(trimmed))
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

function pickAt(payload) {
  if (!payload || typeof payload !== 'object') return null
  for (const key of ['at', 'updatedAt', 'updated_at', 'time', 'timestamp', 'ts', 'date']) {
    const at = normalizeAt(payload[key])
    if (at) return at
  }
  return null
}

function firstFinite(list) {
  for (const item of list) {
    if (typeof item === 'number' && Number.isFinite(item)) return item
  }
  return null
}

function parseMoodPayload(payload) {
  if (payload == null) return null

  if (Array.isArray(payload)) {
    for (let i = payload.length - 1; i >= 0; i -= 1) {
      const mood = parseMoodPayload(payload[i])
      if (mood) return mood
    }
    return null
  }

  if (typeof payload === 'number') {
    const value = clampMood(payload)
    return value == null ? null : { value, at: null }
  }

  if (typeof payload === 'string') {
    const text = payload.trim()
    if (!text) return null
    if (/^-?\d+(?:\.\d+)?$/.test(text)) {
      const value = clampMood(Number(text))
      return value == null ? null : { value, at: null }
    }
    const hit = text.match(/(?:mood|value|score)\D{0,8}(-?\d+(?:\.\d+)?)/i) || text.match(/-?\d+(?:\.\d+)?/)
    if (!hit) return null
    const value = clampMood(Number(hit[1] != null ? hit[1] : hit[0]))
    return value == null ? null : { value, at: null }
  }

  if (typeof payload === 'object') {
    const n = firstFinite([
      payload.mood,
      payload.value,
      payload.score,
      payload.moodValue,
      payload.mood && payload.mood.value,
      payload.mood && payload.mood.score,
      payload.state && payload.state.mood,
      payload.data && payload.data.mood,
    ])
    if (n == null) return null
    // reason / note 是 B 站那边记“这次为什么变”的字段，观察时一并保留。
    return {
      value: Math.min(100, Math.max(0, n)),
      at: pickAt(payload),
      reason: safeText(payload.reason != null ? payload.reason : payload.why, MAX_EXTERNAL_REASON),
      note: safeText(payload.note, MAX_EXTERNAL_NOTE),
    }
  }

  return null
}

function parseMoodText(text, file) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null

  // 先整份当 JSON 读（兼容带缩进的对象/数组）。
  const whole = tryJson(trimmed)
  if (whole.ok) {
    const mood = parseMoodPayload(whole.value)
    if (mood) return mood
    if (!/\.jsonl$/i.test(file)) return null
  }

  // 否则按 JSONL 逐行，从最后一行往前找第一个可用的。
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parsed = tryJson(lines[i])
    const mood = parseMoodPayload(parsed.ok ? parsed.value : lines[i])
    if (mood) return mood
  }
  return null
}

function readMoodCandidate(entry) {
  let text
  try {
    text = fs.readFileSync(entry.file, 'utf8')
  } catch (err) {
    return { ...entry, ok: false, reason: err && err.code === 'ENOENT' ? 'missing' : 'unreadable' }
  }
  const mood = parseMoodText(text, entry.file)
  if (!mood) return { ...entry, ok: false, reason: 'unparsable' }
  return { ...entry, ok: true, value: mood.value, at: mood.at, reason: mood.reason || '', note: mood.note || '' }
}

function readHistoryCandidate(entry) {
  let text
  try {
    text = fs.readFileSync(entry.file, 'utf8')
  } catch {
    return []
  }
  const trimmed = text.trim()
  if (!trimmed) return []

  const whole = tryJson(trimmed)
  let items
  if (whole.ok) {
    items = Array.isArray(whole.value) ? whole.value : [whole.value]
  } else {
    items = trimmed.split(/\r?\n/).filter(Boolean).map((line) => {
      const parsed = tryJson(line)
      return parsed.ok ? parsed.value : line
    })
  }

  const out = []
  for (const item of items) {
    const mood = parseMoodPayload(item)
    if (mood) {
      out.push({
        value: mood.value,
        at: mood.at,
        reason: mood.reason || '',
        note: mood.note || '',
        source: entry.source,
      })
    }
  }
  return out
}

/**
 * 读外部心情（只读）。返回 { ok, source, role, value, at, history, policy, limitations }，
 * 并带上 reason / note（这次为什么变）与 book（命中的那一本）。
 * 书（book）按顺序探测：YUSHEN_MOOD_FILE（同目录 book）→ DSH_HOME/dayu →
 *   BILI_STATE_DIR（未设则用真实默认家目录 DSH_HOME/bili-duty）。
 * 每本书先看 mood.json，再看同书 mood-history.jsonl 的最后一条；
 * **历史只取命中的同一本**，不把 dsh/dayu 与 bili 的历史混在一起。
 * 全部找不到、或大鱼未获显式映射时 ok=false，value/policy 为 null。
 */
export function readExternalMood({ role = 'xiaoyu' } = {}) {
  const r = assertRole(role)
  const home = dshHome()
  const biliEnv = typeof process.env.BILI_STATE_DIR === 'string' ? process.env.BILI_STATE_DIR.trim() : ''
  const envFile = typeof process.env.YUSHEN_MOOD_FILE === 'string' ? process.env.YUSHEN_MOOD_FILE.trim() : ''
  const limitations = [...READ_ONLY_LIMITS]
  const probed = []

  // 大鱼默认不继承小鱼的心情：要么显式给心情文件，要么显式指定 B 站状态目录。
  if (r === 'dayu' && !envFile && !biliEnv) {
    return {
      ok: false,
      source: null,
      role: r,
      value: null,
      at: null,
      history: [],
      policy: null,
      probed: [],
      limitations: [...limitations, DAYU_NO_MAPPING],
    }
  }

  const biliDir = biliEnv || path.join(home, 'bili-duty')
  const biliLabel = biliEnv ? 'bili:BILI_STATE_DIR' : 'bili:DSH_HOME/bili-duty'

  const books = []
  if (envFile) {
    books.push({
      book: 'env',
      mood: { source: 'env:YUSHEN_MOOD_FILE', file: envFile, explicit: true },
      history: { source: 'env:mood-history.jsonl', file: path.join(path.dirname(envFile), 'mood-history.jsonl') },
    })
  }
  books.push({
    book: 'dsh',
    mood: { source: 'dsh:dayu/mood.json', file: path.join(home, 'dayu', 'mood.json') },
    history: { source: 'dsh:dayu/mood-history.jsonl', file: path.join(home, 'dayu', 'mood-history.jsonl') },
  })
  books.push({
    book: 'bili',
    mood: { source: `${biliLabel}/mood.json`, file: path.join(biliDir, 'mood.json') },
    history: { source: `${biliLabel}/mood-history.jsonl`, file: path.join(biliDir, 'mood-history.jsonl') },
  })

  let picked = null
  for (const book of books) {
    probed.push(book.mood.source)
    const found = readMoodCandidate(book.mood)
    if (found.ok) {
      picked = {
        book: book.book,
        current: { value: found.value, at: found.at, reason: found.reason || '', note: found.note || '', source: book.mood.source },
      }
      break
    }
    if (found.explicit) {
      limitations.push(
        found.reason === 'missing'
          ? '环境变量 YUSHEN_MOOD_FILE 指向的文件不存在，已回退到本地探测'
          : '环境变量 YUSHEN_MOOD_FILE 指向的文件读不到，已回退到本地探测',
      )
    }

    probed.push(book.history.source)
    const rows = readHistoryCandidate(book.history)
    if (rows.length) {
      const last = rows[rows.length - 1]
      picked = { book: book.book, current: { ...last, source: book.history.source } }
      break
    }
  }

  if (!picked) {
    limitations.push('没找到可用的外部心情数据（探测：YUSHEN_MOOD_FILE / DSH_HOME/dayu / BILI_STATE_DIR 或 DSH_HOME/bili-duty）')
    return {
      ok: false,
      source: null,
      role: r,
      value: null,
      at: null,
      history: [],
      policy: null,
      probed,
      limitations,
    }
  }

  // 历史只从命中的同一本里读；没有任何历史文件时，至少把当前值当作一条。
  let history = readHistoryCandidate(books.find((book) => book.book === picked.book).history)
  if (!history.length) {
    history = [{ ...picked.current }]
  }

  // mood.json 本身没有 reason/note 时，用同一本历史里最后一条的说明当观察来源理由。
  const latest = history[history.length - 1]
  const reason = safeText(picked.current.reason || (latest && latest.reason) || '', MAX_EXTERNAL_REASON)
  const note = safeText(picked.current.note || (latest && latest.note) || '', MAX_EXTERNAL_NOTE)

  history.sort((a, b) => {
    if (!a.at && !b.at) return 0
    if (!a.at) return -1
    if (!b.at) return 1
    return a.at < b.at ? -1 : a.at > b.at ? 1 : 0
  })
  const recent = history.slice(-MAX_HISTORY)

  return {
    ok: true,
    source: picked.current.source,
    book: picked.book,
    role: r,
    value: picked.current.value,
    at: picked.current.at,
    reason,
    note,
    history: recent,
    policy: moodPolicy(picked.current.value),
    probed,
    limitations,
  }
}

// ---------- 鱼神自己的状态（只写本地） ----------

export function stateFile(role) {
  return path.join(dayuDir(), 'state', `${assertRole(role)}.json`)
}

export function diaryFile(role, book = 'private') {
  const r = assertRole(role)
  const b = assertBook(book)
  const root = path.join(dayuDir(), 'diary')
  const file = path.join(root, r, `${b}.jsonl`)
  // 双保险：白名单已经挡住穿越，这里再确认一次结果确实落在 diary 根目录下。
  const prefix = root + path.sep
  if (!file.startsWith(prefix)) throw new Error(`日记路径越界：${file}`)
  return file
}

function readStateRaw(role) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(role), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * 读鱼神自己的状态。文件不存在时返回默认值：mood=50 / expression=平静 / lastReason='' / updatedAt=null。
 * 已知字段会被清洗；文件里其他人写的字段（比如 persona）原样带回，不会被这里抹掉。
 */
export function readFishState(role) {
  const r = assertRole(role)
  const base = { ...DEFAULT_STATE, role: r, exists: false }
  const stored = readStateRaw(r)
  if (!stored) return base

  const state = { ...base, ...stored, role: r, exists: true }
  state.mood = clampMood(stored.mood) == null ? DEFAULT_STATE.mood : clampMood(stored.mood)
  state.expression = safeText(stored.expression, MAX_EXPRESSION) || DEFAULT_STATE.expression
  state.lastReason = safeText(stored.lastReason, MAX_REASON)
  state.updatedAt = typeof stored.updatedAt === 'string' ? stored.updatedAt : null
  return state
}

/**
 * 写鱼神自己的状态。只接受 mood / expression / lastReason；`note` 记进 notes。
 * 不写外部数据；文件里原有的其他字段（persona 等）保留。
 */
export function recordFishState(role, patch = {}, { note = '' } = {}) {
  const r = assertRole(role)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('patch 必须是对象（只写 mood / expression / lastReason）')
  }
  const keys = Object.keys(patch)
  for (const key of keys) {
    if (!STATE_WRITE_FIELDS.includes(key)) {
      throw new Error(`不能写 ${key}：鱼神状态只接受 ${STATE_WRITE_FIELDS.join(' / ')}`)
    }
  }
  const noteText = safeText(note, MAX_NOTE)
  if (!keys.length && !noteText) {
    throw new Error('没有要写的内容（patch 为空且没有 note）')
  }

  const now = nowIso()
  const stored = readStateRaw(r) || {}
  const next = { ...stored, role: r, updatedAt: now }

  if ('mood' in patch) {
    const mood = clampMood(patch.mood)
    if (mood == null) throw new Error('mood 必须是 0~100 之间的数字')
    next.mood = mood
  }
  if ('expression' in patch) {
    next.expression = safeText(patch.expression, MAX_EXPRESSION) || DEFAULT_STATE.expression
  }
  if ('lastReason' in patch) {
    next.lastReason = safeText(patch.lastReason, MAX_REASON)
  }
  if (noteText) {
    const prev = Array.isArray(stored.notes) ? stored.notes : []
    next.notes = [...prev, { at: now, note: noteText }].slice(-MAX_NOTES)
  }

  const file = stateFile(r)
  writeJsonAtomic(file, next)
  return { ok: true, role: r, file, state: readFishState(r) }
}

/**
 * 写一篇日记：~/.dsh/dayu/diary/<role>/<book>.jsonl，一行一条。
 * entry 可以是字符串，或 { text, category, source, at }；文本长度上限见 MAX_DIARY_TEXT。
 */
export function appendFishDiary(role, entry, book = 'private') {
  const r = assertRole(role)
  const b = assertBook(book)

  let text = ''
  let category = 'note'
  let source = 'self'
  let at = null

  if (typeof entry === 'string') {
    text = entry
  } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    text = entry.text != null ? entry.text : entry.note != null ? entry.note : ''
    if (entry.category != null) category = entry.category
    if (entry.source != null) source = entry.source
    at = normalizeAt(entry.at)
  } else {
    throw new Error('日记内容必须是字符串或 { text, category, source, at } 对象')
  }

  const body = safeText(text, MAX_DIARY_TEXT)
  if (!body) throw new Error('日记正文不能为空')

  const row = {
    role: r,
    source: safeText(source, MAX_SOURCE) || 'self',
    at: at || nowIso(),
    text: body,
    category: safeText(category, MAX_CATEGORY) || 'note',
    book: b,
  }

  const file = diaryFile(r, b)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')
  return { ok: true, role: r, book: b, file, row }
}

function normalizeSnapshot(external) {
  if (!external || typeof external !== 'object') return { ok: false }
  if (external.ok === false) return { ok: false }
  const value = clampMood(external.value != null ? external.value : external.mood)
  if (value == null) return { ok: false }
  return {
    ok: true,
    value,
    at: normalizeAt(external.at) || null,
    source: safeText(external.source, MAX_SOURCE) || 'external',
    reason: safeText(external.reason, MAX_EXTERNAL_REASON),
    note: safeText(external.note, MAX_EXTERNAL_NOTE),
    policy: external.policy && typeof external.policy === 'object' ? external.policy : moodPolicy(value),
  }
}

/**
 * 把外部心情当“观察”记进鱼神状态：
 * 只写 observation / observations / updatedAt，**不动** mood / expression / lastReason，
 * 更不碰 persona；不调模型。external 传 readExternalMood() 的返回值即可。
 * 去重：最新一条观察的 source/value/at 与本条一致时直接返回 deduped，不写盘、不动 updatedAt。
 */
export function applyMoodSnapshot(role, external) {
  const r = assertRole(role)
  const snapshot = normalizeSnapshot(external)
  if (!snapshot.ok) {
    return {
      ok: false,
      role: r,
      reason: '外部心情不可用（ok=false 或没有 value）',
      observation: null,
      state: readFishState(r),
    }
  }

  const stored = readStateRaw(r) || {}
  const last = stored.observation
  if (
    last
    && last.mood === snapshot.value
    && safeText(last.source, MAX_SOURCE) === snapshot.source
    && (normalizeAt(last.at) || null) === snapshot.at
  ) {
    return { ok: true, role: r, deduped: true, file: stateFile(r), observation: last, state: readFishState(r) }
  }

  const now = nowIso()
  const observation = {
    mood: snapshot.value,
    level: snapshot.policy && snapshot.policy.level ? snapshot.policy.level : null,
    at: snapshot.at,
    source: snapshot.source,
    reason: snapshot.reason,
    note: snapshot.note,
    appliedAt: now,
  }
  const prev = Array.isArray(stored.observations) ? stored.observations : []
  const next = {
    ...stored,
    role: r,
    updatedAt: now,
    observation,
    observations: [...prev, observation].slice(-MAX_OBSERVATIONS),
  }

  const file = stateFile(r)
  writeJsonAtomic(file, next)
  return { ok: true, role: r, deduped: false, file, observation, state: readFishState(r) }
}
