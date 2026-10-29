// 全知·工作线：把「最近还在动」的会话串成一条线。
//
// 串法只有两条，都可解释、不猜：
//   1. 同一个派活单（dispatch.json 里的 sessionId）→ 一条线；
//   2. 没有派活单 → 同一个工作区（cwd）→ 一条线。
// 线里每页带一句「最后说了什么」，点开看正文走 /api/dayu/transcript。
//
// 只读：不写 dispatch、不改会话；读正文时 audit=false，避免页面一刷就刷一屏审计。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { recentSessions, transcriptDigest } from './transcript.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const DISPATCH = path.join(DATA, 'dispatch.json')

function readJobs() {
  const map = new Map()
  try {
    const rows = JSON.parse(fs.readFileSync(DISPATCH, 'utf8'))
    for (const job of Array.isArray(rows) ? rows : []) {
      if (job?.sessionId) map.set(String(job.sessionId).replace(/^session-/, ''), job)
    }
  } catch { /* 没有派活单 */ }
  return map
}

/** DSH 把非 ASCII 写成 ~XXXX~，这里只是显示用，解不开就原样。 */
function workspaceLabel(name) {
  return String(name || '')
    .replace(/~([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/~/g, '')
    .replace(/^--/, '').replace(/--$/, '')
    .replace(/-/g, '/')
}

function iso(ms) {
  return Number(ms) ? new Date(Number(ms)).toISOString() : ''
}

let lastBuild = { at: 0, key: '', value: [] }

export function buildThreads({ hours = 24, maxSessions = 16, turns = 8 } = {}) {
  // 30 秒缓存：全知页/工具会连着问，没必要每次都重扫。
  const key = `${hours}|${maxSessions}|${turns}`
  if (lastBuild.key === key && Date.now() - lastBuild.at < 30000) return lastBuild.value
  const cutoff = Date.now() - Math.max(1, hours) * 3600 * 1000
  const jobs = readJobs()
  const sessions = recentSessions(50)
    .filter((row) => row.mtime >= cutoff)
    .slice(0, Math.max(1, Math.min(30, maxSessions)))

  const rows = sessions.map((row) => {
    const digest = transcriptDigest(row.id, { turns, audit: false })
    const list = digest.ok ? digest.turns : []
    const firstUser = list.find((item) => item.role === 'user')
    const last = [...list].reverse().find((item) => item.text)
    const lastAssistant = [...list].reverse().find((item) => item.role === 'assistant' && item.text)
    const job = jobs.get(row.id) || null
    return {
      id: row.id,
      workspace: row.workspace,
      mtime: row.mtime,
      title: (digest.ok && digest.title) || (firstUser?.text || '').replace(/\s+/g, ' ').slice(0, 40) || row.id.slice(0, 8),
      last: last?.text?.replace(/\s+/g, ' ').slice(0, 60) || '',
      // 这条会话最后一句「她说的」——工作线的结论就从这儿取，不做二次加工。
      conclusion: lastAssistant?.text?.replace(/\s+/g, ' ').slice(0, 200) || '',
      job,
    }
  })

  const groups = new Map()
  for (const row of rows) {
    const key = row.job ? `job:${row.job.id}` : `ws:${row.workspace}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const value = [...groups.entries()].map(([key, list]) => {
    list.sort((a, b) => b.mtime - a.mtime)
    const job = list[0].job
    return {
      id: key,
      kind: job ? 'job' : 'workspace',
      title: job ? String(job.brief || '派活单').slice(0, 60) : workspaceLabel(list[0].workspace),
      brief: job ? String(job.brief || '').slice(0, 120) : '',
      workspace: list[0].workspace,
      lastAt: iso(list[0].mtime),
      // 跨页接手先看这三句：每条会话最后一句「她说的」，最多三条，去重。
      conclusions: [...new Set(list.map((row) => row.conclusion).filter(Boolean))].slice(0, 3),
      sessions: list.map((row) => ({
        id: row.id,
        title: row.title,
        last: row.last,
        at: iso(row.mtime),
      })),
    }
  }).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
  lastBuild = { at: Date.now(), key, value }
  return value
}
