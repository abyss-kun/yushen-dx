import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createBackup,listSnapshots,verifySnapshot,restoreSnapshot,inspectSnapshot} from '../lib/versioned-backup.js'

const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'fish-versioned-backup-'))
const source=path.join(tmp,'source'), store=path.join(tmp,'store'), target=path.join(tmp,'remapped')
await fs.mkdir(source); await fs.mkdir(target)
const root=[{id:'fish',path:source}], mapped=[{id:'fish',path:target}]
const put=async(file,text)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text)}
try {
  await put(path.join(source,'a.txt'),'alpha')
  await put(path.join(source,'nested','b.txt'),'beta')
  await put(path.join(source,'.env'),'NEVER BACK UP')
  await put(path.join(source,'.state','old','snapshot.bin'),'old cache')
  await put(path.join(source,'release','user-artwork.zip'),'keep this user archive')
  await put(path.join(source,'lib','auth.js'),'export const authorize = true')
  await put(path.join(source,'credential.dpapi'),'encrypted fixture')
  await put(path.join(source,'lib','config.js'),'const api_key = "sk-abcdefghijklmnopqrstuvwxyz"')
  const first=await createBackup({roots:root,store})
  assert.equal(first.skipped,false)
  assert.equal(first.manifest.files.length,4)
  assert.ok(first.manifest.files.some(f=>f.path==='release/user-artwork.zip'),'user ZIP archives are not blanket-excluded')
  assert.ok(first.manifest.skipped.some(f=>f.path==='.state'),'old backup cache excluded')
  assert.ok(first.manifest.files.some(f=>f.path==='lib/auth.js'),'auth source code is retained')
  assert.ok(first.manifest.risks.some(r=>r.path==='lib/config.js'))
  assert.equal(first.sensitive,1)
  assert.equal(first.excluded,3,'dotenv, dpapi and old backup cache excluded')
  assert.equal(first.manifest.files.some(f=>f.path==='lib/config.js'),false,'sensitive source file omitted')
  assert.equal((await verifySnapshot({store,id:first.id})).ok,true)
  assert.equal((await createBackup({roots:root,store})).skipped,true,'identical snapshot skipped')
  await put(path.join(source,'a.txt'),'changed')
  await fs.unlink(path.join(source,'nested','b.txt'))
  const second=await createBackup({roots:root,store})
  assert.notEqual(second.id,first.id)
  assert.equal(second.manifest.deleted.length,1,'deletion retained in new history')
  assert.equal((await inspectSnapshot({store,id:first.id})).files.length,4)
  const objects=await fs.readdir(path.join(store,'objects'))
  assert.equal(objects.length,5,'identical beta content stored once across snapshots')
  await put(path.join(target,'a.txt'),'dry-run current')
  await put(path.join(target,'extra.txt'),'keep me')
  const plan=await restoreSnapshot({store,id:first.id,roots:mapped})
  assert.equal(plan.applied,false)
  assert.equal(plan.changes.some(c=>c.path==='a.txt'&&c.action==='overwrite'),true)
  assert.equal(await fs.readFile(path.join(target,'a.txt'),'utf8'),'dry-run current','dry-run changed nothing')
  await put(path.join(target,'a.txt'),'valuable current')
  const restored=await restoreSnapshot({store,id:first.id,roots:mapped,apply:true})
  assert.ok(restored.protectionSnapshotId)
  assert.equal(await fs.readFile(path.join(target,'a.txt'),'utf8'),'alpha')
  assert.equal(await fs.readFile(path.join(target,'extra.txt'),'utf8'),'keep me','restore does not delete extras')
  const protection=await inspectSnapshot({store,id:restored.protectionSnapshotId})
  assert.equal(protection.kind,'protection')
  assert.equal(await fs.readFile(path.join(store,'objects',protection.files[0].hash),'utf8'),'valuable current')
  assert.ok((await listSnapshots({store})).length>=3)
  // Corrupt the latest object: verification must fail loudly.
  const bad=path.join(store,'objects',second.manifest.files.find(f=>f.path==='a.txt').hash)
  await fs.writeFile(bad,'tampered')
  await assert.rejects(()=>verifySnapshot({store,id:second.id}),/integrity|bounded|versioned-backup/i)
  // Manifest path traversal must be rejected before any target activity.
  const escaped=path.join(tmp,'escaped')
  const malicious={...first.manifest,id:'1770000000000-00000000-0000-4000-8000-000000000000',files:[{...first.manifest.files[0],path:'../escaped'}],deleted:[]}
  await fs.writeFile(path.join(store,'snapshots',`${malicious.id}.json`),JSON.stringify(malicious))
  await assert.rejects(()=>restoreSnapshot({store,id:malicious.id,roots:mapped}),/unsafe relative path/)
  await assert.rejects(()=>restoreSnapshot({store,id:first.id,roots:[{id:'fish',path:tmp}]}),/overlap/)
  assert.equal(await fs.stat(escaped).then(()=>true,()=>false),false)
  console.log('versioned-backup tests passed: initial, unchanged, revisions, content dedupe, deletion history, corruption, traversal, dry-run, remap, pre-restore protection, preserve extras')
} finally { await fs.rm(tmp,{recursive:true,force:true}) }
