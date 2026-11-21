/* 标签
 * id: lib-changes-log
 * kind: module
 * tags: 变动登记, 移动, 公告, 别的角色要知道
 * created: 2026-11-04 14:25:00
 * changed: 2026-11-11 00:47:31
 * author: 照微·工作台
 * authority: 老板（2026-11-04：移动这些东西要让其他角色能知道被移动了；动了东西做记录，时间、谁……）
 * why: 文件被搬/删/改，只有动手的那个人知道；另外两个角色醒来看到"少了个东西"，会当成丢了
 * result: 每次变动写一条到 changes.jsonl，并在公告栏里留一行（所有人都会看的地方）
 * mutable: 可改
 * audience: 框架（变动登记）、她（公告里能看到）、维护
 * owner: 框架；两条都要写（changes.jsonl + 公告）
 * usage: recordChange({who,action,what,from,to,why,authority}) 记一条；recentChanges 看最近
 * summary: 变动登记：谁动了什么、从哪到哪、为什么、谁让的；两处都写（changes.jsonl + 公告）。
 */
// 记录一条"东西被动了"：
//   who        谁动的
//   action     move / delete / add / edit / replace
//   what       动的是什么（人话 + 路径）
//   from/to    从哪到哪（move 必填）
//   why        为什么
//   authority  谁让的
// 两个地方写：
//   ① ~/.dsh/dayu/changes.jsonl —— 机器可查（按时间/人/动作筛）
//   ② ~/.dsh/dayu/board/公告.md —— 人看得到（"所有人都会看的地方"）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const LOG = path.join(D, 'changes.jsonl')
const BOARD = path.join(D, 'board', '公告.md')

const pad = (n) => String(n).padStart(2, '0')
export function nowText(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const ACTION_LABEL = { move: '挪了', delete: '删了', add: '加了', edit: '改了', replace: '换掉了' }

/**
 * @returns {{ok:boolean, row?:object}} 写不上也不抛（别因为记不上挡住正事），但要如实返回 ok
 */
export function recordChange({ who = '未标注', action = 'edit', what = '', from = '', to = '', why = '', authority = '', at = '' } = {}) {
  const when = at || nowText()
  const row = {
    at: when,
    who: String(who).slice(0, 40),
    action: String(action).slice(0, 20),
    what: String(what).slice(0, 300),
    from: String(from).slice(0, 300),
    to: String(to).slice(0, 300),
    why: String(why).slice(0, 300),
    authority: String(authority).slice(0, 80),
  }
  let ok = true
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true })
    fs.appendFileSync(LOG, JSON.stringify(row) + '\n', 'utf8')
  } catch { ok = false }
  // 公告：只追加一段，不改别人的内容
  try {
    const label = ACTION_LABEL[row.action] || row.action
    const where = row.from || row.to ? `（${row.from || '?'} → ${row.to || '?'}）` : ''
    const line = `- ${when}｜${row.who} ${label}：${row.what}${where}${row.why ? `｜为什么：${row.why}` : ''}${row.authority ? `｜谁让的：${row.authority}` : ''}`
    fs.mkdirSync(path.dirname(BOARD), { recursive: true })
    const head = fs.existsSync(BOARD) ? fs.readFileSync(BOARD, 'utf8') : '# 公告栏\n'
    const marker = '## 东西被动了（自动记的，谁搬的谁删的都在这）'
    const body = head.includes(marker)
      ? `${head.replace(/\s*$/, '')}\n${line}\n`
      : `${head.replace(/\s*$/, '')}\n\n${marker}\n\n${line}\n`
    fs.writeFileSync(BOARD, body, 'utf8')
  } catch { ok = false }
  return { ok, row }
}

/** 最近的变动（新→旧）。 */
export function recentChanges({ limit = 20, who = '', action = '' } = {}) {
  try {
    const rows = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    return rows.filter((r) => (!who || r.who === who) && (!action || r.action === action)).slice(-limit).reverse()
  } catch { return [] }
}
