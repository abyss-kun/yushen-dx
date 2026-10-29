// Recall Bilibili raw facts by trusted source scope. This is source context, not a mind item.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

// 角色从名册读，别写死（2026-10-27：接入第 4 个人要自动有效）
import { characterIds } from './characters.js'
function hasRole(r) { try { return characterIds().includes(String(r)) } catch { return false } }
const KINDS = new Set(['video', 'comment', 'subtitle', 'frame', 'private', 'duty'])
function fileOf(role, conversationId) {
  const digest = crypto.createHash('sha256').update(conversationId).digest('hex')
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'conversations', role, 'bili', `${digest}.jsonl`)
}
function trustedScope(scope) {
  if (!scope || scope.channel !== 'bili' || !hasRole(scope.role) || !['private', 'group'].includes(scope.audience)) throw new Error('B站召回要求可信角色、bili通道和明确受众')
  const conversationId = String(scope.conversationId || '')
  const prefix = conversationId.split(':', 1)[0]
  if (!conversationId || conversationId.length > 240 || !KINDS.has(prefix)) throw new Error('B站conversationId来源粒度非法')
  return { channel: 'bili', role: scope.role, conversationId, audience: scope.audience }
}
export function recallBiliFacts(scope, { text = '', limit = 12 } = {}) {
  const s = trustedScope(scope)
  const file = fileOf(s.role, s.conversationId)
  let rows = []
  try { rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const q = String(text || '').trim().toLowerCase()
  const cap = Math.max(1, Math.min(50, Number(limit) || 12))
  const selected = q ? rows.filter((row) => `${row.text} ${row.speaker}`.toLowerCase().includes(q)) : rows
  return selected.slice(-cap).map((row) => ({
    role: s.role, channel: 'bili', conversationId: s.conversationId, audience: s.audience,
    direction: row.direction, messageId: String(row.messageId || ''), quote: row.text, speaker: row.speaker || '', at: row.at,
    mediaRefs: Array.isArray(row.mediaRefs) ? row.mediaRefs : [], source: row.source || 'bili-conversation', semantics: row.semantics || 'raw-fact',
  }))
}
