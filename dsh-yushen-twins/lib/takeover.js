// 接管前的底片：动别人的文件之前先拍一张，走的时候（卸载/交还）按它还原。
//
// 边界（用户原话）：只还「我们改过的那部分」；**记忆永远是人家自己的**，
// 不管装没装、走没走，都不动。所以 NEVER_TOUCH 里的路径一律跳过。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const DATA = path.join(HOME, 'dayu')
export const TAKEOVER_DIR = path.join(DATA, 'takeover')

// 这些路径只读不还：记忆、卡、备份、附件——都是人家自己的东西
export const NEVER_TOUCH = /(^|[\\/])(memory|memories|cards|backups?|attachments|archive)([\\/]|$)|\.memory\.json$|(^|[\\/])memory\.[^\\/]*\.json$/i

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

export function isProtected(filePath) {
  return NEVER_TOUCH.test(String(filePath || ''))
}

/**
 * 拍底片。
 * @param {string} id 这次接管的标识（插件名 + 动作，例如 import-dafeiyu）
 * @param {string[]} files 会被改动的文件绝对路径
 * @param {{note?: string}} [opts]
 */
export function snapshot(id, files = [], { note = '' } = {}) {
  const key = String(id || '').trim()
  if (!/^[a-z0-9._-]{2,64}$/i.test(key)) throw new TypeError(`接管标识不合法：${id}`)
  const dir = path.join(TAKEOVER_DIR, key)
  if (fs.existsSync(dir)) throw new TypeError(`已经拍过底片：${key}（先 restore 或换一个标识）`)
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true })
  const entries = []
  for (const file of files) {
    const abs = path.resolve(String(file))
    if (isProtected(abs)) { entries.push({ path: abs, protected: true }); continue }
    const existed = fs.existsSync(abs)
    if (!existed) { entries.push({ path: abs, existed: false }); continue }
    const buf = fs.readFileSync(abs)
    const copy = path.join(dir, 'files', sha(abs).slice(0, 12) + '-' + path.basename(abs))
    fs.writeFileSync(copy, buf)
    entries.push({ path: abs, existed: true, sha256: sha(buf), copy, bytes: buf.length })
  }
  const manifest = { id: key, at: new Date().toISOString(), note: String(note || ''), entries }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return { ok: true, id: key, entries: entries.length, protected: entries.filter((e) => e.protected).length }
}

export function listTakeovers() {
  try {
    return fs.readdirSync(TAKEOVER_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        try { return JSON.parse(fs.readFileSync(path.join(TAKEOVER_DIR, d.name, 'manifest.json'), 'utf8')) } catch { return null }
      })
      .filter(Boolean)
  } catch { return [] }
}

/**
 * 记下「我们改完之后」的样子（第二次指纹）。
 * 还原时拿它和当前文件比：不一样就说明别人后来又改过，不能覆盖。
 */
export function markApplied(id, files = []) {
  const key = String(id || '').trim()
  const file = path.join(TAKEOVER_DIR, key, 'manifest.json')
  if (!fs.existsSync(file)) throw new TypeError(`没有这个底片：${key}`)
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  const applied = manifest.applied && typeof manifest.applied === 'object' ? manifest.applied : {}
  const list = files.length ? files : (manifest.entries || []).map((e) => e.path)
  let n = 0
  for (const p of list) {
    const abs = path.resolve(String(p))
    if (!fs.existsSync(abs)) continue
    applied[abs] = sha(fs.readFileSync(abs))
    n += 1
  }
  manifest.applied = applied
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return { ok: true, id: key, marked: n }
}

/**
 * 按底片还原。
 * - 记忆/卡/备份：跳过，永远不动
 * - 备份后有人又改过（当前指纹 ≠ 我们改完的指纹）：不覆盖，保留现状并报出来
 * - 原来不存在的文件：删掉
 * - 原来存在的：写回原内容
 * @returns {{ ok: boolean, restored: string[], removed: string[], skipped: string[] }}
 */
export function restore(id, { dryRun = false } = {}) {
  const key = String(id || '').trim()
  const dir = path.join(TAKEOVER_DIR, key)
  const file = path.join(dir, 'manifest.json')
  if (!fs.existsSync(file)) throw new TypeError(`没有这个底片：${key}`)
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  const applied = manifest.applied && typeof manifest.applied === 'object' ? manifest.applied : {}
  const out = { ok: true, restored: [], removed: [], skipped: [] }
  for (const entry of manifest.entries || []) {
    const abs = entry.path
    if (entry.protected || isProtected(abs)) { out.skipped.push(abs); continue }
    if (dryRun) { out.restored.push(abs); continue }
    try {
      const cur = fs.existsSync(abs) ? sha(fs.readFileSync(abs)) : ''
      // 我们改完之后的指纹对不上 → 中间有人动过，别覆盖人家
      if (applied[abs] && cur && cur !== applied[abs]) {
        out.skipped.push(`${abs}（备份后又有改动，保留现状，不覆盖）`)
        continue
      }
      if (!entry.existed) {
        if (cur) { fs.rmSync(abs, { force: true }); out.removed.push(abs) }
        continue
      }
      if (!cur) { out.skipped.push(`${abs}（现在不存在，保留缺失，不擅自恢复）`); continue }
      const buf = fs.readFileSync(entry.copy)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, buf)
      out.restored.push(abs)
    } catch (e) {
      out.ok = false
      out.skipped.push(`${abs}（${e?.message || e}）`)
    }
  }
  return out
}
