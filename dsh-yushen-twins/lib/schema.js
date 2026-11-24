/* 标签
 * id: lib-schema
 * kind: module
 * summary: 数据版本与迁移：升级前先备份，迁移可重入；版本对不上不硬跑
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: uninstallPlan（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
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


/** 卸载前看看有什么；默认只看不删。
 *
 * 2026-10-28：**角色卡不删**。卡是用户的财产，不是鱼神的数据。
 * 2026-11-03 老板再定：**角色留下的经历也不动**——卸载只是"抽离鱼神本身"
 * （收回点化 + 摘掉插件代码），卡、记忆、日记、信、书、板、承诺、会话原文、
 * 账、额度，一律原样留着；下次装回来接着用。
 * 真要连经历一起清掉，只能显式 `--wipe`（会先整包导出到 Documents）。
 */
export const UNINSTALL_KEEP = Object.freeze([
  'soul/cards',      // 角色卡（用户写的；单独列出来给断言和提示用）
  'soul',            // 卡 + 记忆 + 人物 + 外观
  'journal', 'diary', 'letters', 'board', 'story', 'ideas', 'library',
  'mistakes', 'promises', 'records', 'conversations', 'live', 'events',
  'experience', 'facts', 'relations', 'culture', 'nest', 'avatars', 'inbox',
  'catalog', 'archive', 'runtime', 'state', 'sync', 'local', 'patches',
  '记忆快照', '老板原话', '云备份',
])

export function uninstallPlan() {
  // kind：data = 角色留下的东西（默认永不删，只有 --wipe 才动）；code = 插件代码（--all 才删）
  const items = [
    ['她留下的东西（卡/记忆/日记/书/账/会话原文）', path.join(DATA), 'data'],
    ['小鱼的档案与会话', path.join(XIAOYU), 'data'],
    ['插件代码', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'code'],
  ]
  return items.map(([name, p, kind]) => {
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
    return { name, path: p, kind, exists: fs.existsSync(p), mb: Number((size / 1024 / 1024).toFixed(2)), keep }
  })
}
