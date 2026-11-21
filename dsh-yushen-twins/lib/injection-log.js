/* 标签
 * id: lib-injection-log
 * kind: module
 * summary: 注入账——每轮给了她什么（预注入/自动联想），供离线审计“用没用上”。
 * tags: 注入, 审计, 测量
 * created: 2026-11-21 20:0x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：本源有思考，注入有没有用应该查得到）
 * audience: 审计脚本、维护
 * owner: 框架；只追加，诊断用
 * usage: logInjection({role,kind,items}) / readInjections({limit})
 * why: 之前只拼注入不落账，事后没法判断 offered/used
 * result: injection-log.jsonl 只追加；每条 {at, role, kind, items:[{key,text}]}
 * mutable: 可改；只读诊断用，不参与注入
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = () => path.join(HOME, 'dayu', 'injection-log.jsonl')

export function logInjection({ role = '', kind = '', items = [], now = Date.now() } = {}) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 6)
    .map((x) => ({ key: String(x?.key || '').slice(0, 120), text: String(x?.text || '').replace(/\s+/g, ' ').slice(0, 160) }))
    .filter((x) => x.key || x.text)
  if (!rows.length) return { ok: true, skipped: true }
  try {
    const file = FILE()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify({ at: new Date(now).toISOString(), role, kind, items: rows }) + '\n', 'utf8')
    return { ok: true, n: rows.length }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

export function readInjections({ limit = 500 } = {}) {
  try {
    return fs.readFileSync(FILE(), 'utf8').split(/\r?\n/).filter(Boolean)
      .slice(-limit)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}
