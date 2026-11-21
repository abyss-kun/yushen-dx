// 清理过期的「等谁/等事」条目（waiting.json）。
// 只清 **done=true 或 until 已过 7 天以上** 的项；不动未完成的、不动其它文件。
// 删前备份到 档案/；不递归删任何目录。
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE, '.dsh')
const ARCH = 'D:/DSH/大小鱼/档案'
const KEEP_MS = 7 * 24 * 3600 * 1000
const now = Date.now()
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const report = []

for (const role of ['dayu', 'xiaoyu', 'dragon']) {
  const p = path.join(HOME, 'dayu', 'runtime', role, 'waiting.json')
  if (!fs.existsSync(p)) continue
  const raw = fs.readFileSync(p, 'utf8')
  let doc
  try { doc = JSON.parse(raw) } catch { report.push(`${role}: JSON 坏了，跳过`); continue }
  const items = Array.isArray(doc.items) ? doc.items : []
  const keep = []
  const gone = []
  for (const it of items) {
    const until = Number(it.until) || 0
    const expiredLong = until > 0 && now - until > KEEP_MS
    if (it.done === true || expiredLong) gone.push(it)
    else keep.push(it)
  }
  if (!gone.length) { report.push(`${role}: 无需清理（${items.length} 条）`); continue }
  const bak = path.join(ARCH, `waiting-${role}-改前-${stamp}.json`)
  fs.copyFileSync(p, bak)
  doc.items = keep
  doc.updatedAt = new Date().toISOString()
  fs.writeFileSync(p, JSON.stringify(doc, null, 1) + '\n', 'utf8')
  report.push(`${role}: 清 ${gone.length} 条（done 或过期>7天），留 ${keep.length} 条；备份 ${path.basename(bak)}`)
}
console.log(report.join('\n'))
