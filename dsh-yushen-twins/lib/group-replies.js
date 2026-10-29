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
