// repair-state self-test: lifecycle classification, replay, idempotence, and repair circuit rules.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-repair-state-'))
process.env.DSH_HOME = HOME
const mod = await import('../lib/repair-state.js?test=' + Date.now())
const { beginSession, markManualClose, markAutomaticClose, observeLaunch, classify, canApply, recordAttempt, readRepairState, ledgerPath, statePath } = mod
const t = (n) => `2026-10-25T15:${String(n).padStart(2, '0')}:00.000Z`
let passed = 0; let failed = 0
async function check(name, fn) { try { await fn(); passed++; console.log(`  ok   ${name}`) } catch (err) { failed++; console.log(`  FAIL ${name}\n       ${err.message}`) } }

await check('manual exit is explicit and never crash', () => {
  beginSession({ pid: 1001, at: t(0), launchId: 'manual-1' })
  markManualClose({ launchId: 'manual-1', at: t(1), reason: 'user-request' })
  assert.equal(classify({ launchId: 'manual-1', now: t(5), pidAlive: false }), 'manual-exit')
})
await check('automatic exit is explicit and never crash', () => {
  beginSession({ pid: 1002, at: t(2), launchId: 'auto-1' })
  markAutomaticClose({ launchId: 'auto-1', at: t(3), reason: 'planned-restart' })
  assert.equal(classify({ launchId: 'auto-1', now: t(5), pidAlive: false }), 'automatic-exit')
})
await check('running PID remains unknown even after timeout', () => {
  beginSession({ pid: 1003, at: t(4), launchId: 'live-1' })
  observeLaunch({ launchId: 'live-1', pid: 1003, at: t(5) })
  assert.equal(classify({ launchId: 'live-1', now: t(20), pidAlive: true, timeoutMs: 1000 }), 'unknown')
})
await check('dead PID after timeout is crash-suspected', () => {
  beginSession({ pid: 1004, at: t(6), launchId: 'crash-1' })
  observeLaunch({ launchId: 'crash-1', pid: 1004, at: t(7) })
  assert.equal(classify({ launchId: 'crash-1', now: t(20), pidAlive: false, timeoutMs: 1000 }), 'crash-suspected')
})
await check('missing boot, duplicate launch and duplicate close are rejected', () => {
  assert.throws(() => markManualClose({ launchId: 'missing', at: t(8), reason: 'x' }))
  assert.throws(() => beginSession({ pid: 1001, at: t(8), launchId: 'manual-1' }))
  assert.throws(() => markManualClose({ launchId: 'manual-1', at: t(8), reason: 'again' }))
  assert.throws(() => classify({ launchId: 'crash-1', now: t(20) }), /pidAlive/)
})
await check('first repair allowed, success needs health, failure opens circuit', () => {
  const signature = 'boot-timeout-A'
  assert.deepEqual(canApply('fix-a', { launchId: 'crash-1', classification: 'crash-suspected', signature }), { allow: true, signature })
  assert.throws(() => recordAttempt({ launchId: 'crash-1', solutionId: 'fix-a', at: t(21), result: 'success', signature, classification: 'crash-suspected' }), /health confirmation/)
  recordAttempt({ launchId: 'crash-1', solutionId: 'fix-a', at: t(21), result: 'failure', signature, classification: 'crash-suspected' })
  assert.equal(canApply('fix-a', { launchId: 'crash-1', classification: 'crash-suspected', signature }).allow, false)
  assert.throws(() => recordAttempt({ launchId: 'crash-1', solutionId: 'fix-a', at: t(22), result: 'failure', signature, classification: 'crash-suspected' }))
})
await check('different crash signature is isolated', () => {
  // A second launch has a distinct launch+solution attempt budget; the circuit is per solution+signature.
  beginSession({ pid: 1005, at: t(23), launchId: 'crash-2' })
  assert.equal(canApply('fix-a', { launchId: 'crash-2', classification: 'crash-suspected', signature: 'boot-timeout-B' }).allow, true)
  assert.equal(canApply('fix-a', { launchId: 'crash-2', classification: 'crash-suspected', signature: 'boot-timeout-A' }).allow, false)
})
await check('restart replays immutable ledger and atomic snapshot', async () => {
  assert.ok(fs.existsSync(ledgerPath()))
  assert.ok(fs.existsSync(statePath()))
  const before = fs.readFileSync(ledgerPath(), 'utf8')
  const fresh = await import('../lib/repair-state.js?restart=' + Date.now())
  assert.equal(fresh.classify({ launchId: 'manual-1', now: t(30), pidAlive: false }), 'manual-exit')
  assert.equal(fresh.canApply('fix-a', { launchId: 'crash-1', classification: 'crash-suspected', signature: 'boot-timeout-A' }).allow, false)
  assert.equal(fs.readFileSync(ledgerPath(), 'utf8'), before)
})

console.log(`repair-state: ${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
try { fs.rmSync(HOME, { recursive: true, force: true }) } catch {}
