// 账本轮转：老事件归档加压，大文件改名留档；不清空、不删内容。
// 规则：events 超过 14 天 → gzip 进 events/archive；动作/工作/崩溃日志超过上限 → 改名留档。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const KEEP_DAYS = 14
const LIMITS = [['actions.jsonl', 2 * 1024 * 1024], ['worklog.jsonl', 2 * 1024 * 1024], ['crash.jsonl', 1 * 1024 * 1024]]
const MAX_ARCHIVES = 20

export function rotateLogs() {
  const result = { archived: [], rotated: [], skipped: [] }
  const eventsDir = path.join(DATA, 'events')
  const archiveDir = path.join(eventsDir, 'archive')
  try {
    fs.mkdirSync(archiveDir, { recursive: true })
    const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000
    for (const name of fs.readdirSync(eventsDir)) {
      if (!name.endsWith('.jsonl')) continue
      const full = path.join(eventsDir, name)
      let st
      try { st = fs.statSync(full) } catch { continue }
      if (st.mtimeMs > cutoff) continue
      const gz = path.join(archiveDir, name + '.gz')
      fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(full)))
      fs.rmSync(full, { force: true })
      result.archived.push(name)
    }
    const archives = fs.readdirSync(archiveDir).filter((n) => n.endsWith('.gz')).map((n) => ({ n, m: fs.statSync(path.join(archiveDir, n)).mtimeMs })).sort((a, b) => b.m - a.m)
    for (const old of archives.slice(MAX_ARCHIVES)) { fs.rmSync(path.join(archiveDir, old.n), { force: true }); result.rotated.push(`删旧档 ${old.n}`) }
  } catch (e) { result.skipped.push(`events: ${e?.message || e}`) }

  for (const [name, limit] of LIMITS) {
    const full = path.join(DATA, name)
    try {
      const st = fs.statSync(full)
      if (st.size <= limit) { result.skipped.push(name); continue }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      fs.renameSync(full, path.join(DATA, `${name.replace(/\.jsonl$/, '')}-${stamp}.jsonl`))
      result.rotated.push(name)
    } catch { result.skipped.push(name) }
  }
  return result
}
