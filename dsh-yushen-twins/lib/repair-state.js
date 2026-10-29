// Repair lifecycle state: append-only evidence plus an atomic snapshot.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export const DEFAULT_TIMEOUT_MS = 60_000
export const MAX_ID = 128
export const MAX_EVIDENCE = 96

function home() { return process.env.DSH_HOME || path.join(os.homedir(), '.dsh') }
function dir() { return path.join(home(), 'dayu', 'repair') }
export function ledgerPath() { return path.join(dir(), 'ledger.jsonl') }
export function statePath() { return path.join(dir(), 'state.json') }

function iso(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new TypeError(`${field} must be canonical ISO-8601 UTC`) 
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) throw new TypeError(`invalid ${field}`)
  return value
}

function id(value, field = 'launchId') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new TypeError(`invalid ${field}`)
  return value
}
function pid(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('pid must be a positive integer')
  return value
}
function evidence(value, fallback = 'unspecified') {
  const text = value == null ? fallback : String(value).trim()
  if (!text) return fallback
  // Keep only a bounded category. Raw exceptions, paths, and stacks never enter the ledger.
  const category = text.split(/[\s/\\\n\r]+/, 1)[0].replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, MAX_EVIDENCE)
  return category || fallback
}
function solution(value) { return id(value, 'solutionId') }
function key(launchId, solutionId) { return `${launchId}\u0000${solutionId}` }
function empty() { return { version: 1, sessions: {}, attempts: {}, circuits: {}, eventIds: {} } }

function readEvents() {
  let text
  try { text = fs.readFileSync(ledgerPath(), 'utf8') } catch (err) {
    if (err?.code === 'ENOENT') return []
    throw err
  }
  const events = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    let event
    try { event = JSON.parse(line) } catch { throw new Error('repair ledger contains invalid JSON') }
    if (!event || typeof event !== 'object' || typeof event.eventId !== 'string' || typeof event.type !== 'string') throw new Error('repair ledger contains invalid event')
    events.push(event)
  }
  return events
}
function replay() {
  const state = empty()
  for (const event of readEvents()) {
    if (state.eventIds[event.eventId]) continue
    state.eventIds[event.eventId] = true
    const s = event.launchId && state.sessions[event.launchId]
    if (event.type === 'begin') {
      if (!s) state.sessions[event.launchId] = { launchId: event.launchId, pid: event.pid, at: event.at, status: 'running', observations: [] }
    } else if (event.type === 'observe' && s && s.status === 'running') {
      s.pid = event.pid
      s.lastObservedAt = event.at
      s.observations.push({ pid: event.pid, at: event.at })
      if (s.observations.length > 20) s.observations.shift()
    } else if ((event.type === 'manual-close' || event.type === 'automatic-close') && s && s.status === 'running') {
      s.status = event.type === 'manual-close' ? 'manual-exit' : 'automatic-exit'
      s.closedAt = event.at
      s.reason = event.reason
      s.signature = evidence(event.reason, event.type)
    } else if (event.type === 'attempt') {
      const k = key(event.launchId, event.solutionId)
      if (!state.attempts[k]) state.attempts[k] = { launchId: event.launchId, solutionId: event.solutionId, result: event.result, signature: event.signature, at: event.at }
      if (event.result === 'failure') state.circuits[`${event.solutionId}\u0000${event.signature}`] = { solutionId: event.solutionId, signature: event.signature, at: event.at }
    }
  }
  return state
}
function snapshot(state) {
  fs.mkdirSync(dir(), { recursive: true })
  const file = statePath()
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
  fs.writeFileSync(tmp, `${JSON.stringify({ ...state, eventIds: undefined }, null, 2)}\n`, 'utf8')
  try { fs.renameSync(tmp, file) } catch (err) { try { fs.rmSync(tmp, { force: true }) } catch {} ; throw err }
}
function append(type, data) {
  const event = { eventId: crypto.randomUUID(), type, ...data }
  fs.mkdirSync(dir(), { recursive: true })
  fs.appendFileSync(ledgerPath(), `${JSON.stringify(event)}\n`, 'utf8')
  snapshot(replay())
  return event
}
function sessionOrThrow(state, launchId) {
  const s = state.sessions[launchId]
  if (!s) throw new Error(`unknown launchId: ${launchId}`)
  return s
}
function activeSignature(state, launchId) {
  const s = sessionOrThrow(state, launchId)
  return evidence(s.signature || s.reason || 'crash-unknown', 'crash-unknown')
}

export function beginSession({ pid: processId, at, launchId } = {}) {
  const l = id(launchId); const p = pid(processId); const a = iso(at, 'at'); const state = replay()
  if (state.sessions[l]) throw new Error(`launch already exists: ${l}`)
  append('begin', { launchId: l, pid: p, at: a })
  return replay().sessions[l]
}
export function markManualClose({ launchId, at, reason } = {}) { return close('manual-close', launchId, at, reason) }
export function markAutomaticClose({ launchId, at, reason } = {}) { return close('automatic-close', launchId, at, reason) }
function close(type, launchId, at, reason) {
  const l = id(launchId); const a = iso(at, 'at'); const state = replay(); const s = sessionOrThrow(state, l)
  if (s.status !== 'running') throw new Error(`launch already closed: ${l}`)
  append(type, { launchId: l, at: a, reason: evidence(reason, type) })
  return replay().sessions[l]
}
export function observeLaunch({ launchId, pid: processId, at } = {}) {
  const l = id(launchId); const p = pid(processId); const a = iso(at, 'at'); const state = replay(); const s = sessionOrThrow(state, l)
  if (s.status !== 'running') throw new Error(`launch already closed: ${l}`)
  append('observe', { launchId: l, pid: p, at: a })
  return replay().sessions[l]
}
export function classify({ launchId, now, pidAlive, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const l = id(launchId); const n = iso(now, 'now'); const state = replay(); const s = sessionOrThrow(state, l)
  if (s.status !== 'running') return s.status
  if (typeof pidAlive !== 'boolean') throw new TypeError('pidAlive must be boolean supplied by caller')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new TypeError('timeoutMs must be a non-negative integer')
  const elapsed = Date.parse(n) - Date.parse(s.at)
  return elapsed >= timeoutMs && pidAlive === false ? 'crash-suspected' : 'unknown'
}

export function canApply(solutionId, options = {}) {
  const sol = solution(solutionId); const launchId = id(options.launchId); const classification = options.classification || classify(options)
  if (classification !== 'crash-suspected') return { allow: false, reason: 'classification-not-crash-suspected' }
  const state = replay(); const signature = evidence(options.signature || activeSignature(state, launchId), 'crash-unknown')
  if (state.attempts[key(launchId, sol)]) return { allow: false, reason: 'attempt-already-recorded', signature }
  if (state.circuits[`${sol}\u0000${signature}`]) return { allow: false, reason: 'circuit-open', signature }
  return { allow: true, signature }
}
export function recordAttempt({ launchId, solutionId, at, result, signature, classification, healthConfirmed = false } = {}) {
  const l = id(launchId); const sol = solution(solutionId); const a = iso(at, 'at');
  if (result !== 'success' && result !== 'failure') throw new TypeError('result must be success or failure')
  const state = replay(); sessionOrThrow(state, l)
  const sig = evidence(signature || activeSignature(state, l), 'crash-unknown')
  const k = key(l, sol)
  if (state.attempts[k]) throw new Error(`attempt already recorded: ${l}/${sol}`)
  if (classification !== 'crash-suspected') throw new Error('recordAttempt requires explicit crash-suspected classification')
  const decision = canApply(sol, { launchId: l, classification, signature: sig })
  if (!decision.allow) throw new Error(`attempt denied: ${decision.reason}`)
  if (result === 'success' && healthConfirmed !== true) throw new Error('success requires external health confirmation')
  append('attempt', { launchId: l, solutionId: sol, at: a, result, signature: sig })
  return replay().attempts[k]
}
export function readRepairState() { return replay() }
