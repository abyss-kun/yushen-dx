/* 标签
 * id: lib-memory-control
 * kind: module
 * summary: 记忆后台开关：本源是否落盘、抄录从本源还是直接从投影开始；全局默认 + 按角色覆盖。
 * tags: 记忆, 后台, 开关, 本源, 抄录, 多角色
 * created: 2026-11-12 21:45:00
 * changed: 2026-11-12 22:06:20
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：记忆插件要有自己的后台管理页；本源开关/抄录起点/目录/点开）
 * audience: 后台页、turn-capture、维护者
 * owner: 框架；配置归装它的人，代码只读/校验
 * mutable: 可加字段；不许把默认值写成“悄悄关本源”
 * usage: readControl() / writeControl(patch) / effectiveFor(role) / memoryPaths()
 * why: 以前开关散在代码/环境变量里，别人装不会配；后台页要看得见、点得开
 * result: 一份 memory-control.json；turn-capture 每轮读它决定要不要落本源
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = dataRoot(HOME)
export const CONTROL_FILE = path.join(DATA, 'memory-control.json')
export const DEFAULTS = Object.freeze({
  sourceEnabled: true,
  captureFrom: 'source', // source | projection
  archiveDays: 30,
  roles: {},
})
const CAPTURE_FROM = new Set(['source', 'projection'])

export function memoryPaths() {
  const D = DATA
  return {
    source: path.join(D, 'live', 'raw'),
    projection: path.join(D, 'live'),
    turns: path.join(D, '思考', 'turns'),
    archive: path.join(D, 'archive'),
    library: path.join(D, 'library'),
    wal: path.join(D, 'live', '.wal'),
    control: CONTROL_FILE,
  }
}

function clean(raw) {
  const out = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  out.sourceEnabled = out.sourceEnabled !== false
  out.captureFrom = CAPTURE_FROM.has(String(out.captureFrom)) ? String(out.captureFrom) : 'source'
  const d = Number(out.archiveDays)
  out.archiveDays = Number.isFinite(d) ? Math.max(0, Math.min(3650, Math.floor(d))) : DEFAULTS.archiveDays
  out.roles = out.roles && typeof out.roles === 'object' ? out.roles : {}
  return out
}

export function readControl() {
  try {
    let s = fs.readFileSync(CONTROL_FILE, 'utf8')
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
    return clean(JSON.parse(s))
  } catch { return clean({}) }
}

export function writeControl(patch = {}) {
  const cur = readControl()
  const next = clean({
    ...cur,
    ...patch,
    roles: patch.roles && typeof patch.roles === 'object' ? patch.roles : cur.roles,
  })
  fs.mkdirSync(path.dirname(CONTROL_FILE), { recursive: true })
  const tmp = `${CONTROL_FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, CONTROL_FILE)
  return next
}

/** 全局默认 + 该角色覆盖；没有绑定角色时用全局。 */
export function effectiveFor(role = '') {
  const base = readControl()
  const r = String(role || '')
  const over = r && base.roles?.[r] && typeof base.roles[r] === 'object' ? base.roles[r] : {}
  const merged = clean({ ...base, ...over, roles: base.roles })
  return {
    sourceEnabled: merged.sourceEnabled !== false,
    captureFrom: merged.captureFrom,
    archiveDays: merged.archiveDays,
    roleEnabled: over.enabled !== false,
  }
}

/** 这一轮要不要落本源；投影永远写。 */
export function shouldSaveSource(role = '') {
  const e = effectiveFor(role)
  return e.sourceEnabled && e.captureFrom !== 'projection'
}

/** 后台页的“现在多大、最后一条什么时候”：只读，不扫正文。 */
export function statusOf() {
  const p = memoryPaths()
  const walk = (dir, ext, out = []) => {
    let es = []
    try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
    for (const e of es) {
      const q = path.join(dir, e.name)
      if (e.isDirectory()) walk(q, ext, out)
      else if (q.endsWith(ext)) out.push(q)
    }
    return out
  }
  const size = (files) => files.reduce((n, f) => { try { return n + fs.statSync(f).size } catch { return n } }, 0)
  const rawFiles = walk(p.source, '.jsonl')
  const archiveFiles = walk(p.archive, '.zst')
  const turnFiles = walk(p.turns, '.jsonl')
  const pendingFiles = walk(path.join(p.library, '待提炼'), '.jsonl')
  const inuseFiles = walk(path.join(p.library, '在用'), '.jsonl')
  const latest = [...rawFiles, ...archiveFiles].map((f) => { try { return fs.statSync(f).mtimeMs } catch { return 0 } }).sort((a, b) => b - a)[0] || 0
  return {
    source: { turns: rawFiles.length, bytes: size(rawFiles) },
    archive: { files: archiveFiles.length, bytes: size(archiveFiles) },
    projection: { turnDays: turnFiles.length, bytes: size(turnFiles) },
    pending: { files: pendingFiles.length, bytes: size(pendingFiles) },
    inuse: { files: inuseFiles.length, bytes: size(inuseFiles) },
    lastAt: latest ? new Date(latest).toISOString() : '',
  }
}

