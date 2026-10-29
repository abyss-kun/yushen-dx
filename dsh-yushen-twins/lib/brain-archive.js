// 一次性迁移的无损私有档案。仅本地读取；不自动注入任何模型或外部通道。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
const hash = (buf) => createHash('sha256').update(buf).digest('hex')
function dir(role) {
  if (!['dayu', 'xiaoyu'].includes(role)) throw new TypeError('未知角色')
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'brain-archives', role)
}
export function archiveSource(role, file, { kind = 'history' } = {}) {
  const folder = dir(role)
  if (!['history','persona'].includes(kind)) throw new TypeError('未知档案种类')
  const source = path.resolve(file)
  const content = fs.readFileSync(source)
  const sha256 = hash(content)
  fs.mkdirSync(folder, { recursive: true })
  const target = path.join(folder, `${sha256}.json`)
  if (fs.existsSync(target)) {
    const existing = JSON.parse(fs.readFileSync(target, 'utf8'))
    if (existing.role !== role || hash(Buffer.from(existing.base64, 'base64')) !== sha256) throw new Error('已有档案损坏')
    return { role, sha256, path: target, duplicate: true }
  }
  const record = { version: 1, role, kind, visibility: 'private', source, sha256, archivedAt: new Date().toISOString(), encoding: 'base64', base64: content.toString('base64') }
  const temp = `${target}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temp, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 })
    fs.renameSync(temp, target)
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  return { role, sha256, path: target, duplicate: false }
}
export function readArchive(role, sha256) {
  const folder = dir(role)
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError('非法哈希')
  const record = JSON.parse(fs.readFileSync(path.join(folder, `${sha256}.json`), 'utf8'))
  const content = Buffer.from(record.base64, 'base64')
  if (record.role !== role || record.visibility !== 'private' || record.sha256 !== sha256 || hash(content) !== sha256) throw new Error('档案完整性验证失败')
  return { ...record, content }
}
