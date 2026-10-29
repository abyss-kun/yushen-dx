/**
 * Store-scoped, fail-closed recovery gate. This module NEVER restores files,
 * starts/restarts software, retries recovery, or diagnoses arbitrary crashes.
 *
 * Evidence schema (all fields required, no extras):
 * {integrity:{passed:boolean}, startup:{passed:boolean},
 *  criticalRoutes:{passed:boolean},
 *  window:{startedAt:ISO_UTC_string, endedAt:ISO_UTC_string}}
 * All three passed values must be true. The caller must actually verify snapshot
 * integrity, successful startup and ALL application-defined critical routes;
 * an HTTP 200 alone is NOT this evidence. The observation window must finish in
 * the past and last >= minObservationWindowMs (default 60s). These are explicit
 * trusted-local-caller attestations, not independently verified measurements.
 * configurePolicy changes the persisted minimum (1ms..24h); increasing it makes
 * earlier insufficient evidence candidate again. No quarantine removal API.
 *
 * Immutable, fsynced, hash-chained events are published before beginRecovery
 * returns an intent. The caller MUST await beginRecovery before any disk apply.
 * A pending intent remains unconfirmed across process exits; only an explicit
 * finishRecovery resolves it. Success does not requalify anything. One failure
 * permanently quarantines the snapshot and opens the circuit. resetCircuit is
 * manual acknowledgement only and NEVER clears pending or quarantine.
 *
 * Single local host / cooperative writers only, NO network filesystem support.
 * An exclusive filesystem lock also rejects same-process overlapping calls.
 * A crash during a policy transaction may leave .recovery-policy.lock: fail
 * closed; an operator must verify no writer is alive before removing that lock.
 * Never delete audit events to clear pending/quarantine. Filesystem attackers,
 * concurrent external file mutation and hardware durability loss are out of
 * scope; hashes detect corruption, not a malicious rewrite of the entire log.
 * Store is an authorized local absolute directory supplied by the host, not an
 * authorization token. Do not expose this API directly to untrusted callers.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const SNAP = /^[0-9]{13}-[a-f0-9-]{36}$/ // exactly versioned-backup.js
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const EVENT = /^\d{12}\.json$/
const MAX_EVENT = 64 * 1024
export const DEFAULT_MIN_OBSERVATION_WINDOW_MS = 60_000
const fail = message => { throw new Error(`recovery-policy: ${message}`) }
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail(`invalid ${label} schema`)
}
function options(value, keys) { object(value, keys, 'options'); return value }
function id(value) { if (typeof value !== 'string' || !SNAP.test(value)) fail('invalid snapshot id'); return value }
function reason(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /[\x00-\x1f\x7f]/.test(value)) fail('reason must be nonempty bounded plain text')
  return value
}
function timestamp(value) {
  if (typeof value !== 'string' || !ISO.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('invalid UTC timestamp')
  return Date.parse(value)
}
function minimum(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 86_400_000) fail('invalid minObservationWindowMs')
  return value
}
function evidence(value, min, now) {
  object(value, ['integrity', 'startup', 'criticalRoutes', 'window'], 'evidence')
  for (const key of ['integrity', 'startup', 'criticalRoutes']) {
    object(value[key], ['passed'], key)
    if (value[key].passed !== true) fail(`${key} must explicitly pass`)
  }
  object(value.window, ['startedAt', 'endedAt'], 'window')
  const start = timestamp(value.window.startedAt), end = timestamp(value.window.endedAt)
  if (start < 0 || end > now || end - start < min) fail('observation window insufficient or future')
  return structuredClone(value)
}
async function stat(file) { try { return await fs.lstat(file) } catch (e) { if (e.code === 'ENOENT') return null; throw e } }
async function safe(file) {
  const root = path.parse(file).root
  let current = root
  for (const part of file.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const s = await stat(current)
    if (s?.isSymbolicLink()) fail('symlink/junction refused')
    if (s && current !== file && !s.isDirectory()) fail('non-directory ancestor')
  }
  return file
}
async function location(store) {
  if (typeof store !== 'string' || !path.isAbsolute(store) || /[\x00-\x1f]/.test(store) || /^(?:\\\\|\/\/)/.test(store) || (process.platform === 'win32' && (!/^[a-zA-Z]:[\\/]/.test(store) || store.slice(2).includes(':')))) fail('store must be an absolute local path')
  const full = await safe(path.resolve(store))
  if (full === path.parse(full).root) fail('filesystem root cannot be a store')
  const s = await stat(full)
  if (s && !s.isDirectory()) fail('store must be directory')
  return full
}
function initial() { return {version:1, minObservationWindowMs:DEFAULT_MIN_OBSERVATION_WINDOW_MS, defaultStatus:'candidate', snapshots:{}, pending:null, circuit:{open:false}} }
function status(state, snapshotId) {
  const s = state.snapshots[snapshotId]
  if (s?.bad) return 'bad'
  if (!s?.evidence) return 'candidate'
  const w = s.evidence.window
  return Date.parse(w.endedAt) - Date.parse(w.startedAt) >= state.minObservationWindowMs ? 'healthy' : 'candidate'
}
function reduce(state, type, data, at) {
  const now = timestamp(at)
  switch (type) {
    case 'configure':
      object(data, ['minObservationWindowMs'], 'configure')
      if (state.pending) fail('pending recovery blocks configuration')
      state.minObservationWindowMs = minimum(data.minObservationWindowMs)
      break
    case 'qualify': {
      object(data, ['id', 'evidence'], 'qualify'); id(data.id)
      if (state.snapshots[data.id]?.bad) fail('snapshot permanently quarantined')
      if (state.pending) fail('pending recovery blocks qualification')
      state.snapshots[data.id] = {bad:false,evidence:evidence(data.evidence, state.minObservationWindowMs, now)}
      break
    }
    case 'quarantine':
      object(data, ['id', 'reason'], 'quarantine'); id(data.id); reason(data.reason)
      state.snapshots[data.id] = {...state.snapshots[data.id],bad:true,reason:data.reason}
      break
    case 'begin':
      object(data, ['id', 'attemptId'], 'begin'); id(data.id)
      if (typeof data.attemptId !== 'string' || !UUID.test(data.attemptId)) fail('invalid attemptId')
      if (state.pending) fail('pending recovery is unconfirmed; no automatic retry')
      if (state.circuit.open) fail('circuit open')
      if (status(state, data.id) !== 'healthy') fail('snapshot must be healthy and not bad')
      state.pending = {attemptId:data.attemptId,id:data.id,startedAt:at,status:'unconfirmed'}
      break
    case 'finish': {
      object(data, ['attemptId', 'success', 'reason'], 'finish')
      if (typeof data.attemptId !== 'string' || !UUID.test(data.attemptId) || typeof data.success !== 'boolean') fail('invalid finish result')
      reason(data.reason)
      if (!state.pending || state.pending.attemptId !== data.attemptId) fail('attempt does not match pending intent')
      if (!data.success) {
        const snapshotId = state.pending.id
        state.snapshots[snapshotId] = {...state.snapshots[snapshotId],bad:true,reason:data.reason}
        state.circuit = {open:true,reason:data.reason,attemptId:data.attemptId}
      }
      state.pending = null
      break
    }
    case 'reset':
      object(data, ['acknowledge', 'reason'], 'reset'); reason(data.reason)
      if (data.acknowledge !== true) fail('explicit acknowledgement required')
      if (state.pending) fail('cannot reset unconfirmed pending recovery')
      state.circuit = {open:false}
      break
    default: fail('unknown audit event')
  }
}
async function replay(store) {
  const dir = await safe(path.join(store, '.recovery-policy-events'))
  const state = initial()
  if (!(await stat(dir))) return {state,seq:0,previousHash:null,dir}
  if (!(await stat(dir)).isDirectory()) fail('audit path is not directory')
  const names = (await fs.readdir(dir)).sort()
  let seq = 0, previousHash = null
  for (const name of names) {
    // Incomplete publication candidates never count as committed events.
    if (/^\.tmp-[a-f0-9-]{36}$/.test(name)) continue
    if (!EVENT.test(name) || name !== `${String(seq + 1).padStart(12, '0')}.json`) fail('invalid/gapped audit log')
    const file = await safe(path.join(dir, name)), s = await stat(file)
    if (!s?.isFile() || s.size > MAX_EVENT || s.nlink !== 1) fail('invalid audit file')
    const text = await fs.readFile(file, 'utf8')
    if (Buffer.byteLength(text) > MAX_EVENT) fail('oversized audit file')
    const entry = JSON.parse(text)
    object(entry, ['version','seq','previousHash','type','at','data'], 'audit event')
    if (entry.version !== 1 || entry.seq !== seq + 1 || entry.previousHash !== previousHash) fail('corrupt audit chain')
    reduce(state, entry.type, entry.data, entry.at)
    seq++; previousHash = hash(text)
  }
  for (const snapshotId of Object.keys(state.snapshots)) state.snapshots[snapshotId].status = status(state, snapshotId)
  return {state,seq,previousHash,dir}
}
async function transaction(store, type, data) {
  const full = await location(store)
  await fs.mkdir(full, {recursive:true})
  await safe(full)
  const lock = await safe(path.join(full, '.recovery-policy.lock'))
  try { await fs.mkdir(lock) } catch (e) { if (e.code === 'EEXIST') fail('policy writer locked (single local host only)'); throw e }
  try {
    const journal = await replay(full), at = new Date().toISOString()
    reduce(journal.state, type, data, at)
    await fs.mkdir(journal.dir, {recursive:true})
    await safe(journal.dir)
    const entry = {version:1,seq:journal.seq+1,previousHash:journal.previousHash,type,at,data}
    const text = JSON.stringify(entry)
    if (Buffer.byteLength(text) > MAX_EVENT) fail('oversized event')
    const tmp = path.join(journal.dir, `.tmp-${crypto.randomUUID()}`)
    const target = path.join(journal.dir, `${String(entry.seq).padStart(12,'0')}.json`)
    const handle = await fs.open(tmp, 'wx', 0o600)
    try { await handle.writeFile(text); await handle.sync() } finally { await handle.close() }
    try { await safe(target); await fs.link(tmp, target) } finally { await fs.unlink(tmp) }
    // POSIX directory fsync; Windows cannot open directories this way.
    if (process.platform !== 'win32') {
      const d = await fs.open(journal.dir, 'r')
      try { await d.sync() } finally { await d.close() }
    }
    for (const snapshotId of Object.keys(journal.state.snapshots)) journal.state.snapshots[snapshotId].status = status(journal.state, snapshotId)
    return structuredClone(journal.state)
  } finally { await fs.rmdir(lock) }
}
export async function inspectPolicy(args) {
  options(args, ['store'])
  return structuredClone((await replay(await location(args.store))).state)
}
export async function configurePolicy(args) {
  options(args, ['store','minObservationWindowMs']); minimum(args.minObservationWindowMs)
  return transaction(args.store, 'configure', {minObservationWindowMs:args.minObservationWindowMs})
}
export async function qualifySnapshot(args) {
  options(args, ['store','id','evidence']); id(args.id)
  // Snapshot caller-owned objects before the first async boundary.
  const proof = evidence(args.evidence, 1, Date.now())
  return transaction(args.store, 'qualify', {id:args.id,evidence:proof})
}
export async function quarantineSnapshot(args) {
  options(args, ['store','id','reason']); id(args.id); reason(args.reason)
  return transaction(args.store, 'quarantine', {id:args.id,reason:args.reason})
}
export async function beginRecovery(args) {
  options(args, ['store','id']); id(args.id)
  const attemptId = crypto.randomUUID()
  const state = await transaction(args.store, 'begin', {id:args.id,attemptId})
  return structuredClone(state.pending)
}
export async function finishRecovery(args) {
  options(args, ['store','attemptId','success','reason'])
  // Reducer validates values before publishing; primitive-only payload.
  if (typeof args.attemptId !== 'string' || !UUID.test(args.attemptId) || typeof args.success !== 'boolean') fail('invalid finish result')
  reason(args.reason)
  return transaction(args.store, 'finish', {attemptId:args.attemptId,success:args.success,reason:args.reason})
}
export async function resetCircuit(args) {
  options(args, ['store','acknowledge','reason']); reason(args.reason)
  if (args.acknowledge !== true) fail('explicit acknowledgement required')
  return transaction(args.store, 'reset', {acknowledge:true,reason:args.reason})
}
