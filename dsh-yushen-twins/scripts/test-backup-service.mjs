import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readBackupConfig, updateBackupConfig, startBackupService, backupStatus, runProtectedBackup, listProtectedSnapshots, verifyProtectedSnapshot, inspectProtectedSnapshot, restoreProtectedSnapshot } from '../lib/backup-service.js'
import { qualifySnapshot, inspectPolicy, finishRecovery } from '../lib/recovery-policy.js'
import { recordSolution, listSolutions } from '../lib/solutions.js'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-protection-service-'))
const previous = process.env.DSH_HOME
process.env.DSH_HOME = home
process.on('exit', () => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; fs.rmSync(home, { recursive: true, force: true }) })

test('portable defaults and strict config validation in isolated HOME', () => {
  const config = readBackupConfig()
  assert.equal(config.enabled, true)
  assert.equal(config.intervalMs, 600000)
  assert.equal(config.maxFileBytes, 64 * 1024 * 1024)
  assert.equal(config.store, path.join(home, 'dayu', 'protection', 'store'))
  assert.equal(config.roots[0].id, 'plugin')
  assert.ok(fs.existsSync(path.join(home, 'dayu', 'protection', 'config.json')))
  for (const patch of [{ enabled: 'yes' }, { intervalMs: 0 }, { intervalMs: 60000.5 }, { intervalMs: 86400001 }, { interval: 10 }, { roots: [] }, { store: 'relative' }, { maxFileBytes: 0 }, { roots: [{ id: '../bad', path: home }] }, { roots: [{ id: 'home', path: home }] }]) assert.throws(() => updateBackupConfig(patch))
  const workspace = fs.mkdtempSync(path.join(home, 'workspace-'))
  assert.throws(() => updateBackupConfig({ roots: [{ id: 'same', path: workspace }, { id: 'same', path: config.roots[0].path }] }))
  assert.throws(() => updateBackupConfig({ roots: [{ id: 'a', path: workspace }, { id: 'b', path: workspace }] }))
  const changed = updateBackupConfig({ roots: [...config.roots, { id: 'workspace', path: workspace }] })
  assert.equal(changed.roots.length, 2)
  assert.deepEqual(readBackupConfig(), changed)
})

test('unref scheduling, lifecycle disposal, restart state and privacy', () => {
  let dispose
  const handle = startBackupService({ effect(callback) { dispose = callback() } })
  assert.equal(typeof dispose, 'function')
  assert.equal(startBackupService(), handle)
  const initial = backupStatus()
  assert.equal(initial.started, true)
  assert.ok(Date.parse(initial.nextRun) - Date.now() < 31000)
  assert.ok(!JSON.stringify(initial).includes(home))
  assert.deepEqual(initial.rootIds, ['plugin', 'workspace'])
  updateBackupConfig({ enabled: false })
  assert.equal(backupStatus().nextRun, null)
  updateBackupConfig({ enabled: true, intervalMs: 60000 })
  assert.ok(Date.parse(backupStatus().nextRun) > Date.now() + 50000)
  dispose()
  assert.equal(backupStatus().started, false)
  assert.equal(backupStatus().nextRun, null)
  fs.writeFileSync(path.join(home, 'dayu', 'protection', 'status.json'), JSON.stringify({ lastSuccess: '2026-10-25T00:00:00.000Z', error: 'BACKUP_FAILED', nextRun: null, privatePath: home }))
  const persisted = backupStatus()
  assert.equal(persisted.lastSuccess, '2026-10-25T00:00:00.000Z')
  assert.equal(persisted.error, 'BACKUP_FAILED')
  assert.ok(persisted.errorMessage)
  assert.ok(!JSON.stringify(persisted).includes(home))
})

test('core wrappers serialize, persist success and default to restore preview', async () => {
  const root = path.join(home, 'wrapper-root')
  fs.mkdirSync(root)
  fs.writeFileSync(path.join(root, 'result.md'), 'original result')
  updateBackupConfig({ roots: [{ id: 'work', path: root }], enabled: false })
  const first = runProtectedBackup(), second = runProtectedBackup()
  assert.equal(first, second)
  const result = await first
  assert.ok(result.id)
  assert.ok(backupStatus().lastSuccess)
  assert.equal(backupStatus().lastSnapshotId, result.id)
  assert.equal(typeof backupStatus().excluded, 'number')
  assert.equal(backupStatus().error, null)
  assert.ok((await listProtectedSnapshots()).length)
  assert.equal((await verifyProtectedSnapshot(result.id)).ok, true)
  assert.ok(await inspectProtectedSnapshot(result.id))
  fs.writeFileSync(path.join(root, 'result.md'), 'new result')
  assert.equal((await restoreProtectedSnapshot({ id: result.id })).applied, false)
  assert.equal(fs.readFileSync(path.join(root, 'result.md'), 'utf8'), 'new result')
  await assert.rejects(restoreProtectedSnapshot(result.id, { apply: true }))
  const store=readBackupConfig().store
  await qualifySnapshot({store,id:result.id,evidence:{integrity:{passed:true},startup:{passed:true},criticalRoutes:{passed:true},window:{startedAt:new Date(Date.now()-120000).toISOString(),endedAt:new Date(Date.now()-1000).toISOString()}}})
  const restored=await restoreProtectedSnapshot(result.id, { apply: true })
  assert.equal(restored.applied, true)
  assert.equal(restored.healthConfirmationRequired, true)
  assert.ok((await inspectPolicy({store})).pending)
  await assert.rejects(restoreProtectedSnapshot(result.id, {apply:true}))
  await finishRecovery({store,attemptId:restored.attemptId,success:true,reason:'Isolated test verified restored file only; not host health qualification'})
  assert.equal(fs.readFileSync(path.join(root, 'result.md'), 'utf8'), 'original result')
})

test('manual structured solution persistence and credential rejection', () => {
  const entry = { problem: '按钮没有响应', cause: '事件未绑定', solution: '绑定事件', scriptRefs: ['scripts/check.mjs'], verification: '隔离测试通过', tags: ['UI'] }
  assert.throws(() => recordSolution(entry), /Explicit/)
  assert.throws(() => recordSolution({ ...entry, extra: 'private' }, { explicit: true }))
  for (const secret of ['api_key=abcdefghijklmnop', 'Bearer abcdefghijklmnop', 'password="do-not-store"', 'sk-abcdefghijklmnopqrstuv', '-----BEGIN PRIVATE KEY-----', '密码：不该保存的内容']) assert.throws(() => recordSolution({ ...entry, solution: secret }, { explicit: true }), /credential/)
  const result = recordSolution(entry, { explicit: true })
  assert.deepEqual(listSolutions(), [result])
  assert.equal(listSolutions({ tag: 'UI' }).length, 1)
  assert.equal(listSolutions({ tag: 'missing' }).length, 0)
  const stored = JSON.parse(fs.readFileSync(path.join(home, 'dayu', 'solutions', `${result.id}.json`), 'utf8'))
  assert.deepEqual(Object.keys(stored).sort(), ['problem', 'cause', 'solution', 'scriptRefs', 'verification', 'tags'].sort())
  assert.throws(() => listSolutions({ limit: 0 }))
})
