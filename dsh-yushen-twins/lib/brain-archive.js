// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-brain-archive
 * kind: module
 * summary: 一次性迁移的无损私有档案：只读本地、带 sha256 与 uuid，不自动注入模型或外部通道。
 * tags: 私有档案, 迁移, 只读, 无损
 * created: 2026-11-11 01:10:00
 * changed: 2026-11-11 01:10:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 维护者（迁移/核对时用）；她不读
 * owner: 框架；**这些是私有档案，归她本人**，导出/删除要老板点头
 * mutable: 可改读取逻辑；不许在这里删或改档案正文
 * usage: 读档案 / 校验 sha256；输出只给搬运用
 * why: 迁移时最怕"搬丢了一段"；带指纹才能对账
 * result: 只读 + 指纹核对的档案访问层
 */
// 一次性迁移的无损私有档案。仅本地读取；不自动注入任何模型或外部通道。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { isResidentRole } from './roles.js'
const hash = (buf) => createHash('sha256').update(buf).digest('hex')
function dir(role) {
  // 2026-11-01：住户名单从名册取，照微也能归档（以前这里只认两条鱼）。
  if (!isResidentRole(String(role || ''))) throw new TypeError('未知角色')
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
