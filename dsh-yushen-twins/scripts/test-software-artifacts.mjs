// Uses only disposable tiny fake installers. Never executes captured artifacts.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import {spawn} from 'node:child_process'
import {captureArtifact,verifyArtifact,listArtifacts,DEFAULT_MAX_ARTIFACT_BYTES} from '../lib/software-artifacts.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(),'software-artifacts-test-'))
const store = path.join(root,'store'), source = path.join(root,'fake-installer.exe')
const metadata = {product:'Test Product',version:'1.0.0',platform:process.platform,arch:process.arch}
const options = {source,store,metadata}
const reject = (promise,pattern) => assert.rejects(promise,pattern)
const leftovers = async () => {
  assert.deepEqual((await fs.readdir(store)).filter(n => /^\.candidate-|^\.write-lock$/.test(n)),[])
  for (const dir of ['objects','artifacts']) assert.equal((await fs.readdir(path.join(store,dir))).some(n => n.startsWith('.tmp-')),false)
}
let count = 0
async function test(name,fn) { await fn(); console.log(`ok ${++count} - ${name}`) }
try {
  await test('default limit and absent-store read are side-effect free',async () => {
    assert.equal(DEFAULT_MAX_ARTIFACT_BYTES,1024 ** 3)
    assert.deepEqual(await listArtifacts({store}),[])
    await reject(fs.stat(store),/ENOENT/)
  })
  let first, second
  const data = Buffer.from('MZ fake fixture only; never execute\n')
  await fs.writeFile(source,data)
  await test('capture, basename-only strict metadata and streaming verify',async () => {
    first = await captureArtifact(options)
    assert.equal(first.manifest.hash,crypto.createHash('sha256').update(data).digest('hex'))
    assert.equal(first.manifest.basename,'fake-installer.exe')
    assert.equal(first.manifest.status,'candidate')
    assert.equal(first.deduplicated,false)
    assert.equal(JSON.stringify(first.manifest).includes(root),false)
    assert.deepEqual(await verifyArtifact({store,id:first.id}),{ok:true,id:first.id,hash:first.manifest.hash,size:data.length,status:'candidate'})
    await leftovers()
  })
  await test('identical captures preserve new manifests and deduplicate bytes',async () => {
    second = await captureArtifact(options)
    assert.notEqual(first.id,second.id)
    assert.equal(second.deduplicated,true)
    assert.equal((await fs.readdir(path.join(store,'objects'))).length,1)
    assert.equal((await listArtifacts({store})).length,2)
    const original = JSON.parse(await fs.readFile(path.join(store,'artifacts',`${first.id}.json`),'utf8'))
    assert.deepEqual(original,first.manifest)
  })
  await test('process-local concurrent captures serialize and retain history',async () => {
    const results = await Promise.all(Array.from({length:6},() => captureArtifact(options)))
    assert.equal(new Set(results.map(x => x.id)).size,6)
    assert.equal((await listArtifacts({store})).length,8)
    assert.equal((await fs.readdir(path.join(store,'objects'))).length,1)
    await leftovers()
  })
  await test('changed version adds an object without altering old versions',async () => {
    await fs.writeFile(source,'new fake fixture')
    const newer = await captureArtifact({...options,metadata:{...metadata,version:'2'}})
    assert.notEqual(newer.manifest.hash,first.manifest.hash)
    assert.equal((await fs.readdir(path.join(store,'objects'))).length,2)
    assert.equal((await verifyArtifact({store,id:first.id})).ok,true)
    await fs.writeFile(source,data)
  })
  await test('bounded file/type/path/metadata validation',async () => {
    await reject(captureArtifact({...options,maxBytes:1}),/limit/)
    await reject(captureArtifact({...options,maxBytes:0}),/maxBytes/)
    await reject(captureArtifact({...options,maxBytes:1.1}),/maxBytes/)
    await reject(captureArtifact({...options,source:root}),/basename/)
    const dir = path.join(root,'folder.exe'); await fs.mkdir(dir)
    await reject(captureArtifact({...options,source:dir}),/regular file/)
    const txt = path.join(root,'wrong.txt'); await fs.writeFile(txt,'fake')
    await reject(captureArtifact({...options,source:txt}),/basename/)
    for (const source of ['https://host/file.exe','file:///tmp/file.exe','relative.exe','\\\\server\\share\\file.exe']) await reject(captureArtifact({...options,source}),/local filesystem/)
    await reject(captureArtifact({...options,metadata:{...metadata,secret:'no'}}),/metadata/)
    await reject(captureArtifact({...options,metadata:{...metadata,product:'password=not-stored'}}),/metadata/)
    await reject(captureArtifact({...options,metadata:{...metadata,version:'C:\\private'}}),/metadata/)
    await reject(verifyArtifact({store,id:'../escape'}),/id/)
    await leftovers()
  })
  await test('symlink file and ancestor/junction are refused',async () => {
    const link = path.join(root,'link.exe')
    try { await fs.symlink(source,link,'file') } catch(e) {
      if (e.code !== 'EPERM') throw e
      console.log('# file symlink unavailable on this host; junction test still mandatory')
    }
    if (await fs.lstat(link).catch(() => null)) await reject(captureArtifact({...options,source:link}),/symlink/)
    const junction = path.join(root,'junction')
    await fs.symlink(root,junction,process.platform === 'win32' ? 'junction' : 'dir')
    await reject(captureArtifact({...options,source:path.join(junction,'fake-installer.exe')}),/symlink/)
    await reject(listArtifacts({store:path.join(junction,'store')}),/symlink/)
  })
  await test('all allowed suffixes including empty bounded files',async () => {
    for (const ext of ['msi','zip','tgz','EXE']) {
      const fixture = path.join(root,`empty.${ext}`); await fs.writeFile(fixture,'')
      const result = await captureArtifact({...options,source:fixture})
      assert.equal((await verifyArtifact({store,id:result.id})).size,0)
    }
  })
  await test('live same-PID and foreign-host lock are never stolen',async () => {
    const lock = path.join(store,'.write-lock'), owner = `${process.pid}-${crypto.randomUUID()}.json`
    await fs.mkdir(lock)
    await fs.writeFile(path.join(lock,owner),JSON.stringify({pid:process.pid,host:os.hostname()}))
    await reject(captureArtifact(options),/busy/)
    assert.equal((await fs.readdir(lock))[0],owner)
    await fs.writeFile(path.join(lock,owner),JSON.stringify({pid:process.pid,host:'not-this-host'}))
    await reject(captureArtifact(options),/foreign/)
    await fs.unlink(path.join(lock,owner)); await fs.rmdir(lock)
    await leftovers()
  })
  await test('dead PID lock is reclaimed using versioned-engine protocol',async () => {
    const child = spawn(process.execPath,['-e',''],{stdio:'ignore'})
    const pid = child.pid
    await new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',resolve) })
    const lock = path.join(store,'.write-lock'), owner = `${pid}-${crypto.randomUUID()}.json`
    await fs.mkdir(lock); await fs.writeFile(path.join(lock,owner),JSON.stringify({pid,host:os.hostname()}))
    await captureArtifact(options)
    await leftovers()
  })
  await test('work-snapshot stores are refused and cleaned',async () => {
    const mixed = path.join(root,'mixed'); await fs.mkdir(path.join(mixed,'snapshots'),{recursive:true})
    await reject(captureArtifact({...options,store:mixed}),/dedicated/)
    assert.deepEqual(await fs.readdir(mixed),['snapshots'])
  })
  await test('streaming verification detects corruption; capture does not replace corrupt objects',async () => {
    const object = path.join(store,'objects',first.manifest.hash)
    await fs.writeFile(object,Buffer.alloc(data.length,42))
    await reject(verifyArtifact({store,id:first.id}),/integrity/)
    const before = (await listArtifacts({store})).length
    await reject(captureArtifact(options),/corrupt existing/)
    assert.equal((await listArtifacts({store})).length,before)
    assert.deepEqual(await fs.readFile(object),Buffer.alloc(data.length,42))
    await fs.writeFile(object,data)
    await leftovers()
  })
  await test('manifest corruption and unexpected path data are rejected',async () => {
    const file = path.join(store,'artifacts',`${first.id}.json`)
    await fs.writeFile(file,JSON.stringify({...first.manifest,source}))
    await reject(verifyArtifact({store,id:first.id}),/manifest/)
    await reject(listArtifacts({store}),/manifest/)
    await fs.writeFile(file,JSON.stringify(first.manifest))
    assert.equal((await verifyArtifact({store,id:first.id})).ok,true)
  })
  await test('failed atomic manifest publish never overwrites history and cleans temps',async () => {
    const originalLink = fs.link
    const before = (await listArtifacts({store})).length
    fs.link = async function(from,to) {
      if (path.dirname(to) === path.join(store,'artifacts')) {
        const error = new Error('injected manifest collision'); error.code = 'EEXIST'; throw error
      }
      return originalLink.call(this,from,to)
    }
    try { await reject(captureArtifact(options),/injected manifest collision/) } finally { fs.link = originalLink }
    assert.equal((await listArtifacts({store})).length,before)
    assert.equal((await verifyArtifact({store,id:first.id})).ok,true)
    await leftovers()
  })
  await test('capture checks source stability and cleans temporary files on injected read failure',async () => {
    // Instrument only the disposable fixture handle; exercise the real stream loop.
    const originalOpen = fs.open
    fs.open = async function(file,...args) {
      const handle = await originalOpen.call(this,file,...args)
      if (file === source) {
        const originalRead = handle.read.bind(handle)
        let changed = false
        handle.read = async (...readArgs) => {
          const result = await originalRead(...readArgs)
          if (!changed) { changed = true; await fs.appendFile(source,'changed') }
          return result
        }
      }
      return handle
    }
    try { await reject(captureArtifact(options),/grew|changed/) } finally { fs.open = originalOpen }
    await leftovers()
    await fs.writeFile(source,data)
    await captureArtifact(options) // a failed queued operation does not poison queue
  })
  console.log(`PASS ${count} software-artifact tests; only fake temporary installers were preserved`)
} finally {
  // root was returned by mkdtemp above; verify it is the intended temp directory.
  assert.equal(path.dirname(root),os.tmpdir())
  assert.ok(path.basename(root).startsWith('software-artifacts-test-'))
  await fs.rm(root,{recursive:true,force:true})
}
