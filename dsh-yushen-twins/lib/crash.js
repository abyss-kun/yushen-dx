// 崩溃留痕：插件崩了、路由抛了、启动没挂上，都要留一条，别让下一次靠猜。
// 数据：~/.dsh/dayu/crash.jsonl（只追加，不覆盖）。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'crash.jsonl')

export function recordCrash({ scope = 'unknown', error, stack, note } = {}) {
  try {
    fs.mkdirSync(DATA, { recursive: true })
    const row = {
      at: new Date().toISOString(),
      pid: process.pid,
      scope: String(scope).slice(0, 60),
      error: String(error?.message || error || 'unknown').slice(0, 500),
      stack: String(stack || error?.stack || '').split('\n').slice(0, 12).join('\n'),
      note: String(note || '').slice(0, 200),
    }
    fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8')
    return row
  } catch { return null }
}

export function listCrashes(limit = 20) {
  try {
    const lines = fs.readFileSync(FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    return lines.slice(-limit).reverse().map((line) => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)
  } catch { return [] }
}

/** 同一处最近 10 分钟崩了几次：连着崩就升级成事故单。 */
export function recentCount(scope, windowMs = 10 * 60 * 1000) {
  const since = Date.now() - windowMs
  return listCrashes(200).filter((row) => row.scope === scope && Date.parse(row.at) > since).length
}

/** 包一层路由：抛错不把进程带走，先留痕，再回 500。 */
export function guard(scope, handler) {
  return async (req, res) => {
    try {
      return await handler(req, res)
    } catch (error) {
      const row = recordCrash({ scope, error })
      try {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: `内部错误（已记账 ${row?.at || ''}）` }))
        }
      } catch { /* 回包都发不出去就算了 */ }
      return undefined
    }
  }
}
