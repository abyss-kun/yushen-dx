/* 标签
 * id: lib-self-note
 * kind: module
 * summary: 自我笔记（第五层）：她自己写自己。人可以读，不能改
 * audience: 维护者 / 宿主
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: writeSelfNote / listSelfNotes / writeJudgment / judgeVerdict（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 18:32:17
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:12｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜lib/self-note.js:36｜把自我笔记的 at/verdictAt/到期日换成 clock 的本地时间｜为什么：手写偏移不是系统时间：换机器或换时区就全错，各处口径还不一致｜验证：node --check 通过；node scripts/regression.mjs 全绿；全仓扫描无手写偏移｜可改：可改（只许换成 lib/clock.js 的其他封装）
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
import { now as clockNow, localISO, today as localToday } from './clock.js'
import { recordOrSkip } from './skills.js'

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
  const at = localISO()
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
  const now = clockNow()
  const at = localISO(now)
  const checkAt = localToday(new Date(now.getTime() + Number(checkAfterDays || 7) * 86400e3))
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
// 改｜2026-11-11 18:4x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接待办①：判断判对错接进做法账本）｜lib/self-note.js:95-110｜判断回看时给做法账本挂一次证据：判对 ok、判错 fail；attachOnly 只挂已有做法，没有相近做法就留跳过证据｜为什么：判断账本记了「当时怎么想、后来对不对」，但没回答「她的判断方法有没有越来越准」；直接入库又会把一句想法变成一条做法，所以只挂不造｜验证：node scripts/test-skill-hooks.mjs 通过（先种做法再判对 → 该做法 +1）；node scripts/check-trace.mjs 退出 0｜可改：可改；unknown 不记分（说不清不是方法问题）
export function judgeVerdict(role, { id, verdict, note = '' } = {}) {
  const rows = read()
  const i = rows.findIndex((r) => r.id === id)
  if (i < 0) return { ok: false, reason: '没有这条：' + id }
  if (!['right', 'wrong', 'unknown'].includes(String(verdict))) return { ok: false, reason: 'verdict 只能是 right/wrong/unknown' }
  rows[i] = { ...rows[i], status: String(verdict), verdict: String(note || '').slice(0, 300), verdictAt: localISO() }
  fs.writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  // 2026-11-11：判断判对错是做法账本五个入口之一。判对/判错都能当某一类判断方法的证据；
  // 「说不清」不记分——它不是方法问题，记了只会让账本背假账。
  if (verdict === 'right' || verdict === 'wrong') {
    try {
      recordOrSkip(rows[i].role || role || 'dayu', {
        entry: 'judgment',
        ref: id,
        kind: verdict === 'right' ? 'ok' : 'fail',
        text: String(rows[i].text || ''),
        refType: 'judgment',
        attachOnly: true,
      })
    } catch { /* 做法账本不阻断回看 */ }
  }
  return { ok: true, id }
}

/** 到期待回看的判断（给 tick 用） */
export function dueJudgments({ role = 'dayu', today = '' } = {}) {
  const t = today || localToday()
  return read().filter((r) => r.role === role && r.kind === 'judgment' && r.status === 'open' && String(r.checkAt || '') <= t)
}