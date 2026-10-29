// 离线快照：把关键数据定期拷到另一块盘（比如 E:），并清掉太老的。
// 只做文件拷贝；不加密、不上传、不调模型。目标盘不在就跳过，不报错。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { packageRoot } from './paths.js'
import { offsiteDir } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export const DEFAULT_ROOTS = [
  'dayu/soul',
  'dayu/journal',
  'dayu/story',
  'dayu/ideas',
  'dayu/solutions',
  'dayu/character-library',
  'dayu/characters.json',
  'dayu/awakening.json',
  'dayu/ranks.json',
  'dayu/freetime.json',
  packageRoot(),
]

const EXCLUDE = /[\\/](node_modules|\.git|dist|\.cache)[\\/]|\.log$/i

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function countFiles(dir) {
  let files = 0, bytes = 0
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { const s = countFiles(full); files += s.files; bytes += s.bytes } else if (e.isFile()) { files += 1; bytes += fs.statSync(full).size }
    }
  } catch { /* 读不了跳过 */ }
  return { files, bytes }
}

/** 跑一次：拷到 target/<时间戳>/，写 manifest，按 keep 清旧。 */
export function runOffsiteBackup({ target = offsiteDir(), keep = 14, roots = DEFAULT_ROOTS, home = HOME, now = new Date(), dryRun = false } = {}) {
  const exists = fs.existsSync(target)
  if (!exists) {
    if (!dryRun) {
      try { fs.mkdirSync(target, { recursive: true }) } catch { return { ok: false, reason: `目标盘不可用：${target}` } }
    } else return { ok: false, reason: `目标盘不可用：${target}` }
  }
  const dir = path.join(target, stamp(now))
  if (!dryRun) fs.mkdirSync(dir, { recursive: true })
  const copied = []
  for (const rel of roots) {
    const absolute = path.isAbsolute(rel)
    const src = absolute ? rel : path.join(home, rel)
    if (!fs.existsSync(src)) continue
    const dst = path.join(dir, absolute ? path.join('extra', path.basename(rel)) : rel)
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.cpSync(src, dst, { recursive: true, filter: (from) => !EXCLUDE.test(from) })
    }
    const s = countFiles(src)
    copied.push({ rel: absolute ? `extra/${path.basename(rel)}` : rel, files: s.files, bytes: s.bytes })
  }
  const manifest = {
    at: now.toISOString(),
    source: home,
    roots: copied,
    totalFiles: copied.reduce((n, x) => n + x.files, 0),
    totalBytes: copied.reduce((n, x) => n + x.bytes, 0),
  }
  if (!dryRun) fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  // 清理：只留最近 keep 份
  let pruned = []
  if (!dryRun) {
    let dirs = []
    try { dirs = fs.readdirSync(target, { withFileTypes: true }).filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(e.name)).map((e) => e.name).sort() } catch { dirs = [] }
    while (dirs.length > Math.max(1, keep)) {
      const old = dirs.shift()
      try { fs.rmSync(path.join(target, old), { recursive: true, force: true }); pruned.push(old) } catch { /* 删不掉就留着 */ }
    }
  }
  const sha = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16)
  return { ok: true, dir, manifest, sha, pruned, dryRun }
}
