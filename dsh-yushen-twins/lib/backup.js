// 手动备份：只备份“改过的、还没备份过的”；原文件不动。
// 数据：~/.dsh/dayu/backups/<时间>/<原路径>；清单 ~/.dsh/dayu/backups/manifest.json

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { workspace } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const DIR = path.join(DATA, 'backups')
const MANIFEST = path.join(DIR, 'manifest.json')
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WS = workspace()
const MAX_BYTES = 2 * 1024 * 1024

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) } catch { return { files: {} } }
}
function writeManifest(m) {
  fs.mkdirSync(DIR, { recursive: true })
  const tmp = MANIFEST + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2), 'utf8')
  fs.renameSync(tmp, MANIFEST)
}
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) }

function collect() {
  const out = []
  const walk = (dir, depth) => {
    if (depth > 5) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name.startsWith('.')) {
        if (e.name !== '.dsh') continue
      }
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { walk(full, depth + 1); continue }
      if (!/\.(js|mjs|cjs|json|md|yml|yaml|css|html)$/i.test(e.name)) continue
      if (/\.bak-/.test(e.name)) continue
      try { if (fs.statSync(full).size > MAX_BYTES) continue } catch { continue }
      out.push(full)
    }
  }
  walk(PKG, 0)
  // 工作区里的设定/文档也顺手带上（有就读）
  for (const name of fs.existsSync(WS) ? fs.readdirSync(WS) : []) {
    if (!/\.md$/.test(name)) continue
    const full = path.join(WS, name)
    try { if (fs.statSync(full).isFile()) out.push(full) } catch { /* 跳过 */ }
  }
  return [...new Set(out)]
}

/** 跑一次备份：改了才备，没改跳过。 */
export function runBackup() {
  const manifest = readManifest()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(DIR, stamp)
  const added = []
  const skipped = []
  let bytes = 0
  for (const file of collect()) {
    let buf
    try { buf = fs.readFileSync(file) } catch { continue }
    const key = file
    const h = sha(buf)
    if (manifest.files[key]?.sha === h) { skipped.push(file); continue }
    const target = path.join(dir, path.relative(path.parse(file).root, file))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, buf)
    manifest.files[key] = { sha: h, at: new Date().toISOString(), backup: target }
    added.push(file)
    bytes += buf.length
  }
  if (added.length) {
    fs.writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify({ at: new Date().toISOString(), files: added }, null, 2), 'utf8')
    writeManifest(manifest)
  }
  return { ok: true, dir: added.length ? dir : '', added: added.length, skipped: skipped.length, bytes, at: new Date().toISOString() }
}
