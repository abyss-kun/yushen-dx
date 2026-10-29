// Local-only protection service. No module-load timers or machine-specific defaults.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { inspectPolicy, beginRecovery, finishRecovery } from './recovery-policy.js'

const PLUGIN_ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
const runtimes = new Map()
const fields = new Set(['enabled', 'intervalMs', 'roots', 'store', 'maxFileBytes'])
function location() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'protection')
}
function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    fs.renameSync(tmp, file)
  } finally { fs.rmSync(tmp, { force: true }) }
}
function json(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error('Protection data is invalid or unreadable') }
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype }
function absolute(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || /[\x00-\x1f]/.test(value) || !path.isAbsolute(value)) throw new Error('Expected a valid absolute local path')
  if (/^(?:\\\\|\/\/)/.test(value)) throw new Error('Network paths are not supported')
  return path.resolve(value)
}
function canonical(value) {
  if (fs.existsSync(value)) return fs.realpathSync(value)
  const parent = path.dirname(value)
  return parent === value ? value : path.join(canonical(parent), path.basename(value))
}
function within(a, b) { const rel = path.relative(a, b); return !rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)) }
function validate(value) {
  if (!object(value) || Object.keys(value).some(k => !fields.has(k))) throw new Error('Unknown backup configuration field')
  if (typeof value.enabled !== 'boolean') throw new Error('enabled must be boolean')
  if (!Number.isSafeInteger(value.intervalMs) || value.intervalMs < 60000 || value.intervalMs > 86400000) throw new Error('intervalMs must be an integer between 60000 and 86400000')
  if (!Number.isSafeInteger(value.maxFileBytes) || value.maxFileBytes < 1 || value.maxFileBytes > 100 * 1024 * 1024) throw new Error('maxFileBytes must be between 1 and 104857600')
  if (!Array.isArray(value.roots) || !value.roots.length || value.roots.length > 32) throw new Error('roots must contain 1 to 32 directories')
  const store = absolute(value.store)
  if (fs.existsSync(store) && !fs.statSync(store).isDirectory()) throw new Error('store must be a directory')
  const ids = new Set(), paths = []
  const roots = value.roots.map(root => {
    if (!object(root) || Object.keys(root).some(k => !['id', 'path'].includes(k)) || typeof root.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(root.id) || ids.has(root.id.toLowerCase())) throw new Error('Each root requires a unique safe id and path')
    const full = absolute(root.path)
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error('Each root must be an existing directory')
    const real = canonical(full)
    if (paths.some(p => within(p, real) || within(real, p))) throw new Error('Backup roots must not overlap')
    if (within(real, canonical(store)) || within(canonical(store), real)) throw new Error('Backup store and roots must not overlap')
    paths.push(real); ids.add(root.id.toLowerCase())
    return { id: root.id, path: full }
  })
  return { enabled: value.enabled, intervalMs: value.intervalMs, roots, store, maxFileBytes: value.maxFileBytes }
}
export function readBackupConfig() {
  const base = location(), file = path.join(base, 'config.json')
  const raw = json(file, null)
  const config = validate(raw ?? { enabled: true, intervalMs: 600000, roots: [{ id: 'plugin', path: PLUGIN_ROOT }], store: path.join(base, 'store'), maxFileBytes: 64 * 1024 * 1024 })
  if (raw === null) atomic(file, config)
  return config
}
export function updateBackupConfig(patch) {
  if (!object(patch) || Object.keys(patch).some(k => !fields.has(k))) throw new Error('Unknown backup configuration field')
  const config = validate({ ...readBackupConfig(), ...patch })
  atomic(path.join(location(), 'config.json'), config)
  const runtime = runtimes.get(location())
  if (runtime) runtime.schedule()
  return config
}
function state(base = location()) { return json(path.join(base, 'status.json'), {}) }
function saveState(base, patch) { atomic(path.join(base, 'status.json'), { ...state(base), ...patch }) }
function safeState(raw) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0
  const summary = { lastSnapshotId: typeof raw.lastSnapshotId === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(raw.lastSnapshotId) ? raw.lastSnapshotId : null, excluded: count(raw.excluded), oversize: count(raw.oversize), sensitive: count(raw.sensitive) }
  const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
  return { ...summary, lastSuccess: timestamp(raw.lastSuccess), error: raw.error === 'BACKUP_FAILED' ? 'BACKUP_FAILED' : null, errorMessage: raw.error === 'BACKUP_FAILED' ? '本地备份失败：请检查配置目录是否存在、读写权限及磁盘空间，再手动重试；不会自动恢复或覆盖。' : null, nextRun: timestamp(raw.nextRun) }
}
export function backupStatus() {
  const config = readBackupConfig(), runtime = runtimes.get(location())
  return { enabled: config.enabled, intervalMs: config.intervalMs, rootIds: config.roots.map(root => root.id), running: !!runtime?.inFlight, started: !!runtime?.started, ...safeState(state()) }
}
function runtimeFor(base) {
  if (!runtimes.has(base)) runtimes.set(base, { started: false, inFlight: null, timer: null, schedule() {} })
  return runtimes.get(base)
}
async function core() { return import('./versioned-backup.js') }
export function runProtectedBackup() {
  const base = location(), runtime = runtimeFor(base)
  if (runtime.inFlight) return runtime.inFlight
  const config = readBackupConfig()
  runtime.inFlight = (async () => {
    try {
      const result = await (await core()).createBackup({ roots: config.roots, store: config.store, maxFileBytes: config.maxFileBytes })
      saveState(base, { lastSuccess: new Date().toISOString(), error: null, lastSnapshotId: result.id ?? null, excluded: result.excluded ?? 0, oversize: result.oversize ?? 0, sensitive: result.sensitive ?? 0 })
      return result
    } catch (error) {
      saveState(base, { error: 'BACKUP_FAILED' })
      throw error
    } finally {
      runtime.inFlight = null
      if (runtime.started) runtime.schedule()
    }
  })()
  return runtime.inFlight
}
export async function listProtectedSnapshots() {
  const store = readBackupConfig().store
  const snapshots = await (await core()).listSnapshots({ store })
  const policy = await inspectPolicy({ store })
  return snapshots.map(snapshot => ({ ...snapshot, recoveryState: policy.snapshots?.[snapshot.id]?.status || 'candidate' }))
}
export async function verifyProtectedSnapshot(id) { const c=readBackupConfig(); return (await core()).verifySnapshot({ store: c.store, id, maxFileBytes: c.maxFileBytes }) }
export async function inspectProtectedSnapshot(id) { const c=readBackupConfig(); return (await core()).inspectSnapshot({ store: c.store, id, maxFileBytes: c.maxFileBytes }) }
export async function restoreProtectedSnapshot(id, options = {}) {
  if (object(id)) { options = { ...id }; id = options.id; delete options.id }
  if (!object(options) || Object.keys(options).some(k => k !== 'apply') || (options.apply !== undefined && typeof options.apply !== 'boolean')) throw new Error('Only explicit boolean apply is accepted')
  const config = readBackupConfig(), runtime = runtimeFor(location())
  if (runtime.inFlight) throw new Error('Protection operation already running')
  runtime.inFlight = (async () => {
    // Preview is available for diagnosis; applying requires a verified recovery point.
    const engine = await core()
    if (options.apply !== true) return engine.restoreSnapshot({ store: config.store, roots: config.roots, id, apply: false, maxFileBytes: config.maxFileBytes })
    await engine.verifySnapshot({ store: config.store, id, maxFileBytes: config.maxFileBytes })
    const attempt = await beginRecovery({ store: config.store, id })
    try {
      const result = await engine.restoreSnapshot({ store: config.store, roots: config.roots, id, apply: true, maxFileBytes: config.maxFileBytes })
      // File copy is not evidence that the software can boot. Keep pending until checked.
      return { ...result, attemptId: attempt.attemptId, healthConfirmationRequired: true }
    } catch (error) {
      await finishRecovery({ store: config.store, attemptId: attempt.attemptId, success: false, reason: 'Restore failed; stopped without retry' })
      throw error
    }
  })()
  try { return await runtime.inFlight }
  finally { runtime.inFlight = null; if (runtime.started) runtime.schedule() }
}
export function startBackupService(ctx) {
  const base = location(), runtime = runtimeFor(base)
  if (runtime.started) return runtime.handle
  readBackupConfig()
  runtime.started = true
  runtime.schedule = (delayMs) => {
    clearTimeout(runtime.timer); runtime.timer = null
    if (!runtime.started) return
    const config = readBackupConfig()
    if (!config.enabled) { saveState(base, { nextRun: null }); return }
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : config.intervalMs
    const nextRun = new Date(Date.now() + delay).toISOString()
    saveState(base, { nextRun })
    runtime.timer = setTimeout(() => {
      runtime.timer = null
      runProtectedBackup().catch(() => { /* Persisted sanitized error, never log paths/content. */ })
    }, delay)
    runtime.timer.unref?.()
  }
  const dispose = () => {
    runtime.started = false
    clearTimeout(runtime.timer); runtime.timer = null
    saveState(base, { nextRun: null })
  }
  runtime.handle = { dispose, status: backupStatus, run: runProtectedBackup }
  try {
    runtime.schedule(30000)
    if (typeof ctx?.effect === 'function') ctx.effect(() => dispose)
    else if (typeof ctx?.on === 'function') ctx.on('dispose', dispose)
  } catch (error) { dispose(); throw error }
  return runtime.handle
}
