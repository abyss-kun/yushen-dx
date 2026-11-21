/* 标签
 * id: memory-core-source
 * kind: module
 * summary: 本源存储：WAL 写入、按轮归档 raw、会话清单 session.json；不碰投影。
 * tags: 本源, WAL, raw, session.json, 共享核心
 * created: 2026-11-12 23:15:00
 * changed: 2026-11-12 23:15:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份；本源要单独看得见）
 * audience: turn-capture、恢复器、维护
 * owner: 框架；本源只增不改，删要走墓碑
 * mutable: 可改；改路径/格式要先想恢复
 * usage: walFile(home,sid,turn) / archiveWal(home,sid,turn) / updateSession(home,sid,info)
 * why: 以前本源逻辑埋在 turn-capture 闭包里，名字都看不见
 * result: 本源在目录上单独一层；投影写不写都不影响它
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dataRoot } from './root.js'

export function walDir(home) { return path.join(dataRoot(home), 'live', '.wal') }
export function walFile(home, sid, turn) { return path.join(walDir(home), String(sid), `${turn}.jsonl`) }
export function rawDir(home, sid) { return path.join(dataRoot(home), 'live', 'raw', String(sid)) }
export function rawFile(home, sid, turn) { return path.join(rawDir(home, sid), `${Number(turn) || 0}.jsonl`) }
export function sessionFile(home, sid) { return path.join(rawDir(home, sid), 'session.json') }

export function appendWal(home, sid, turn, event, eventKey) {
  try {
    const file = walFile(home, sid, turn)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // 全量落：工具结果不截断。WAL 是“未提交轮的原始事件”，提交后归档到 live/raw。
    fs.appendFileSync(file, `${JSON.stringify({ eventKey, type: event.type, seq: event.seq, time: event.time, data: event.data })}\n`, 'utf8')
  } catch { /* WAL 写不了还能在内存里落 */ }
}

export function writeWalHead(home, sid, turn, meta) {
  try {
    const file = walFile(home, sid, turn)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (fs.existsSync(file)) return
    fs.writeFileSync(file, `${JSON.stringify({ _meta: { schemaVersion: 2, ...meta } })}\n`, 'utf8')
  } catch { /* 没头也能补，只是标题会丢 */ }
}

export function archiveWal(home, sid, turn) {
  const src = walFile(home, sid, turn)
  let buf = null
  try { buf = fs.readFileSync(src) } catch { return null }
  if (!buf.length) return null
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
  const dir = rawDir(home, sid)
  fs.mkdirSync(dir, { recursive: true })
  let file = path.join(dir, `${turn}.jsonl`)
  if (fs.existsSync(file)) {
    const old = fs.readFileSync(file)
    const oldHash = crypto.createHash('sha256').update(old).digest('hex').slice(0, 16)
    if (oldHash === hash) return { file, hash, skipped: true }
    file = path.join(dir, `${turn}.${hash.slice(0, 8)}.jsonl`)
    if (fs.existsSync(file)) return { file, hash, skipped: true }
  }
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, file)
  return { file, hash, skipped: false }
}

export function updateSession(home, sid, { role = '', cwd = '', title = '', startedAt = 0, endedAt = 0, turn = 0, status = '', rawFile: raw = '', bytes = 0 } = {}) {
  const file = sessionFile(home, sid)
  let doc = null
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { doc = null }
  if (!doc || typeof doc !== 'object') doc = { schemaVersion: 2, sessionId: sid, startedAt: '', endedAt: '', turns: [] }
  if (!Array.isArray(doc.turns)) doc.turns = []
  const iso = (ms) => (ms ? new Date(ms).toISOString() : '')
  if (startedAt && (!doc.startedAt || startedAt < Date.parse(doc.startedAt))) doc.startedAt = iso(startedAt)
  if (endedAt && (!doc.endedAt || endedAt > Date.parse(doc.endedAt))) doc.endedAt = iso(endedAt)
  if (role) doc.role = role
  if (cwd) doc.cwd = cwd
  if (title) doc.title = title
  const row = { turn, startedAt: iso(startedAt), endedAt: iso(endedAt), status, rawFile: raw ? path.relative(dataRoot(home), raw).replace(/\\/g, '/') : '', bytes: Number(bytes) || 0 }
  const i = doc.turns.findIndex((x) => Number(x.turn) === Number(turn))
  if (i >= 0) doc.turns[i] = { ...doc.turns[i], ...row }
  else doc.turns.push(row)
  doc.turns.sort((a, b) => Number(a.turn) - Number(b.turn))
  doc.updatedAt = new Date().toISOString()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  } catch { /* 清单写不了不影响轮 */ }
}
