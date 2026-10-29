// 群聊投递账：谁在什么时候被投过哪条群消息、有没有回音。
// 宿主路由与补投脚本共用这一份，避免同一句话被投两遍。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = path.join(HOME, 'dayu', 'group-deliveries.json')

export function readOutbox() {
  try {
    const o = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return { version: 1, sent: o && typeof o.sent === 'object' && o.sent ? o.sent : {} }
  } catch { return { version: 1, sent: {} } }
}

function write(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, sent: state.sent || {} }, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, FILE)
}

/** 记一条已投递；同一 (会话, 消息, 角色) 已有回音时不覆盖。 */
export function markQueued({ conversationId, messageId, role, sessionId, nonce, via = 'route', at = new Date().toISOString() }) {
  if (!conversationId || !messageId || !role) throw new TypeError('投递账缺参数')
  const state = readOutbox()
  const key = `${conversationId}|${messageId}|${role}`
  const prev = state.sent[key] || {}
  state.sent[key] = { ...prev, at, nonce: nonce || prev.nonce || '', sessionId, via, replyAt: prev.replyAt || '' }
  write(state)
  return state.sent[key]
}

export function markReplied({ conversationId, messageId, role, at = new Date().toISOString() }) {
  const state = readOutbox()
  const key = `${conversationId}|${messageId}|${role}`
  const prev = state.sent[key]
  if (!prev) return null
  state.sent[key] = { ...prev, replyAt: at }
  write(state)
  return state.sent[key]
}
