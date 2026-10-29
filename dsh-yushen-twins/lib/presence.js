// 在场：谁在、在哪、在干嘛。
// 数据全用现成的，不新造状态：
//   - ~/.dsh/sessions  本机会话文件，看修改时间
//   - qq-bridge/state/persona-where.json  QQ 那边的人在哪
// 只读，不写，不调模型。输出控制在 10 行内。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { qqBridgeState } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SESS = path.join(HOME, 'sessions')
const WHERE = process.env.YUSHEN_PERSONA_WHERE || path.join(qqBridgeState(), 'persona-where.json')
const ALIVE_MS = 15 * 60 * 1000

function ago(ts) {
  const d = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (d < 60) return `${d} 秒前`
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`
  return `${Math.floor(d / 3600)} 小时前`
}

function unmunge(name) {
  const s = String(name || '').replace(/^-+|-+$/g, '')
  return s
    .replace(/~([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/-/g, '\\')
    .replace(/^([A-Za-z])\\?/, '$1:\\')
}

function localLines(limit = 6) {
  const out = []
  let dirs = []
  try { dirs = fs.readdirSync(SESS) } catch { return out }
  for (const ws of dirs) {
    const wsPath = path.join(SESS, ws)
    let sessions = []
    try { sessions = fs.readdirSync(wsPath) } catch { continue }
    for (const s of sessions) {
      const p = path.join(wsPath, s, 'session.v4.jsonl.zstd')
      let st = null
      try { st = fs.statSync(p) } catch { continue }
      if (Date.now() - st.mtimeMs > ALIVE_MS) continue
      out.push({ m: st.mtimeMs, line: `本机 · ${unmunge(ws)} · ${ago(st.mtimeMs)}` })
    }
  }
  out.sort((a, b) => b.m - a.m)
  return out.slice(0, limit).map((x) => x.line)
}

function qqLines() {
  const out = []
  let data = null
  try { data = JSON.parse(fs.readFileSync(WHERE, 'utf8').replace(/^\uFEFF/, '')) } catch { return out }
  const roles = data?.roles || {}
  for (const [role, info] of Object.entries(roles)) {
    const place = info?.place || '?'
    const act = info?.activity || ''
    let when = ''
    const seen = info?.lastSeenAt
    if (seen) {
      const t = Date.parse(seen)
      if (!Number.isNaN(t)) when = ago(t)
    }
    out.push(`QQ · ${role} 在 ${place} · ${act}${when ? ' · ' + when : ''}`)
  }
  return out
}

/** 在场的全部信息，压成一行一句。 */
export function presence({ limit = 10 } = {}) {
  const lines = [...qqLines(), ...localLines()]
  return {
    at: new Date().toISOString(),
    count: lines.length,
    lines: lines.slice(0, limit),
    hint: lines.length ? '看的是刚才有没有人动过，不是日志。' : '15 分钟内没人在。',
  }
}
