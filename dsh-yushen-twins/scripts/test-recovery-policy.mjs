import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {
  inspectPolicy, configurePolicy, qualifySnapshot, quarantineSnapshot,
  beginRecovery, finishRecovery, resetCircuit,
} from '../lib/recovery-policy.js'

const exec = promisify(execFile)
const id = '1730000000000-00000000-0000-4000-8000-000000000001'
const other = '1730000000000-00000000-0000-4000-8000-000000000002'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recovery-policy-test-'))
const store = path.join(root, 'a'), isolated = path.join(root, 'b')
const proof = (duration = 60_000) => {
  const end = Date.now() - 1000
  return {integrity:{passed:true},startup:{passed:true},criticalRoutes:{passed:true},window:{startedAt:new Date(end-duration).toISOString(),endedAt:new Date(end).toISOString()}}
}
const rejects = (fn, text) => assert.rejects(fn, text)
try {
  assert.equal((await inspectPolicy({store})).defaultStatus, 'candidate')
  await rejects(() => beginRecovery({store,id}), /healthy/)
  await rejects(() => qualifySnapshot({store,id,evidence:{httpStatus:200}}), /schema/)
  const failedProof = proof(); failedProof.startup.passed = false
  await rejects(() => qualifySnapshot({store,id,evidence:failedProof}), /explicitly pass/)
  await rejects(() => qualifySnapshot({store,id,evidence:proof(59_999)}), /window/)
  const future = proof(); future.window.endedAt = new Date(Date.now()+10_000).toISOString()
  await rejects(() => qualifySnapshot({store,id,evidence:future}), /window/)
  await qualifySnapshot({store,id,evidence:proof()})
  assert.equal((await inspectPolicy({store})).snapshots[id].status, 'healthy')
  await configurePolicy({store,minObservationWindowMs:120_000})
  assert.equal((await inspectPolicy({store})).snapshots[id].status, 'candidate')
  await rejects(() => beginRecovery({store,id}), /healthy/)
  await qualifySnapshot({store,id,evidence:proof(120_000)})
  await quarantineSnapshot({store,id,reason:'manual exclusion'})
  await rejects(() => qualifySnapshot({store,id,evidence:proof(120_000)}), /quarantined/)
  await rejects(() => beginRecovery({store,id}), /healthy/)
  await resetCircuit({store,acknowledge:true,reason:'operator reviewed'})
  assert.equal((await inspectPolicy({store})).snapshots[id].status, 'bad')

  await qualifySnapshot({store,id:other,evidence:proof(120_000)})
  const attempt = await beginRecovery({store,id:other})
  assert.equal(attempt.status, 'unconfirmed')
  assert.equal((await inspectPolicy({store})).pending.attemptId, attempt.attemptId)
  await rejects(() => beginRecovery({store,id:other}), /pending/)
  await rejects(() => resetCircuit({store,acknowledge:true,reason:'cannot wash pending'}), /pending/)
  // Fresh process: reload disk, preserve intent and refuse retry without finish.
  const moduleURL = new URL('../lib/recovery-policy.js', import.meta.url).href
  const script = `import {inspectPolicy,beginRecovery} from ${JSON.stringify(moduleURL)}; const store=process.argv[1]; const s=await inspectPolicy({store}); if(!s.pending) throw Error('lost intent'); try { await beginRecovery({store,id:${JSON.stringify(other)}}); process.exit(9) } catch(e) { if(!/pending/.test(e.message)) throw e; console.log(s.pending.attemptId) }`
  const child = await exec(process.execPath, ['--input-type=module','-e',script,store])
  assert.equal(child.stdout.trim(), attempt.attemptId)
  await rejects(() => finishRecovery({store,attemptId:'00000000-0000-4000-8000-000000000000',success:true,reason:'wrong attempt'}), /match/)
  await finishRecovery({store,attemptId:attempt.attemptId,success:false,reason:'explicit startup failure'})
  const bad = await inspectPolicy({store})
  assert.equal(bad.pending, null); assert.equal(bad.circuit.open, true)
  assert.equal(bad.snapshots[other].status, 'bad')
  await rejects(() => qualifySnapshot({store,id:other,evidence:proof(120_000)}), /quarantined/)
  await rejects(() => resetCircuit({store,acknowledge:false,reason:'no ack'}), /acknowledgement/)
  await resetCircuit({store,acknowledge:true,reason:'operator investigated'})
  assert.equal((await inspectPolicy({store})).circuit.open, false)
  await rejects(() => beginRecovery({store,id:other}), /healthy/)

  // Store isolation; same id is candidate in a fresh namespace.
  assert.deepEqual((await inspectPolicy({store:isolated})).snapshots, {})
  await rejects(() => beginRecovery({store:isolated,id}), /healthy/)
  await qualifySnapshot({store:isolated,id,evidence:proof()})
  const races = await Promise.allSettled([beginRecovery({store:isolated,id}),beginRecovery({store:isolated,id})])
  assert.equal(races.filter(r => r.status === 'fulfilled').length, 1)
  const active = races.find(r => r.status === 'fulfilled').value
  await finishRecovery({store:isolated,attemptId:active.attemptId,success:true,reason:'explicit post-apply checks passed'})
  assert.equal((await inspectPolicy({store:isolated})).pending, null)
  assert.equal((await inspectPolicy({store:isolated})).snapshots[id].status, 'healthy')
  assert.equal((await inspectPolicy({store})).snapshots[id].status, 'bad')
  // Circuit blocks even a distinct qualified healthy snapshot.
  const third = '1730000000000-00000000-0000-4000-8000-000000000003'
  await qualifySnapshot({store:isolated,id:third,evidence:proof()})
  const failure = await beginRecovery({store:isolated,id})
  await finishRecovery({store:isolated,attemptId:failure.attemptId,success:false,reason:'failure'})
  await rejects(() => beginRecovery({store:isolated,id:third}), /circuit/)

  for (const invalid of ['../escape', id + '/x', '__proto__', '1730000000000-' + 'A'.repeat(36)]) {
    await rejects(() => beginRecovery({store,id:invalid}), /invalid snapshot id/)
  }
  await rejects(() => inspectPolicy({store:'relative/path'}), /absolute local/)
  await rejects(() => inspectPolicy({store,extra:true}), /schema/)
  await rejects(() => configurePolicy({store,minObservationWindowMs:0}), /minObservation/)
  // Unknown event or a tampered chain is not silently reset to defaults.
  const audit = path.join(isolated,'.recovery-policy-events')
  await fs.writeFile(path.join(audit,'999999999999.json'), '{}', {flag:'wx'})
  await rejects(() => inspectPolicy({store:isolated}), /gapped/)
  console.log('recovery-policy: all tests passed (candidate/evidence/quarantine/restart/circuit/reset/isolation/race/validation/audit)')
} finally {
  // Only remove the exact directory returned by mkdtemp above.
  assert.equal(path.dirname(root), os.tmpdir())
  assert.match(path.basename(root), /^recovery-policy-test-/)
  await fs.rm(root, {recursive:true,force:true})
}
