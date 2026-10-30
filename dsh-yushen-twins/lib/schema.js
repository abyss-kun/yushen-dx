// 数据版本与迁移：升级前先备份，迁移可重入；版本对不上不硬跑。
// 数据：~/.dsh/dayu/schema.json · 备份：~/.dsh/dayu/backups/migrate-<时间>/

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const XIAOYU = path.join(HOME, 'xiaoyu')
const SCHEMA = path.join(DATA, 'schema.json')

export const CURRENT_SCHEMA = 1

function readSchema() {
  try { return JSON.parse(fs.readFileSync(SCHEMA, 'utf8')) } catch { return { version: 0 } }
}
function writeSchema(obj) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = SCHEMA + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
  fs.renameSync(tmp, SCHEMA)
}
/** 备份已有数据，返回 { dir, errors }；任何一步失败都记进 errors，绝不静默当成备份成功。 */
function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(DATA, 'backups', `migrate-${stamp}`)
  const errors = []
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e) {
    errors.push(`备份目录创建失败：${e?.message || e}`)
    return { dir, errors }
  }
  for (const [name, file] of [['dispatch', path.join(DATA, 'dispatch.json')], ['incidents', path.join(DATA, 'incidents.json')], ['growth', path.join(DATA, 'growth.json')], ['switches', path.join(DATA, 'switches.json')], ['charter', path.join(DATA, 'charter.json')], ['persona', path.join(DATA, 'soul', 'persona.json')]]) {
    try {
      if (!fs.existsSync(file)) continue
      fs.copyFileSync(file, path.join(dir, name + '.json'))
    } catch (e) {
      errors.push(`备份 ${name} 失败：${e?.message || e}`)
    }
  }
  return { dir, errors }
}

/** 迁移步骤：从第 N 版到 N+1。以后加版本就在这里加。 */
const STEPS = {
  // 0 → 1：老数据没有 schema；只做“标记 + 校验”，不改内容。
  1: (ctx) => {
    const notes = []
    const ensure = (file, fallback) => {
      if (!fs.existsSync(file)) return
      try {
        let text = fs.readFileSync(file, 'utf8')
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
        JSON.parse(text)
      } catch {
        fs.copyFileSync(file, file + '.corrupt-' + Date.now())
        fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8')
        notes.push(`坏档已隔离：${path.basename(file)}`)
      }
    }
    ensure(path.join(DATA, 'dispatch.json'), [])
    ensure(path.join(DATA, 'incidents.json'), [])
    ensure(path.join(DATA, 'growth.json'), { xp: 0, log: [] })
    ensure(path.join(DATA, 'switches.json'), { master: true, dayu: true, xiaoyu: true })
    ensure(path.join(DATA, 'charter.json'), {})
    ensure(path.join(DATA, 'soul', 'persona.json'), {})
    return notes
  },
}

/**
 * 升级前跑一次：版本旧就备份 + 逐版迁移；已是最新就什么都不做。
 * 成功返回 { ok: true, version, migrated, from, backup, notes }（与旧接口一致）。
 * 失败返回 { ok: false, migrated: false, version: from, from, backup, failedStep, notes, error }，
 * 且不写 schema.json：版本号只前进到“全部步骤都成功之后”，失败不提交。
 */
export function ensureSchema() {
  const before = readSchema()
  const from = Number(before.version) || 0
  if (from >= CURRENT_SCHEMA) return { ok: true, version: from, migrated: false, notes: [] }
  const { dir: backupDir, errors: backupErrors } = backup()
  if (backupErrors.length) {
    return {
      ok: false,
      migrated: false,
      version: from,
      from,
      backup: backupDir,
      failedStep: 0,
      notes: backupErrors.slice(),
      error: `备份失败，未迁移：${backupErrors[0]}`,
    }
  }
  const notes = []
  const fail = (step, message) => {
    notes.push(message)
    return { ok: false, migrated: false, version: from, from, backup: backupDir, failedStep: step, notes, error: message }
  }
  for (let v = from + 1; v <= CURRENT_SCHEMA; v += 1) {
    const step = STEPS[v]
    if (typeof step !== 'function') return fail(v, `缺少迁移步骤 ${v}`)
    try {
      const stepNotes = step({ from, to: v })
      if (Array.isArray(stepNotes)) notes.push(...stepNotes)
    } catch (e) {
      return fail(v, `迁移 ${v} 失败：${e?.message || e}`)
    }
  }
  try {
    writeSchema({ version: CURRENT_SCHEMA, at: new Date().toISOString(), from, backup: backupDir })
  } catch (e) {
    return fail(CURRENT_SCHEMA, `schema 写入失败：${e?.message || e}`)
  }
  return { ok: true, version: CURRENT_SCHEMA, migrated: true, from, backup: backupDir, notes }
}

/** 卸载前看看有什么；默认只看不删。
 *
 * 2026-10-28 修正：**角色卡不删**。卡是用户的财产，不是鱼神的数据——
 * 卸载只该拿走"鱼神给的那一层"（运行时、账本、补丁、会话），不该拿走人家写的卡。
 * keepInside 里的路径，卸载时会原样保留，并在计划里单独列出来。
 */
export const UNINSTALL_KEEP = Object.freeze(['soul/cards'])

export function uninstallPlan() {
  const items = [
    ['她自己的数据（魂/账本/补丁）', path.join(DATA)],
    ['小鱼的档案与会话', path.join(XIAOYU)],
    ['插件代码', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')],
  ]
  return items.map(([name, p]) => {
    let size = 0
    const walk = (dir) => {
      let entries = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else { try { size += fs.statSync(full).size } catch { /* 忽略 */ } }
      }
    }
    if (fs.existsSync(p)) walk(p)
    const keep = p === DATA ? UNINSTALL_KEEP.map((k) => path.join(DATA, k)).filter((x) => fs.existsSync(x)) : []
    return { name, path: p, exists: fs.existsSync(p), mb: Number((size / 1024 / 1024).toFixed(2)), keep }
  })
}
