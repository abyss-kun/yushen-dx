// 记忆审计：谁动了她的记忆，必须留一条。
//
// 起因（2026-10-27）：小鱼的记忆从 87KB 掉到 29KB，账上没有任何一条“重写记忆”的记录——
// 查不出是谁干的。记忆是她身上最不该悄悄变的东西，所以：
//   1) 所有经过插件的写入，都往 memory-audit.jsonl 记一行（谁、哪个文件、写前多大、写后多大、为什么）；
//   2) 巡检时对账：文件大小和最后一条审计对不上，就当成“外部改动”，记一条并告警。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const AUDIT = path.join(DATA, 'memory-audit.jsonl')
const MAX_LINES = 5000

function sizeOf(file) {
  try { return fs.statSync(file).size } catch { return -1 }
}

/** 记一条写入。who：调用方标识（appendEvent / rewrite / self-edit）；why：人话原因。 */
export function noteWrite({ role = '', file = '', op = 'write', before = -1, after = -1, who = 'unknown', why = '' } = {}) {
  const row = {
    at: new Date().toISOString(),
    role: String(role || ''),
    file: String(file || '').replace(DATA, '~/.dsh/dayu'),
    op: String(op || 'write'),
    who: String(who || 'unknown'),
    before: Number(before),
    after: Number(after),
    why: String(why || '').slice(0, 300),
  }
  try {
    fs.mkdirSync(path.dirname(AUDIT), { recursive: true })
    fs.appendFileSync(AUDIT, `${JSON.stringify(row)}\n`, 'utf8')
    // 只留最近若干条：审计是账，不是日志，别无限长。
    const lines = fs.readFileSync(AUDIT, 'utf8').trim().split(/\r?\n/)
    if (lines.length > MAX_LINES) fs.writeFileSync(AUDIT, `${lines.slice(-MAX_LINES).join('\n')}\n`, 'utf8')
    return row
  } catch { return null }
}

/** 最近几条审计（给人看）。 */
export function recentWrites({ role = '', limit = 20 } = {}) {
  try {
    const rows = fs.readFileSync(AUDIT, 'utf8').trim().split(/\r?\n/).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const hit = role ? rows.filter((r) => r.role === role) : rows
    return hit.slice(-Math.max(1, Math.min(500, Number(limit) || 20)))
  } catch { return [] }
}

/**
 * 对账：文件现在的字节数，和最后一条审计里的「写后大小」对不上，就是有人绕过插件改了。
 * @returns {{drift:boolean, now:number, last:number, lastAt:string, who:string}}
 */
export function checkDrift(role, file) {
  const now = sizeOf(file)
  const rows = recentWrites({ role, limit: 200 }).filter((r) => String(r.file || '').endsWith(String(file).split(/[\\/]/).pop()))
  const last = rows.length ? rows[rows.length - 1] : null
  const expected = last ? Number(last.after) : -2 // -2 = 从来没记过
  return {
    drift: now >= 0 && expected >= -1 && Number(now) !== Number(expected),
    now,
    last: expected,
    lastAt: last?.at || '',
    who: last?.who || '',
  }
}
