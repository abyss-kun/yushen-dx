// 旧单归档：只归档“已经结掉的”，开着的不动；原文件保留近期，旧条目转 JSONL。
// 目标：事故/派活不再越堆越多，界面只看近期。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const ARCHIVE = path.join(DATA, 'archive')
const DAY = 24 * 3600 * 1000
const KEEP_DAYS = 7

function readArray(file) {
  try {
    let text = fs.readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const v = JSON.parse(text)
    return Array.isArray(v) ? v : []
  } catch { return [] }
}
function writeArray(file, arr) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}
function appendJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
}
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) }

/** 归档已结的旧单；返回数量。 */
export function archiveOld(now = Date.now()) {
  fs.mkdirSync(ARCHIVE, { recursive: true })
  const cutoff = now - KEEP_DAYS * DAY
  const at = stamp()
  const result = { incidents: 0, jobs: 0, keptIncidents: 0, keptJobs: 0 }

  const incFile = path.join(DATA, 'incidents.json')
  const inc = readArray(incFile)
  if (inc.length) {
    const isDone = (r) => ['fixed', 'closed'].includes(String(r.status))
    const isOld = (r) => {
      const t = Date.parse(r.fixedAt || r.lastAt || r.at || '') || 0
      return t > 0 && t < cutoff
    }
    const old = inc.filter((r) => isDone(r) && isOld(r))
    if (old.length) {
      appendJsonl(path.join(ARCHIVE, `incidents-${at}.jsonl`), old)
      const keep = inc.filter((r) => !(isDone(r) && isOld(r)))
      writeArray(incFile, keep)
      result.incidents = old.length
      result.keptIncidents = keep.length
    } else result.keptIncidents = inc.length
  }

  const jobFile = path.join(DATA, 'dispatch.json')
  const jobs = readArray(jobFile)
  if (jobs.length) {
    const isDone = (r) => ['done', 'rejected', 'closed'].includes(String(r.status))
    const isOld = (r) => {
      const t = Date.parse(r.updatedAt || r.at || '') || 0
      return t > 0 && t < cutoff
    }
    const old = jobs.filter((r) => isDone(r) && isOld(r))
    if (old.length) {
      appendJsonl(path.join(ARCHIVE, `jobs-${at}.jsonl`), old)
      const keep = jobs.filter((r) => !(isDone(r) && isOld(r)))
      writeArray(jobFile, keep)
      result.jobs = old.length
      result.keptJobs = keep.length
    } else result.keptJobs = jobs.length
  }

  return { ok: true, at: new Date(now).toISOString(), keepDays: KEEP_DAYS, ...result }
}
