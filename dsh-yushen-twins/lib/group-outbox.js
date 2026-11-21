// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-group-outbox
 * kind: module
 * summary: 群聊投递账：谁什么时候被投过哪条群消息、有没有回音；宿主路由与补投脚本共用一份。
 * tags: 群投递, 去重, 补投
 * created: 2026-11-11 01:25:00
 * changed: 2026-11-11 01:25:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 宿主路由、补投脚本、维护者
 * owner: 框架；**一份账两处共用**，不许各记各的
 * mutable: 可改字段；不许把同一句投两遍
 * usage: recordSend/markReplied/list → 投递与回音
 * why: 补投脚本和路由各记一份，会重复投
 * result: 一份共享的投递账
 */
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
