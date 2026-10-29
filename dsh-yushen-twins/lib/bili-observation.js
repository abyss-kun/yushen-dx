// B站 source adapter boundary. It stores no mind item by itself and requires explicit role choice.
import { recordObservedMind } from './mind-store.js'
// 角色从名册读（2026-10-27）
import { characterIds } from './characters.js'
function hasRole(r) { try { return characterIds().includes(String(r)) } catch { return false } }
const KINDS = new Set(['interest', 'question'])
function required(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} invalid`)
  return value.trim()
}
export function biliSource(scope, source) {
  if (!scope || scope.channel !== 'bili' || !hasRole(scope.role) || !['private', 'group'].includes(scope.audience)) throw new Error('invalid B站 scope')
  const videoId = required(source?.videoId, 'videoId', 128)
  const quote = required(source?.quote, 'quote', 2000)
  const messageId = required(source?.messageId || `${videoId}:${source?.kind || 'video'}`, 'messageId', 200)
  const kind = String(source?.kind || 'video')
  if (!['video', 'comment', 'subtitle', 'frame', 'private'].includes(kind)) throw new Error('invalid B站 source kind')
  return { role: scope.role, scope: { channel: 'bili', conversationId: `${kind}:${videoId}`, audience: scope.audience }, source: { quote, speaker: String(source?.speaker || 'bilibili').slice(0, 64), messageId, at: source?.at || '' }, media: source?.media || null }
}
export function chooseBiliObservation(event, choice = {}) {
  if (!choice?.kind) return { ok: true, skipped: true, reason: 'no-character-choice' }
  if (!KINDS.has(choice.kind)) throw new Error('only interest/question may be chosen')
  if (!event?.scope || event.scope.channel !== 'bili' || !hasRole(event.role)) throw new Error('trusted B站 event required')
  return recordObservedMind(event.role, { kind: choice.kind, text: required(choice.text, 'choice.text', 280), detail: String(choice.detail || '').slice(0, 2000), scope: event.scope, source: event.source, epistemic: 'inferred', confidence: typeof choice.confidence === 'number' ? choice.confidence : undefined })
}
