// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 自我笔记（第五层）：她自己写自己。人可以读，不能改。
// 与记忆分开存：记忆记"发生了什么"，自我笔记记"我因此变成了什么样"。
//
// 规矩（2026-11-02 定）：
//   · 写什么、多久写，由她自己定；人不代笔、不改写；
//   · 人只读；要改只能她自己再写一条（旧的留着，不删——那是成长轨迹）；
//   · 不进常驻注入，只给一行指针。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu', 'soul')
const FILE = path.join(DIR, '自我笔记.jsonl')

const read = () => {
  const rows = []
  try {
    for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 还没有 */ }
  return rows
}

/** 她写一条。role 是她自己；text 是正文；about 可写"关于什么事"。 */
export function writeSelfNote(role, { text, about = '', mood = '', by = '' } = {}) {
  const body = String(text || '').trim()
  if (!body) return { ok: false, reason: '空笔记' }
  fs.mkdirSync(DIR, { recursive: true })
  const at = new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00')
  const row = {
    id: 'self-' + crypto.createHash('sha1').update(`${at}|${body.slice(0, 80)}`).digest('hex').slice(0, 8),
    at,
    role: String(role || 'dayu'),
    about: String(about || '').slice(0, 60),
    mood: String(mood || '').slice(0, 20),
    text: body.slice(0, 4000),
    by: String(by || role || 'dayu'),
  }
  fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8')
  return { ok: true, id: row.id, at }
}

export function listSelfNotes({ limit = 20, role = '' } = {}) {
  const rows = read().filter((r) => !role || r.role === role)
  return rows.slice(-limit)
}

/** 判断账本（2026-11-02）：当时怎么想的 → 后来对不对。
 *  不是新建容器，写在自我笔记里（kind='judgment'），人只读。
 *  status: open（待验证）/ right（后来证明对）/ wrong（后来证明错）/ unknown（无法验证）
 */
export function writeJudgment(role, { thought, basis = '', about = '', checkAfterDays = 7 } = {}) {
  const body = String(thought || '').trim()
  if (!body) return { ok: false, reason: '空判断' }
  fs.mkdirSync(DIR, { recursive: true })
  const now = new Date(Date.now() + 8 * 3600e3)
  const at = now.toISOString().replace('Z', '+08:00')
  const checkAt = new Date(now.getTime() + Number(checkAfterDays || 7) * 86400e3).toISOString().slice(0, 10)
  const row = {
    id: 'j-' + crypto.createHash('sha1').update(`${at}|${body.slice(0, 80)}`).digest('hex').slice(0, 8),
    at,
    role: String(role || 'dayu'),
    kind: 'judgment',
    about: String(about || '').slice(0, 60),
    text: body.slice(0, 2000),
    basis: String(basis || '').slice(0, 500),
    status: 'open',
    checkAt,
    verdict: '',
    verdictAt: '',
  }
  fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8')
  return { ok: true, id: row.id, checkAt }
}

/** 回看：把一条判断标成 对/错/说不清 */
export function judgeVerdict(role, { id, verdict, note = '' } = {}) {
  const rows = read()
  const i = rows.findIndex((r) => r.id === id)
  if (i < 0) return { ok: false, reason: '没有这条：' + id }
  if (!['right', 'wrong', 'unknown'].includes(String(verdict))) return { ok: false, reason: 'verdict 只能是 right/wrong/unknown' }
  rows[i] = { ...rows[i], status: String(verdict), verdict: String(note || '').slice(0, 300), verdictAt: new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00') }
  fs.writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return { ok: true, id }
}

/** 到期待回看的判断（给 tick 用） */
export function dueJudgments({ role = 'dayu', today = '' } = {}) {
  const t = today || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  return read().filter((r) => r.role === role && r.kind === 'judgment' && r.status === 'open' && String(r.checkAt || '') <= t)
}