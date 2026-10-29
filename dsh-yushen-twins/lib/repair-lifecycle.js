// Host evidence only: plugin reconciliation/disposal is NOT a host restart/exit.
// No repair is attempted here. External consumers MUST check active.json before
// using repair-state's older PID-only classify(): normal-exit-unknown is unknown,
// never manual and never sufficient authority to repair.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { beginSession, observeLaunch, markManualClose, markAutomaticClose } from './repair-state.js'

export const HEARTBEAT_MS = 15_000
const KEY = Symbol.for('dsh.yushen.repair-lifecycle.v1')
const now = () => new Date().toISOString()
function category(reason, fallback) {
  // Accept categories, not free-form messages/paths/stacks.
  return typeof reason === 'string' && /^[A-Za-z][A-Za-z0-9._:-]{0,95}$/.test(reason) ? reason : fallback
}
export function activeManifestPath() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'repair', 'active.json')
}
function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    fs.renameSync(tmp, file)
  } finally { try { fs.rmSync(tmp, { force: true }) } catch {} }
}
function save(runtime) { atomic(runtime.file, runtime.manifest) }
function stopHeartbeat(runtime) {
  if (runtime.timer) clearInterval(runtime.timer)
  runtime.timer = null
}
function startHeartbeat(runtime) {
  if (runtime.timer || runtime.exited) return
  runtime.timer = setInterval(() => {
    if (runtime.exited) return
    const at = now()
    try {
      observeLaunch({ launchId: runtime.manifest.launchId, pid: process.pid, at })
      runtime.manifest.heartbeat = at
      save(runtime)
    } catch { /* Never take down the host because evidence storage failed. */ }
  }, HEARTBEAT_MS)
  runtime.timer.unref()
}
function runtimeForProcess() {
  if (globalThis[KEY]) return globalThis[KEY]
  const at = now()
  const manifest = {
    version: 1, pid: process.pid, execPath: process.execPath,
    // Actual host age, not plugin-load time. OS probes may expose only whole
    // seconds; consumers compare within precision, never ISO string equality.
    processStartedAt: new Date(Math.round(Date.now() - process.uptime() * 1000)).toISOString(),
    processStartedAtPrecisionMs: 1000,
    launchId: crypto.randomUUID(), at, heartbeat: at,
    status: 'running', repairAllowed: false,
  }
  const runtime = { manifest, file: activeManifestPath(), owners: new Set(), contexts: new WeakMap(), timer: null, exited: false }
  beginSession({ launchId: manifest.launchId, pid: process.pid, at })
  save(runtime)
  // Retain one process-level runtime even when every plugin instance disposes.
  // A cache-busted module import must not register a second session/listener.
  globalThis[KEY] = runtime
  process.on('uncaughtExceptionMonitor', (_error, origin) => {
    // This observer does not handle/swallow the exception. Never persist error
    // messages, names supplied by thrown objects, stacks, or rejection values.
    manifest.fatalCategory = origin === 'unhandledRejection' ? 'unhandled-rejection' : 'uncaught-exception'
    try { save(runtime) } catch {}
  })
  process.once('exit', (code) => {
    if (runtime.exited) return
    runtime.exited = true
    stopHeartbeat(runtime)
    const exitedAt = now()
    // Intent alone is not completion. A failed/fatal planned shutdown remains
    // unknown. An unmarked process exit is NEVER evidence of manual closure.
    const completed = code === 0 && !manifest.fatalCategory && manifest.intent
    manifest.status = completed ? (manifest.intent.kind === 'manual' ? 'manual-exit' : 'automatic-exit') : 'normal-exit-unknown'
    manifest.exitedAt = exitedAt
    manifest.exitCode = code
    try {
      if (completed) {
        const close = manifest.intent.kind === 'manual' ? markManualClose : markAutomaticClose
        close({ launchId: manifest.launchId, at: exitedAt, reason: manifest.intent.reason })
      }
    } catch {
      manifest.status = 'normal-exit-unknown'
      manifest.evidenceError = 'close-write-failed'
    }
    try { save(runtime) } catch {}
  })
  return runtime
}
function intent(runtime, kind, reason) {
  if (runtime.exited) throw new Error('Host has already exited')
  // A user-close signal must not silently be replaced by a restart intent.
  if (runtime.manifest.intent && runtime.manifest.intent.kind !== kind) throw new Error('Conflicting host exit intent')
  runtime.manifest.intent = { kind, reason: category(reason, kind === 'manual' ? 'trusted-host-close' : 'planned-host-exit'), at: now() }
  save(runtime)
  return { ...runtime.manifest.intent }
}

/** Call ONLY from a trusted host user-close hook; never plugin dispose, generic
 * process exit, renderer disconnect, a guessed event name, or arbitrary input.
 * This records manual intent; only the subsequent successful host exit commits
 * repair-state's manual-close. Calling without an active lifecycle is rejected.
 */
export function markTrustedManualExit(reason = 'trusted-host-close') {
  const runtime = globalThis[KEY]
  if (!runtime) throw new Error('Repair lifecycle has not started')
  return intent(runtime, 'manual', reason)
}

/** Start once per plugin instance. Same-process reconciliation reuses launchId.
 * ctx.effect owns ONLY the heartbeat subscription. No host hook is assumed:
 * hosts explicitly call markTrustedManualExit(), or markPlannedExit() before
 * their own planned exit. Neither API exits/restarts the host or runs repairs.
 */
export function startRepairLifecycle(ctx) {
  if (!ctx || typeof ctx.effect !== 'function') throw new TypeError('ctx.effect is required')
  const runtime = runtimeForProcess()
  const existing = runtime.contexts.get(ctx)
  if (existing) return existing
  let disposed = false
  const owner = {}
  const handle = Object.freeze({
    launchId: runtime.manifest.launchId,
    markPlannedExit(reason = 'planned-host-exit') {
      if (disposed) throw new Error('Repair lifecycle handle is disposed')
      return intent(runtime, 'automatic', reason)
    },
    dispose() {
      if (disposed) return
      disposed = true
      runtime.contexts.delete(ctx)
      runtime.owners.delete(owner)
      if (!runtime.owners.size) stopHeartbeat(runtime)
    },
  })
  runtime.contexts.set(ctx, handle)
  try {
    ctx.effect(() => {
      if (!disposed) { runtime.owners.add(owner); startHeartbeat(runtime) }
      return handle.dispose
    })
  } catch (error) { handle.dispose(); throw error }
  return handle
}
