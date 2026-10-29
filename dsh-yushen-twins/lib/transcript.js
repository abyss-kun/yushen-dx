// 全知·会话正文：DSH 没给聊天接口，但会话按行落在
// ~/.dsh/sessions/<工作区>/<会话>/session.v4.jsonl.zstd。
// 这里只读、增量、带审计——不解密、不改写、不外传。
//
// 关键实现：
//   · 会话文件是「一行一帧 zstd」，帧头 28 B5 2F FD；Node 的 zstdDecompressSync
//     只解第一帧，所以按帧头切开再逐帧解。
//   · 每个文件记住已消费到的字节偏移（consumed），下次只读新增部分；
//     文件被截断/替换时自动从头再来。
//   · 只留 user/message、assistant/message、session/title 三类事件，内存有上限。
//   · 桥接的提示词里正文在「【主人刚说】…【场合】」之间；普通会话去掉
//     <system-reminder> 块。其余原样截断，不做语义加工。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { recordAction } from './actionlog.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const ROOT = process.env.DSH_SESSIONS_ROOT || path.join(HOME, 'sessions')
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const MAX_EVENTS = 600
const MAX_TEXT = 800

const cache = new Map()   // file -> { consumed, events, title, mtimeMs }
const fileIndex = { at: 0, map: new Map() }

function magicOffsets(buffer) {
  const out = []
  for (let i = 0; i + 3 < buffer.length; i += 1) {
    if (buffer[i] === MAGIC[0] && buffer[i + 1] === MAGIC[1]
      && buffer[i + 2] === MAGIC[2] && buffer[i + 3] === MAGIC[3]) out.push(i)
  }
  return out
}

function textOf(content, { onlyText = false } = {}) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((item) => item && typeof item.text === 'string' && (!onlyText || item.type === 'text'))
    .map((item) => item.text)
    .join(' ')
}

function cleanUser(text) {
  let s = String(text || '')
  const current = /【主人刚说】([\s\S]*?)(?:\n【场合】|$)/.exec(s)
  if (current) s = current[1]
  else s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

function pushEvent(state, raw) {
  const type = raw?.type
  if (type === 'session/title') {
    const title = raw?.data?.title || raw?.data?.text
    if (title) state.title = String(title).slice(0, 120)
    return
  }
  if (type === 'user/message') {
    const text = cleanUser(textOf(raw?.data?.content))
    if (text) state.events.push({ role: 'user', at: Number(raw.time) || 0, text })
  } else if (type === 'assistant/message') {
    const text = textOf(raw?.data?.message?.content, { onlyText: true }).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
    if (text) state.events.push({ role: 'assistant', at: Number(raw.time) || 0, text })
  }
  if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-Math.floor(MAX_EVENTS / 2))
}

/** 增量读取一个会话文件；返回内部状态。 */
function refresh(file) {
  let state = cache.get(file)
  if (!state) {
    state = { consumed: 0, events: [], title: '', mtimeMs: 0 }
    cache.set(file, state)
  }
  let st
  try { st = fs.statSync(file) } catch { return state }
  state.mtimeMs = st.mtimeMs
  if (st.size < state.consumed) {   // 被截断/替换：从头再来
    state.consumed = 0
    state.events = []
    state.title = ''
  }
  if (st.size <= state.consumed) return state

  const start = state.consumed
  const length = st.size - start
  const buffer = Buffer.alloc(length)
  const fd = fs.openSync(file, 'r')
  try { fs.readSync(fd, buffer, 0, length, start) } finally { fs.closeSync(fd) }

  const offs = magicOffsets(buffer)
  if (!offs.length) return state
  let consumed = start
  for (let i = 0; i < offs.length; i += 1) {
    const begin = offs[i]
    const end = i + 1 < offs.length ? offs[i + 1] : buffer.length
    let text
    try { text = zlib.zstdDecompressSync(buffer.subarray(begin, end)).toString('utf8') } catch {
      // 最后一帧可能正在写；停在这里，下次从这一帧重试。
      break
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      try { pushEvent(state, JSON.parse(line)) } catch { /* 半行跳过 */ }
    }
    consumed = start + end
  }
  state.consumed = consumed
  return state
}

/** 建会话 id → 文件 的索引（默认缓存 3 秒）。 */
function indexSessions(force = false) {
  if (!force && Date.now() - fileIndex.at < 3000 && fileIndex.map.size) return fileIndex.map
  const map = new Map()
  let workspaces = []
  try { workspaces = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()) } catch { /* 没有会话目录 */ }
  for (const ws of workspaces) {
    let sessions = []
    try { sessions = fs.readdirSync(path.join(ROOT, ws.name), { withFileTypes: true }).filter((d) => d.isDirectory()) } catch { continue }
    for (const session of sessions) {
      const file = path.join(ROOT, ws.name, session.name, 'session.v4.jsonl.zstd')
      try { fs.accessSync(file) } catch { continue }
      map.set(session.name.replace(/^session-/, ''), { file, workspace: ws.name })
    }
  }
  fileIndex.at = Date.now()
  fileIndex.map = map
  return map
}

export function sessionsRoot() {
  return ROOT
}

/** 最近写过文件的会话（含已经结束的）。 */
export function recentSessions(limit = 12) {
  const map = indexSessions(true)
  const rows = []
  for (const [id, row] of map) {
    try {
      const st = fs.statSync(row.file)
      rows.push({ id, workspace: row.workspace, mtime: st.mtimeMs, bytes: st.size })
    } catch { /* 文件没了 */ }
  }
  rows.sort((a, b) => b.mtime - a.mtime)
  return rows.slice(0, Math.max(1, Math.min(50, Number(limit) || 12)))
}

/** 取一个会话的最近 n 条消息（user / assistant）。 */
export function transcriptDigest(sessionId, { turns = 20 } = {}) {
  // 调用方可能带 "session-" 前缀（DSH 的 header.id），索引里是去掉前缀的。
  const id = String(sessionId || '').trim().replace(/^session-/, '')
  if (!id) return { ok: false, error: 'id 不能为空' }
  const entry = indexSessions().get(id)
  if (!entry) return { ok: false, error: `没找到会话 ${id}` }
  const state = refresh(entry.file)
  const n = Math.max(1, Math.min(60, Number(turns) || 20))
  const sliced = state.events.slice(-n)
  let st = null
  try { st = fs.statSync(entry.file) } catch { /* 刚被删 */ }
  recordAction({
    kind: 'transcript',
    path: id,
    method: 'READ',
    status: 200,
    ok: true,
    note: `${sliced.length} 条 · ${entry.workspace}`,
  })
  return {
    ok: true,
    id,
    title: state.title || '',
    workspace: entry.workspace,
    mtime: st ? st.mtimeMs : state.mtimeMs,
    total: state.events.length,
    turns: sliced.map((row) => ({ ...row, at: row.at ? new Date(row.at).toISOString() : '' })),
  }
}

/** 预热/清理：不让缓存无限长。 */
export function pruneCache(max = 40) {
  if (cache.size <= max) return cache.size
  const rows = [...cache.entries()].sort((a, b) => (b[1].mtimeMs || 0) - (a[1].mtimeMs || 0))
  for (const [file] of rows.slice(max)) cache.delete(file)
  return cache.size
}
