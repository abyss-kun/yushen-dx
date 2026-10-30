// Isolated real-process exits: never simulate 'exit' in the test runner.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
if (mode) {
  const { startRepairLifecycle, markTrustedManualExit, activeManifestPath } = await import('../lib/repair-lifecycle.js')
  const { readRepairState } = await import('../lib/repair-state.js')
  const readManifest = () => JSON.parse(fs.readFileSync(activeManifestPath(), 'utf8'))
  const effects = []
  const ctx = { effect(fn) { effects.push(fn()) } }
  const exitListeners = process.listenerCount('exit')
  const exceptionListeners = process.listenerCount('uncaughtException')
  const monitorListeners = process.listenerCount('uncaughtExceptionMonitor')
  assert.throws(() => startRepairLifecycle({}), /ctx.effect/)
  assert.throws(() => markTrustedManualExit(), /not started/)
  const handle = startRepairLifecycle(ctx)
  const runtime = globalThis[Symbol.for('dsh.yushen.repair-lifecycle.v1')]
  const manifest = readManifest()
  assert.equal(manifest.pid, process.pid)
  assert.equal(manifest.execPath, process.execPath)
  assert.ok(Math.abs(Date.parse(manifest.processStartedAt) - (Date.now() - process.uptime() * 1000)) < 1000)
  assert.equal(manifest.processStartedAtPrecisionMs, 1000)
  assert.equal(manifest.repairAllowed, false)
  assert.equal(runtime.timer.hasRef(), false)
  assert.equal(process.listenerCount('exit'), exitListeners + 1)
  assert.equal(process.listenerCount('uncaughtExceptionMonitor'), monitorListeners + 1)
  assert.equal(process.listenerCount('uncaughtException'), exceptionListeners)
  assert.equal(startRepairLifecycle(ctx), handle)
  assert.equal(effects.length, 1)

  if (mode === 'reconcile') {
    effects[0]()
    assert.equal(runtime.timer, null)
    const fresh = await import('../lib/repair-lifecycle.js?reconcile=1')
    const cleanup = []
    const second = fresh.startRepairLifecycle({ effect(fn) { cleanup.push(fn()) } })
    assert.equal(second.launchId, handle.launchId)
    assert.equal(Object.keys(readRepairState().sessions).length, 1)
    assert.equal(process.listenerCount('exit'), exitListeners + 1)
    assert.equal(process.listenerCount('uncaughtExceptionMonitor'), monitorListeners + 1)
    assert.equal(runtime.timer.hasRef(), false)
    cleanup[0]()
    assert.equal(runtime.timer, null)
    assert.equal(readRepairState().sessions[handle.launchId].status, 'running')
  } else if (mode === 'dispose') {
    handle.dispose(); effects[0](); handle.dispose()
    assert.equal(runtime.timer, null)
    assert.equal(readManifest().status, 'running')
    assert.equal(readRepairState().sessions[handle.launchId].status, 'running')
    assert.throws(() => handle.markPlannedExit(), /disposed/)
  } else if (mode === 'planned' || mode === 'planned-nonzero' || mode === 'fatal') {
    handle.markPlannedExit('planned-restart')
    assert.equal(readManifest().intent.kind, 'automatic')
    assert.equal(readManifest().status, 'running')
    assert.equal(readRepairState().sessions[handle.launchId].status, 'running')
    assert.throws(() => markTrustedManualExit(), /Conflicting/)
    if (mode === 'planned-nonzero') process.exitCode = 2
    if (mode === 'fatal') {
      // Exercise monitor without throwing: listener must not persist the secret.
      process.emit('uncaughtExceptionMonitor', new Error('SECRET_STACK_AND_MESSAGE'), 'uncaughtException')
      assert.equal(readManifest().fatalCategory, 'uncaught-exception')
      assert.ok(!fs.readFileSync(activeManifestPath(), 'utf8').includes('SECRET'))
    }
  } else if (mode === 'manual') {
    markTrustedManualExit('user-close')
    assert.equal(readManifest().intent.kind, 'manual')
    assert.equal(readRepairState().sessions[handle.launchId].status, 'running')
  } else if (mode === 'heartbeat') {
    // Drive one timer callback deterministically without waiting 15 seconds.
    handle.dispose()
    const original = globalThis.setInterval
    let tick
    globalThis.setInterval = (fn, ms) => { tick = fn; return original(fn, ms) }
    try {
      const active = startRepairLifecycle({ effect(fn) { fn() } })
      tick()
      assert.equal(readRepairState().sessions[active.launchId].observations.length, 1)
      assert.equal(readManifest().heartbeat, readRepairState().sessions[active.launchId].lastObservedAt)
      assert.equal(runtime.timer.hasRef(), false)
      active.dispose()
    } finally { globalThis.setInterval = original }
  } else if (mode === 'real-fatal') {
    handle.markPlannedExit('planned-restart')
    // A real uncaught exception must still terminate nonzero. The monitor is
    // not an exception handler and must never turn this into a clean exit.
    throw new Error('test-fatal-no-private-data')
  } else assert.equal(mode, 'unknown')
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-repair-lifecycle-'))
  let passed = 0
  try {
    for (const name of ['reconcile', 'dispose', 'planned', 'unknown', 'manual', 'planned-nonzero', 'fatal', 'real-fatal', 'heartbeat']) {
      const home = path.join(root, name)
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], {
        env: { ...process.env, DSH_HOME: home }, stdio: 'inherit', timeout: 15_000,
      })
      assert.equal(child.error, undefined)
      assert.equal(child.status, name === 'planned-nonzero' ? 2 : name === 'real-fatal' ? 1 : 0, name)
      const dir = path.join(home, 'dayu', 'repair')
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'active.json'), 'utf8'))
      const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))
      assert.equal(Object.keys(state.sessions).length, 1, name)
      const session = state.sessions[manifest.launchId]
      const expected = name === 'planned' ? 'automatic-exit' : name === 'manual' ? 'manual-exit' : 'normal-exit-unknown'
      assert.equal(manifest.status, expected, name)
      assert.equal(manifest.repairAllowed, false)
      assert.equal(session.status, ['automatic-exit', 'manual-exit'].includes(expected) ? expected : 'running', name)
      assert.ok(manifest.exitedAt)
      assert.deepEqual(fs.readdirSync(dir).filter(file => file.includes('.tmp')), [])
      passed++
      console.log(`  ok   ${name}`)
    }
    console.log(`repair-lifecycle: ${passed} passed, 0 failed`)
  } finally {
    // Verified root is the exact mkdtemp directory owned by this test.
    assert.equal(path.dirname(root), os.tmpdir())
    assert.ok(path.basename(root).startsWith('yushen-repair-lifecycle-'))
    fs.rmSync(root, { recursive: true, force: true })
  }
}
