/**
 * Incremental local history (Node >=22, async filesystem only).
 * API:
 *   createBackup({ roots: [{id, path}], store, maxFileBytes=64*1024*1024 })
 *     -> { skipped, id, manifest }; identical root IDs/content skip a snapshot.
 *   listSnapshots({store}) -> [{id,createdAt,kind,files,bytes}]
 *   inspectSnapshot({store,id,maxFileBytes}) -> fully verified manifest
 *   verifySnapshot({store,id,maxFileBytes}) -> {ok:true,id,files,bytes}
 *   restoreSnapshot({store,id,roots:[{id,path}],apply=false,maxFileBytes})
 *     -> {applied,changes,protectionSnapshotId}; remap is mandatory; manifest
 *        absolute paths are never used. Extra current files are NEVER deleted.
 *        Before any overwrite, an immutable protection snapshot saves ALL files
 *        being overwritten. Dry runs are read-only (no store/target creation).
 *
 * Layout: objects/<sha256>, snapshots/<timestamp-uuid>.json. Manifests contain
 * full relative file inventories plus deletions since the previous inventory.
 * Publication uses hard-link create-if-absent (never rename-overwrite).
 * No GC: old objects, deleted files and protection versions remain recoverable.
 * Locks are local-host only, store-wide, PID-owned nonempty directories. A live
 * PID is never evicted; dead owners are reclaimed. Candidate/temp leftovers are
 * harmless and ignored, not mistaken for committed snapshots. Unsupported
 * hardlinks fail clearly. No distributed/network-filesystem locking guarantee.
 * Sources/targets must be quiescent: concurrent external writers or hostile
 * filesystem mutation are not supported; detectable changes fail before apply.
 * SHA256 detects corruption, not an attacker rewriting both manifest and objects.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024
const HASH = /^[a-f0-9]{64}$/
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
const SNAP = /^[0-9]{13}-[a-f0-9-]{36}$/
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024
const digest = data => crypto.createHash('sha256').update(data).digest('hex')
const fail = message => { throw new Error(`versioned-backup: ${message}`) }
const missing = e => e.code === 'ENOENT'
function bound(value = DEFAULT_MAX_FILE_BYTES) {
  if (!Number.isSafeInteger(value) || value < 1) fail('maxFileBytes must be a positive safe integer')
  return value
}
function inside(parent, child) {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))
}
function relative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.includes('\0') || value.startsWith('/') || value.split('/').some(x => !x || x === '.' || x === '..' || /[. ]$/.test(x) || /[<>"|?*\x00-\x1f]/.test(x) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(x))) fail(`unsafe relative path: ${JSON.stringify(value)}`)
  return value
}
const CODE_EXT = /\.(?:[cm]?js|jsx|tsx?|py|go|rs|java|cs|cpp?|h|hpp|rb|php|swift|kt|sh)$/i
function excluded(name, isDirectory = false) {
  // protection = 备份库自己（快照 + 对象 + 冷档）。要是把 ~/.dsh/dayu 整个当备份根，
  // 不排除它就会「备份里面装着备份」，越备越大。2026-10-27 为「优先备份她们」这一步先加。
  if (/^(node_modules|\.git|dist|backups?|protection|\.cache|cache|\.turbo|\.next|\.vite)$/i.test(name) || (isDirectory && /^\.state$/i.test(name)) || /^\.env(?:\.|$)/i.test(name)) return true
  if (/\.(?:pem|key|p12|pfx|crt|cer|der|keystore|dpapi)$/i.test(name) || /^id_(?:rsa|ed25519|ecdsa|dsa)(?:\.|$)/i.test(name)) return true
  if (/^(?:secrets?|credentials?|certificates?|private[-_]?keys?|auth[-_]?data|tokens?)$/i.test(name)) return true
  if (CODE_EXT.test(name)) return false
  return /(?:secret|credential|password|private[-_]?key|api[-_]?key|token|auth|密钥|凭据|证书)/i.test(name)
}
const SENSITIVE_VALUE = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[=:]\s*["'][^"'\s]{8,}["']/i
async function stat(file) {
  try { return await fs.lstat(file) } catch (e) { if (missing(e)) return null; throw e }
}
// Check every existing component, including junctions and ancestor symlinks.
async function safe(file) {
  const full = path.resolve(file)
  const parsed = path.parse(full)
  let current = parsed.root
  for (const part of full.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const s = await stat(current)
    if (s?.isSymbolicLink()) fail(`symlink/junction refused: ${current}`)
    if (s && current !== full && !s.isDirectory()) fail(`non-directory ancestor: ${current}`)
  }
  return full
}
async function directory(file, create = false) {
  const full = await safe(file)
  if (create) await fs.mkdir(full, {recursive:true})
  const s = await stat(full)
  if (!s?.isDirectory()) fail(`directory not found: ${full}`)
  return full
}
async function rootsFor(roots, store) {
  if (!Array.isArray(roots) || !roots.length) fail('explicit roots [{id,path}] required')
  const ids = new Set(), result = []
  for (const root of roots) {
    if (!root || typeof root.id !== 'string' || !ID.test(root.id) || ids.has(root.id)) fail('invalid/duplicate root id')
    if (typeof root.path !== 'string' || !path.isAbsolute(root.path)) fail(`root ${root.id} requires absolute path`)
    ids.add(root.id)
    const full = await safe(root.path)
    if (inside(full, store) || inside(store, full)) fail(`store/root overlap: ${root.id}`)
    if (result.some(r => inside(r.path, full) || inside(full, r.path))) fail('overlapping roots refused')
    result.push({id:root.id,path:full})
  }
  return result.sort((a,b) => a.id.localeCompare(b.id))
}
async function bytes(file, max) {
  await safe(file)
  const handle = await fs.open(file, 'r')
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size > max) fail(`not a bounded regular file (${max} bytes): ${file}`)
    const data = Buffer.alloc(before.size)
    let offset = 0
    while (offset < data.length) {
      const {bytesRead} = await handle.read(data, offset, data.length-offset, offset)
      if (!bytesRead) fail(`file changed while reading: ${file}`)
      offset += bytesRead
    }
    const after = await handle.stat()
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail(`file changed while reading: ${file}`)
    return data
  } finally { await handle.close() }
}
async function publish(file, data) {
  await safe(file)
  const tmp = path.join(path.dirname(file), `.tmp-${process.pid}-${crypto.randomUUID()}`)
  const handle = await fs.open(tmp, 'wx', 0o600)
  try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
  try { await fs.link(tmp, file) } finally { await fs.unlink(tmp) }
}
async function object(store, data) {
  const hash = digest(data), file = path.join(store,'objects',hash)
  if (await stat(file)) {
    const existing = await bytes(file, data.length)
    if (digest(existing) !== hash) fail(`corrupt existing object ${hash}`)
  } else await publish(file,data)
  return hash
}
async function lock(store, action) {
  await directory(store,true)
  const token = crypto.randomUUID(), candidate = path.join(store,`.candidate-${token}`)
  const lockdir = path.join(store,'.write-lock'), owner = `${process.pid}-${token}.json`
  await fs.mkdir(candidate)
  await fs.writeFile(path.join(candidate,owner),JSON.stringify({pid:process.pid,host:os.hostname()}),{flag:'wx'})
  let acquired = false
  try {
    for (let attempt=0; attempt<4 && !acquired; attempt++) {
      try { await fs.rename(candidate,lockdir); acquired=true } catch(e) {
        if (!['EEXIST','ENOTEMPTY','EPERM','EACCES'].includes(e.code)) throw e
        await directory(lockdir)
        const entries = await fs.readdir(lockdir)
        if (entries.length === 0) {
          // Only a reclaim/release crash can leave this empty: acquisition always
          // publishes a pre-populated directory. rmdir cannot delete a new owner.
          try { await fs.rmdir(lockdir) } catch (err) { if (!['ENOENT','ENOTEMPTY'].includes(err.code)) throw err }
          continue
        }
        if (entries.length !== 1 || !/^\d+-[a-f0-9-]+\.json$/.test(entries[0])) fail('invalid lock; manual inspection required')
        const info = JSON.parse((await bytes(path.join(lockdir,entries[0]),4096)).toString())
        if (info.host !== os.hostname() || !Number.isSafeInteger(info.pid) || info.pid < 1) fail('foreign/invalid lock owner')
        let alive = true
        try { process.kill(info.pid,0) } catch(err) { if (err.code === 'ESRCH') alive=false; else if(err.code !== 'EPERM') throw err }
        if (alive) fail('store busy: live writer owns lock')
        try { await fs.unlink(path.join(lockdir,entries[0])); await fs.rmdir(lockdir) } catch(err) {
          if (!['ENOENT','ENOTEMPTY'].includes(err.code)) throw err
        }
      }
    }
    if (!acquired) fail('store busy: retry limit')
    await directory(path.join(store,'objects'),true)
    await directory(path.join(store,'snapshots'),true)
    return await action()
  } finally {
    if (acquired) { await fs.unlink(path.join(lockdir,owner)); await fs.rmdir(lockdir) }
    else { await fs.unlink(path.join(candidate,owner)); await fs.rmdir(candidate) }
  }
}
async function scan(roots, max, save) {
  const files=[], skipped=[], risks=[]
  async function walk(root, dir, prefix='') {
    for (const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (excluded(entry.name, entry.isDirectory())) { skipped.push({rootId:root.id,path:rel,reason:'excluded'}); continue }
      relative(rel)
      const file=path.join(dir,entry.name), s=await fs.lstat(file)
      if (s.isSymbolicLink()) { skipped.push({rootId:root.id,path:rel,reason:'symlink'}); continue }
      if (s.isDirectory()) await walk(root,file,rel)
      else if(s.isFile()) {
        if (s.size > max) { skipped.push({rootId:root.id,path:rel,reason:'oversize',size:s.size,maxFileBytes:max}); continue }
        const data=await bytes(file,max)
        if (SENSITIVE_VALUE.test(data.toString('utf8'))) {
          risks.push({rootId:root.id,path:rel,reason:'sensitive-value-detected'})
          skipped.push({rootId:root.id,path:rel,reason:'sensitive-value-detected'})
          continue
        }
        const hash=save ? await save(data) : digest(data)
        files.push({rootId:root.id,path:rel,hash,size:data.length})
      } else fail(`unsupported special file: ${file}`)
    }
  }
  for (const root of roots) await walk(root,await directory(root.path))
  return {files,skipped,risks}
}
const key = f => `${f.rootId}/${f.path}`
const inventory = m => JSON.stringify({roots:m.roots.map(r=>r.id).sort(),files:[...m.files].sort((a,b)=>key(a).localeCompare(key(b))),skipped:m.skipped||[],risks:m.risks||[]})
async function manifests(store) {
  const dir=path.join(store,'snapshots')
  if (!await stat(dir)) return []
  await directory(dir)
  const entries=await fs.readdir(dir)
  return entries.filter(n=>SNAP.test(n.replace(/\.json$/,'')) && n.endsWith('.json')).sort()
}
async function load(store,id,max) {
  if (typeof id !== 'string' || !SNAP.test(id)) fail('invalid snapshot id')
  const m=JSON.parse((await bytes(path.join(store,'snapshots',`${id}.json`),MAX_MANIFEST_BYTES)).toString())
  if (m.version!==1 || m.id!==id || !Array.isArray(m.roots) || !Array.isArray(m.files) || !Array.isArray(m.deleted) || !['backup','protection'].includes(m.kind)) fail('invalid manifest schema')
  const ids=new Set(), names=new Set()
  for (const r of m.roots) { if (!r || !ID.test(r.id) || ids.has(r.id)) fail('invalid manifest root'); ids.add(r.id) }
  for (const f of [...m.files,...m.deleted]) {
    if (!f || !ids.has(f.rootId)) fail('unknown manifest root')
    relative(f.path)
    // Validate historical inventories independently of today's evolving exclusions.
  }
  const folds=new Set()
  for (const f of m.files) {
    const k=key(f), fold=k.toLowerCase()
    if (names.has(k) || folds.has(fold) || !HASH.test(f.hash) || !Number.isSafeInteger(f.size) || f.size<0 || f.size>max) fail('invalid/duplicate manifest file')
    names.add(k); folds.add(fold)
    const data=await bytes(path.join(store,'objects',f.hash),max)
    if (data.length!==f.size || digest(data)!==f.hash) fail(`object integrity mismatch: ${f.hash}`)
  }
  for (const k of names) for(let i=k.indexOf('/'); i>=0; i=k.indexOf('/',i+1)) if(names.has(k.slice(0,i))) fail('manifest file/directory collision')
  return m
}
async function commit(store,{roots,files,skipped=[],deleted=[],risks=[],kind='backup',sourceSnapshotId=null}) {
  const id=`${Date.now()}-${crypto.randomUUID()}`
  const manifest={version:1,id,createdAt:new Date().toISOString(),kind,sourceSnapshotId,roots:roots.map(r=>({id:r.id})),files,deleted,skipped,risks}
  const data=Buffer.from(JSON.stringify(manifest,null,2)+'\n')
  if(data.length>MAX_MANIFEST_BYTES) fail('manifest size limit exceeded')
  await publish(path.join(store,'snapshots',`${id}.json`),data)
  return {id,manifest}
}
export async function createBackup({roots,store,maxFileBytes}={}) {
  const max=bound(maxFileBytes)
  if(typeof store!=='string' || !path.isAbsolute(store)) fail('absolute store required')
  store=await safe(store)
  roots=await rootsFor(roots,store)
  return lock(store,async()=>{
    const snapshots=await manifests(store)
    let previous=null
    for(const name of snapshots.reverse()) {
      const m=await load(store,name.slice(0,-5),max)
      if(m.kind==='backup' && JSON.stringify(m.roots.map(r=>r.id).sort())===JSON.stringify(roots.map(r=>r.id).sort())) {previous=m;break}
    }
    const current=await scan(roots,max,data=>object(store,data))
    if(previous && inventory(previous)===inventory({roots,...current})) return {skipped:true,id:previous.id,manifest:previous,excluded:current.skipped.filter(x=>x.reason==='excluded').length,oversize:current.skipped.filter(x=>x.reason==='oversize').length,sensitive:current.risks.length}
    const keys=new Set(current.files.map(key))
    const deleted=previous ? previous.files.filter(f=>!keys.has(key(f))).map(({rootId,path})=>({rootId,path})) : []
    return {skipped:false,...await commit(store,{roots,...current,deleted}),excluded:current.skipped.filter(x=>x.reason==='excluded').length,oversize:current.skipped.filter(x=>x.reason==='oversize').length,sensitive:current.risks.length}
  })
}
export async function inspectSnapshot({store,id,maxFileBytes}={}) {
  return load(await directory(store),id,bound(maxFileBytes))
}
export async function verifySnapshot(options={}) {
  const m=await inspectSnapshot(options)
  return {ok:true,id:m.id,files:m.files.length,bytes:m.files.reduce((n,f)=>n+f.size,0)}
}
export async function listSnapshots({store}={}) {
  store=await directory(store)
  const result=[]
  for(const name of await manifests(store)) {
    // Listing validates metadata and objects too: corruption never silently disappears.
    const m=await load(store,name.slice(0,-5),Number.MAX_SAFE_INTEGER)
    result.push({id:m.id,createdAt:m.createdAt,kind:m.kind,files:m.files.length,bytes:m.files.reduce((n,f)=>n+f.size,0)})
  }
  return result
}
export async function restoreSnapshot({store,id,roots,apply=false,maxFileBytes}={}) {
  const max=bound(maxFileBytes)
  store=await directory(store)
  roots=await rootsFor(roots,store)
  async function run() {
    const m=await load(store,id,max), map=new Map(roots.map(r=>[r.id,r.path]))
    if(m.roots.some(r=>!map.has(r.id)) || roots.some(r=>!m.roots.some(mr=>mr.id===r.id))) fail('root remap must match snapshot root IDs exactly')
    const changes=[], protection=[], checks=[]
    for(const f of m.files) {
      if(f.path.split('/').some((part,index,parts)=>excluded(part,index<parts.length-1))) {
        changes.push({rootId:f.rootId,path:f.path,action:'preserve',reason:'excluded-by-current-policy'}); continue
      }
      const target=await safe(path.join(map.get(f.rootId),...f.path.split('/')))
      const s=await stat(target)
      if(s && !s.isFile()) fail(`restore target is not a regular file: ${target}`)
      const old=s ? await bytes(target,max) : null
      const oldHash=old===null ? null : digest(old)
      checks.push({target,oldHash})
      if(oldHash===f.hash) continue
      changes.push({rootId:f.rootId,path:f.path,action:s?'overwrite':'create',hash:f.hash})
      if(old!==null) protection.push({...f,hash:apply?await object(store,old):oldHash,size:old.length})
    }
    // Show preserved extras, including files marked deleted by historical inventories.
    for(const r of roots) {
      const s=await stat(r.path)
      if(s && !s.isDirectory()) fail(`root not directory: ${r.path}`)
      if(!s) continue
      const current=await scan([r],max)
      const wanted=new Set(m.files.filter(f=>f.rootId===r.id).map(f=>f.path))
      for(const f of current.files) if(!wanted.has(f.path)) changes.push({rootId:r.id,path:f.path,action:'preserve'})
    }
    if(!apply) return {applied:false,id,changes,protectionSnapshotId:null}
    // Detect external edits before starting any target mutation.
    for(const c of checks) {
      await safe(c.target)
      const s=await stat(c.target)
      const hash=s ? digest(await bytes(c.target,max)) : null
      if(hash!==c.oldHash) fail(`target changed during restore planning: ${c.target}`)
    }
    const protectionSnapshotId=protection.length ? (await commit(store,{roots,files:protection,kind:'protection',sourceSnapshotId:id})).id : null
    for(const change of changes.filter(c=>c.action!=='preserve')) {
      const target=await safe(path.join(map.get(change.rootId),...change.path.split('/')))
      await directory(path.dirname(target),true)
      const data=await bytes(path.join(store,'objects',change.hash),max)
      if(digest(data)!==change.hash) fail(`object changed during restore: ${change.hash}; protection=${protectionSnapshotId}`)
      const tmp=path.join(path.dirname(target),`.restore-${crypto.randomUUID()}`)
      const handle=await fs.open(tmp,'wx',0o600)
      try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
      try { await safe(target); await fs.rename(tmp,target) } catch(e) { await fs.unlink(tmp); throw e }
    }
    return {applied:true,id,changes,protectionSnapshotId}
  }
  return apply ? lock(store,run) : run()
}
