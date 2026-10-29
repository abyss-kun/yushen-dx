// 原始对话事实档案：按角色/通道/会话隔离。存储不等于理解；不调用模型。
import fs from 'node:fs'
import { characterIds } from './characters.js'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
function scope({ role, channel, conversationId }) {
  if (!characterIds().includes(String(role))) throw new TypeError('非法角色')
  if (!['workbench', 'qq', 'bili'].includes(channel)) throw new TypeError('非法通道')
  if (typeof conversationId !== 'string' || !conversationId.trim() || conversationId.length > 512) throw new TypeError('非法会话')
  return { role, channel, conversationId }
}
function fileOf(s) {
  const key = createHash('sha256').update(s.conversationId).digest('hex')
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'conversations', s.role, s.channel, `${key}.jsonl`)
}
export function listConversationEvents(input, { limit = 50 } = {}) {
  const s = scope(input)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TypeError('读取上限必须为1到200')
  let text
  try { text = fs.readFileSync(fileOf(s), 'utf8') } catch (e) { if(e.code === 'ENOENT') return []; throw e }
  const rows = text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  for (const row of rows) if (row.role !== s.role || row.channel !== s.channel || row.conversationId !== s.conversationId) throw new Error('会话隔离验证失败')
  return rows.slice(-limit)
}
export function appendConversationEvent(input) {
  const s = scope(input)
  const { direction, messageId, text, at = new Date().toISOString(), kind = 'text', meta = null } = input
  if (!['incoming','outgoing'].includes(direction)) throw new TypeError('非法消息方向')
  if (typeof messageId !== 'string' || !messageId || messageId.length > 256) throw new TypeError('必须提供稳定消息标识')
  if (typeof text !== 'string' || !text.trim() || text.length > 100000) throw new TypeError('非法消息原文')
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) throw new TypeError('非法时间')
  // 去重检查整个会话，不能只查最近一页。
  const file = fileOf(s)
  let prior = []
  try { prior = fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(JSON.parse) } catch(e) { if(e.code !== 'ENOENT') throw e }
  for (const row of prior) {
    if (row.role !== s.role || row.channel !== s.channel || row.conversationId !== s.conversationId) throw new Error('会话隔离验证失败')
    if (row.direction === direction && row.messageId === messageId) {
      if (row.text !== text) throw new Error('同一消息标识内容冲突')
      return { ...row, duplicate: true }
    }
  }
  if (typeof kind !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(kind)) throw new TypeError('非法消息类型')
  if (meta !== null && (typeof meta !== 'object' || Array.isArray(meta))) throw new TypeError('非法消息元数据')
  const row = { version:1, ...s, direction, messageId, text, at, kind, meta, semantics: 'not-analyzed', visibility: 'conversation-private' }
  fs.mkdirSync(path.dirname(file),{recursive:true})
  fs.appendFileSync(file, JSON.stringify(row)+'\n',{encoding:'utf8',mode:0o600})
  return row
}
