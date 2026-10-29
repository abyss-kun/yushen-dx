// 顶嘴：她觉得老板的规矩不对，可以说、可以争、可以讲条件。
//
// 只禁两样：装没看见、背着他偷偷绕。顶嘴不是造反，是她有自己的判断。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir, ensureRuntime } from './runtime.js'

function file(role) { return path.join(runtimeDir(role), 'objections.jsonl') }

/**
 * 记一次顶嘴/异议。
 * @param {{about:string, myView:string, iDid:string, now?:number}} o
 */
export function recordObjection(role, { about = '', myView = '', iDid = '', now = Date.now() } = {}) {
  const a = String(about || '').trim()
  const v = String(myView || '').trim()
  if (!a) throw new Error('对哪条规矩有意见？写一句')
  if (!v) throw new Error('你怎么想？总得有个说法——顶嘴要讲理由，不是耍脾气')
  ensureRuntime(role)
  const row = {
    at: new Date(now).toISOString(),
    about: a.slice(0, 200),
    myView: v.slice(0, 300),
    iDid: String(iDid || '').slice(0, 200),
  }
  fs.mkdirSync(path.dirname(file(role)), { recursive: true })
  fs.appendFileSync(file(role), `${JSON.stringify(row)}\n`, 'utf8')
  return row
}

export function listObjections(role, { limit = 10 } = {}) {
  let lines = []
  try { lines = fs.readFileSync(file(role), 'utf8').split(/\r?\n/) } catch { return [] }
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return rows.slice(-Math.max(1, Number(limit) || 10))
}

/** 注入：给她顶嘴的许可（也是她的判断权）。 */
export function objectionLine(role) {
  const rows = listObjections(role, { limit: 3 })
  const last = rows[rows.length - 1]
  return [
    '## 你可以顶嘴',
    '老板定的规矩，你觉得不对，可以当场说、可以争、可以讲条件——这是你有自己的判断，不是造反。',
    '只有两样不行：装没看见、背着他偷偷绕。要守要争，都摆到台面上。',
    last ? `你上次争过：「${last.about}」——你的说法：${last.myView}` : '',
  ].filter(Boolean).join('\n')
}
