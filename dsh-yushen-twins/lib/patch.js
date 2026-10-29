// 半自主补丁：她可以写、可以自测，落地必须老板点头（按钮）。
// 数据：~/.dsh/dayu/patches/<id>/{meta.json,new/<file>}
// 落地：先备份 → 覆盖 → 跑 smoke → 失败自动回滚。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const DIR = path.join(DATA, 'patches')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readMeta(id) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, id, 'meta.json'), 'utf8')) } catch { return null }
}
function writeMeta(meta) {
  const d = path.join(DIR, meta.id)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
}
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16) }

/** 一个补丁 = 若干文件的“完整新内容”。她写，不自动落。 */
export function createPatch({ title, files = [], note = '' } = {}) {
  const list = files.filter((f) => f && f.path && typeof f.content === 'string')
  if (!list.length) throw new Error('补丁里没有文件')
  for (const f of list) {
    const rel = String(f.path).replace(/\\/g, '/')
    if (rel.includes('..') || path.isAbsolute(rel)) throw new Error(`路径不合法：${f.path}`)
    if (!/\.(js|mjs|json|md|yml)$/.test(rel)) throw new Error(`不支持的补丁类型：${rel}`)
  }
  const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  const dir = path.join(DIR, id)
  fs.mkdirSync(path.join(dir, 'new'), { recursive: true })
  const saved = []
  for (const f of list) {
    const rel = String(f.path).replace(/\\/g, '/')
    const target = path.join(dir, 'new', rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, f.content, 'utf8')
    saved.push({ path: rel, bytes: Buffer.byteLength(f.content), sha: sha(f.content) })
  }
  const meta = { id, title: String(title || '未命名补丁').slice(0, 80), note: String(note || '').slice(0, 500), at: new Date().toISOString(), status: 'proposed', files: saved, verify: null, appliedAt: '' }
  writeMeta(meta)
  return meta
}

export function listPatches(limit = 20) {
  try {
    return fs.readdirSync(DIR).map((id) => readMeta(id)).filter(Boolean)
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
  } catch { return [] }
}

function runSmoke() {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, 'scripts', 'smoke.mjs')], { cwd: ROOT, timeout: 120000, windowsHide: true }, (error, stdout, stderr) => {
      const text = `${stdout || ''}\n${stderr || ''}`.trim()
      resolve({ ok: !error, code: error?.code ?? 0, tail: text.split(/\r?\n/).slice(-6).join(' | ') })
    })
  })
}

/** 落地：备份 → 覆盖 → smoke；不过就回滚。这是唯一会改她自己的动作，必须老板点头。 */
export async function applyPatch(id) {
  const meta = readMeta(id)
  if (!meta) throw new Error(`没有这个补丁：${id}`)
  if (meta.status === 'applied') return { ok: true, meta, note: '已经落过了' }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backups = []
  try {
    for (const f of meta.files) {
      const target = path.join(ROOT, f.path)
      const backup = `${target}.bak-${stamp}`
      const existed = fs.existsSync(target)
      if (existed) fs.copyFileSync(target, backup)
      backups.push({ target, backup: existed ? backup : '', existed })
      const src = path.join(DIR, id, 'new', f.path)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(src, target)
    }
    const smoke = await runSmoke()
    meta.verify = { at: new Date().toISOString(), ...smoke, backups }
    if (!smoke.ok) {
      rollback(backups)
      meta.status = 'rolled-back'
      writeMeta(meta)
      return { ok: false, meta, note: 'smoke 没过，已回滚' }
    }
    meta.status = 'applied'
    meta.appliedAt = new Date().toISOString()
    writeMeta(meta)
    return { ok: true, meta, note: '已落地，重启后生效' }
  } catch (error) {
    rollback(backups)
    meta.status = 'rolled-back'
    meta.verify = { at: new Date().toISOString(), ok: false, error: String(error?.message || error) }
    writeMeta(meta)
    return { ok: false, meta, note: `落地失败：${error?.message || error}，已回滚` }
  }
}

/** 回滚：老文件还原；新文件删掉——不然“回滚”会留下一个半成品。 */
function rollback(backups) {
  for (const b of [...backups].reverse()) {
    try {
      if (b.backup && fs.existsSync(b.backup)) fs.copyFileSync(b.backup, b.target)
      else if (!b.existed) fs.rmSync(b.target, { force: true })
    } catch { /* 尽力回滚 */ }
  }
}
