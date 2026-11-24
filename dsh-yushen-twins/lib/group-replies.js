// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-group-replies
 * kind: module
 * summary: 群回复关联：只认宿主确认的"同回合内完全一致的用户输入"，绝不按先来先到认领。
 * tags: 群回复, 关联, 不按FIFO
 * created: 2026-11-11 01:25:00
 * changed: 2026-11-11 01:25:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 群路由、维护者
 * owner: 框架；**不按 FIFO** 这条不许破
 * mutable: 可改匹配；只许更严
 * usage: 拿到宿主确认的输入 → markReplied；不确定就不认
 * why: 按先来先到会把"回 A 的"记成"回 B 的"
 * result: 一条保守的关联规则
 */
// Correlate only host-confirmed exact user inputs within a turn. Never claim by FIFO.
import { markReplied } from './group-outbox.js'

export function createGroupReplies({ append, incident = () => {} }) {
  const pending = new Map(), active = new Map()
  const key = (sid, turn) => `${sid}:${turn}`
  return {
    register(sid, entry) { const rows = pending.get(sid) || []; rows.push(entry); pending.set(sid, rows); return entry },
    cancel(sid, entry) { const rows = (pending.get(sid) || []).filter(x => x !== entry); if (rows.length) pending.set(sid, rows); else pending.delete(sid) },
    event(sid, event, text) {
      const turn = event.data?.turn
      if (event.type === 'turn/start' && Number.isInteger(turn)) active.set(sid, { turn, entry: null, text: '' })
      const state = active.get(sid)
      if (!state) return false
      if (event.type === 'user/message') {
        const entry = (pending.get(sid) || []).find(x => x.prompt === text)
        if (entry) { state.entry = entry; this.cancel(sid, entry) }
      }
      if (!state.entry || (Number.isInteger(turn) && turn !== state.turn)) return false
      if (event.type === 'assistant/message' && text && !event.data?.interrupted) state.text = text
      if (event.type === 'turn/end') {
        if (state.text) {
          try {
            append({ role: state.entry.role, channel: 'workbench', conversationId: state.entry.conversationId, direction: 'outgoing', messageId: `reply-${state.entry.messageId}-${state.turn}`, text: state.text })
            if (state.entry.nonce) { try { markReplied({ conversationId: state.entry.conversationId, messageId: state.entry.messageId, role: state.entry.role }) } catch { /* 账写不了不影响回显 */ } }
          }
          catch (error) { incident({ sessionId: sid, text: `群聊回复落盘失败：${error.message}` }); return true }
        }
        active.delete(sid)
      }
      return true
    },
  }
}
