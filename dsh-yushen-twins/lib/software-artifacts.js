/**
 * Explicit, single-file installer preservation; Node >=22, local disk/single host.
 * captureArtifact({source,store,maxBytes=1GiB,metadata:{product,version,platform,arch}})
 *   -> {id,manifest,deduplicated}; every capture keeps a new immutable candidate.
 * verifyArtifact({store,id}) -> {ok:true,id,hash,size,status:'candidate'} (streaming).
 * listArtifacts({store}) -> validated manifests, newest first; absent store -> [].
 * Nothing executes, installs, restores, uploads, or declares software healthy.
 * Use a dedicated software-artifact store, not a work-snapshot store. Shared
 * lock protocol is a defensive compatibility boundary, not mixed-store support.
 * Layout: objects/<sha256>, artifacts/<timestamp-uuid>.json. Publish is an atomic
 * hardlink from a synced single-file temp, never rename-overwrite. Requires local
 * filesystem hardlinks; no distributed locking or power-loss durability promise.
 * .write-lock uses the versioned engine's PID/host directory protocol (not its
 * private implementation). This module queues local writers; other modules or
 * processes holding a live lock cause a busy error, not lock theft. Dead PID locks
 * can be reclaimed; PID reuse conservatively stays busy. No automatic stale-age
 * eviction. Sources/store must be quiescent against external/hostile mutation;
 * detectable stat changes fail. SHA256 detects corruption, not malicious rewrites
 * of both object and manifest. Failed captures may leave an unreferenced immutable
 * object; temporary files and owned locks are cleaned. No GC deletes history.
 * Metadata is a strict, short label allowlist, not a free-form secret container.
 * Caller must explicitly select a non-secret installer; binary payloads cannot be
 * reliably secret-scanned. Only the basename, never the source path, is recorded.
 */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export const DEFAULT_MAX_ARTIFACT_BYTES = 1024 ** 3
const HASH = /^[a-f0-9]{64}$/
const ID = /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const EXT = /\.(exe|msi|zip|tgz)$/i
const MAX_MANIFEST_BYTES = 8192
const queues = new Map()
const fail = message => { throw new Error(`software-artifacts: ${message}`) }
const missing = e => e.code === 'ENOENT'
const secret = /(?:secret|credential|password|api[-_ ]?key|access[-_ ]?token|bearer|private[-_ ]?key|密钥|凭据)|(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{16,})/i

function local(value) {
  if (typeof value !== 'string' || !value || !path.isAbsolute(value) || /^[\\/]{2}/.test(value) || value.includes('\0') || /:/.test(value.slice(process.platform === 'win32' ? 2 : 0))) fail('absolute local filesystem path required (no URL, UNC, device or alternate stream)')
  return path.resolve(value)
}
async function stat(file) {
  try { return await fs.lstat(file, {bigint:true}) } catch (e) { if (missing(e)) return null; throw e }
}
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
async function directory(file, create = false) {
  await safe(file)
  if (create) await fs.mkdir(file, {recursive:true})
  const s = await stat(file)
  if (!s?.isDirectory()) fail('store directory unavailable')
  return file
}
function label(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120 || value.trim() !== value || !/^[\p{L}\p{N} ._()+-]+$/u.test(value) || secret.test(value)) fail('invalid or sensitive metadata label')
  return value
}
function metadataFor(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || Object.keys(metadata).sort().join(',') !== 'arch,platform,product,version') fail('metadata requires only product, version, platform, arch')
  return Object.fromEntries(['product','version','platform','arch'].map(k => [k,label(metadata[k])]))
}
function basename(value) {
  if (typeof value !== 'string' || value.length > 240 || value !== path.basename(value) || /[\\/:\x00-\x1f<>"|?*]/.test(value) || /[. ]$/.test(value) || !EXT.test(value) || secret.test(value)) fail('unsupported or sensitive artifact basename')
  return value
}
function bound(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('maxBytes must be a positive safe integer')
  return value
}
function stable(a,b) {
  return a.isFile() && b?.isFile() && ['dev','ino','size','mtimeNs','ctimeNs'].every(k => a[k] === b[k])
}
// One bounded buffer regardless of artifact size. Verify uses the same reader but
// no destination; fstat and pathname lstat both must still match the opened file.
async function streamFile(file, maxBytes, destination) {
  await safe(file)
  const beforePath = await stat(file)
  if (!beforePath?.isFile()) fail('regular file required (no symlinks)')
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const before = await handle.stat({bigint:true})
    if (!stable(beforePath,before) || before.size > BigInt(maxBytes)) fail('file exceeds limit or changed before capture')
    const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(256 * 1024)
    let size = 0
    for (;;) {
      const {bytesRead} = await handle.read(buffer,0,buffer.length,null)
      if (!bytesRead) break
      size += bytesRead
      if (size > maxBytes || BigInt(size) > before.size) fail('file grew beyond captured size or limit')
      const chunk = buffer.subarray(0,bytesRead)
      hash.update(chunk)
      if (destination) {
        let offset = 0
        while (offset < bytesRead) {
          const {bytesWritten} = await destination.write(chunk,offset,bytesRead-offset,null)
          if (!bytesWritten) fail('short artifact write')
          offset += bytesWritten
        }
      }
    }
    const after = await handle.stat({bigint:true})
    const afterPath = await stat(file)
    if (BigInt(size) !== before.size || !stable(before,after) || !stable(before,afterPath)) fail('file changed during capture/verification')
    return {hash:hash.digest('hex'),size}
  } finally { await handle.close() }
}
async function smallJson(file, max = MAX_MANIFEST_BYTES) {
  await safe(file)
  const before = await stat(file)
  if (!before?.isFile() || before.size > BigInt(max)) fail('invalid bounded manifest/lock file')
  // Read through a bounded handle, not readFile: external growth must not allocate
  // arbitrary memory even for the small manifest/lock formats.
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const buffer = Buffer.alloc(max + 1)
    let size = 0
    while (size < buffer.length) {
      const {bytesRead} = await handle.read(buffer,size,buffer.length-size,null)
      if (!bytesRead) break
      size += bytesRead
    }
    if (size > max || !stable(before,await handle.stat({bigint:true})) || !stable(before,await stat(file))) fail('manifest/lock changed or too large')
    return JSON.parse(buffer.subarray(0,size).toString('utf8'))
  } finally { await handle.close() }
}
async function tempFile(dir, action) {
  const temp = path.join(dir,`.tmp-artifact-${process.pid}-${crypto.randomUUID()}`)
  const handle = await fs.open(temp,'wx',0o600)
  try {
    const result = await action(handle,temp)
    return result
  } finally {
    try { await handle.close() } finally {
      await fs.unlink(temp).catch(e => { if (!missing(e)) throw e })
    }
  }
}
async function publishManifest(store, manifest) {
  const target = path.join(store,'artifacts',`${manifest.id}.json`)
  await safe(target)
  await tempFile(path.dirname(target),async (handle,temp) => {
    await handle.writeFile(`${JSON.stringify(manifest,null,2)}\n`)
    await handle.sync()
    await fs.link(temp,target) // EEXIST must fail, never replace historical data.
  })
}
async function locked(store, action) {
  await directory(store,true)
  const token = crypto.randomUUID(), candidate = path.join(store,`.candidate-${token}`)
  const lockdir = path.join(store,'.write-lock'), owner = `${process.pid}-${token}.json`
  let acquired = false
  await fs.mkdir(candidate)
  try {
    await fs.writeFile(path.join(candidate,owner),JSON.stringify({pid:process.pid,host:os.hostname()}),{flag:'wx',mode:0o600})
    for (let attempt=0; attempt<8 && !acquired; attempt++) {
      try { await fs.rename(candidate,lockdir); acquired = true } catch (e) {
        if (!['EEXIST','ENOTEMPTY','EPERM','EACCES'].includes(e.code)) throw e
        await directory(lockdir)
        const entries = await fs.readdir(lockdir)
        if (!entries.length) {
          await fs.rmdir(lockdir).catch(err => { if (!['ENOENT','ENOTEMPTY'].includes(err.code)) throw err })
          continue
        }
        if (entries.length !== 1 || !/^\d+-[a-f0-9-]+\.json$/.test(entries[0])) fail('invalid lock; manual inspection required')
        const info = await smallJson(path.join(lockdir,entries[0]),4096)
        if (info.host !== os.hostname() || !Number.isSafeInteger(info.pid) || info.pid < 1 || !entries[0].startsWith(`${info.pid}-`)) fail('foreign/invalid lock owner')
        let alive = true
        try { process.kill(info.pid,0) } catch (err) { if (err.code === 'ESRCH') alive = false; else if (err.code !== 'EPERM') throw err }
        if (alive) fail('store busy: live writer owns lock')
        await fs.unlink(path.join(lockdir,entries[0])).catch(err => { if (!missing(err)) throw err })
        await fs.rmdir(lockdir).catch(err => { if (!['ENOENT','ENOTEMPTY'].includes(err.code)) throw err })
      }
    }
    if (!acquired) fail('store busy: retry limit')
    if (await stat(path.join(store,'snapshots'))) fail('dedicated artifact store required; work snapshot store refused')
    await directory(path.join(store,'objects'),true)
    await directory(path.join(store,'artifacts'),true)
    return await action()
  } finally {
    const dir = acquired ? lockdir : candidate
    await fs.unlink(path.join(dir,owner)).catch(e => { if (!missing(e)) throw e })
    await fs.rmdir(dir).catch(e => { if (!missing(e)) throw e })
  }
}
async function serialized(store, action) {
  const key = process.platform === 'win32' ? store.toLowerCase() : store
  const previous = queues.get(key) || Promise.resolve()
  const task = previous.catch(() => {}).then(() => locked(store,action))
  queues.set(key,task)
  try { return await task } finally { if (queues.get(key) === task) queues.delete(key) }
}
function validatedManifest(m,id) {
  if (!m || Object.keys(m).sort().join(',') !== 'basename,createdAt,hash,id,metadata,schema,size,status' || m.schema !== 1 || m.id !== id || !ID.test(m.id) || m.status !== 'candidate' || !HASH.test(m.hash) || !Number.isSafeInteger(m.size) || m.size < 0 || typeof m.createdAt !== 'string' || !Number.isFinite(Date.parse(m.createdAt))) fail('invalid artifact manifest')
  basename(m.basename)
  metadataFor(m.metadata)
  return m
}
async function manifestFor(store,id) {
  if (typeof id !== 'string' || !ID.test(id)) fail('invalid artifact id')
  await directory(store)
  return validatedManifest(await smallJson(path.join(store,'artifacts',`${id}.json`)),id)
}

export async function captureArtifact({source,store,maxBytes=DEFAULT_MAX_ARTIFACT_BYTES,metadata} = {}) {
  source = local(source); store = local(store); bound(maxBytes)
  const name = basename(path.basename(source)), labels = metadataFor(metadata)
  const rel = path.relative(store,source)
  if (!rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))) fail('artifact source must be outside store')
  await safe(source)
  return serialized(store,async () => {
    let deduplicated = false
    const captured = await tempFile(path.join(store,'objects'),async (handle,temp) => {
      const result = await streamFile(source,maxBytes,handle)
      await handle.sync()
      const target = path.join(store,'objects',result.hash)
      await safe(target)
      if (await stat(target)) {
        const existing = await streamFile(target,maxBytes)
        if (existing.hash !== result.hash || existing.size !== result.size) fail('corrupt existing artifact object')
        deduplicated = true
      } else {
        await fs.link(temp,target)
      }
      return result
    })
    const id = `${Date.now()}-${crypto.randomUUID()}`
    const manifest = {schema:1,id,createdAt:new Date().toISOString(),status:'candidate',basename:name,metadata:labels,...captured}
    await publishManifest(store,manifest)
    return {id,manifest,deduplicated}
  })
}

export async function verifyArtifact({store,id} = {}) {
  store = local(store)
  const manifest = await manifestFor(store,id)
  const result = await streamFile(path.join(store,'objects',manifest.hash),Math.max(1,manifest.size))
  if (result.hash !== manifest.hash || result.size !== manifest.size) fail('artifact integrity mismatch')
  return {ok:true,id,...result,status:'candidate'}
}

export async function listArtifacts({store} = {}) {
  store = local(store)
  await safe(store)
  if (!await stat(store)) return []
  await directory(store)
  const dir = path.join(store,'artifacts')
  await safe(dir)
  if (!await stat(dir)) return []
  await directory(dir)
  const result = []
  for (const name of (await fs.readdir(dir)).sort().reverse()) {
    if (name.startsWith('.tmp-')) continue
    if (!name.endsWith('.json') || !ID.test(name.slice(0,-5))) fail('unexpected artifact manifest entry')
    result.push(await manifestFor(store,name.slice(0,-5)))
  }
  return result
}
