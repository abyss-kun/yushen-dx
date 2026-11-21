/* 标签
 * id: lib-disposal-log
 * kind: module
 * tags: 剔旧, 盘点, 账实, 图书馆
 * created: 2026-11-04 17:30:00
 * changed: 2026-11-11 00:47:31
 * author: 照微·工作台
 * authority: 老板（2026-11-04：图书馆还没做的两条——剔旧留痕、清点对照，做）
 * why: 东西被清掉了就从账上消失，等于"没存在过"；盘点时又发现"账上有、架上无"，分不清是丢了还是剔了
 * result: 剔旧写一条（谁剔的/什么时候/为什么/多少），书目里留"已剔"卡片；盘点能对账
 * mutable: 可改
 * summary: 剔旧留痕：清掉的东西不消失，留一张"已剔"卡片 + 一行记录（谁剔的/为什么/多少）。
 * audience: 框架（清理/盘点）、她（知道自己扔过什么）
 * owner: 框架；删可以，删了不留痕不行
 * usage: logDisposal({...}) 记一条；recentDisposals 看最近
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const FILE = path.join(D, 'catalog', '已剔.jsonl')

const pad = (n) => String(n).padStart(2, '0')
const now = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

/**
 * 记一次剔旧（删掉的东西也要留名）。
 * @param {{who?:string, what?:string, count?:number, why?:string, authority?:string, detail?:string[], kind?:string}} row
 */
export function logDisposal({ who = '自动维护（照微）', what = '', count = 0, why = '', authority = '主人（保持期策略）', detail = [], kind = '遗忘' } = {}) {
  const row = {
    at: now(),
    who: String(who).slice(0, 40),
    kind: String(kind).slice(0, 20),
    what: String(what).slice(0, 200),
    count: Number(count) || 0,
    why: String(why).slice(0, 200),
    authority: String(authority).slice(0, 80),
    detail: (detail || []).slice(0, 20).map((x) => String(x).slice(0, 80)),
    status: '已剔',
  }
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8')
    return { ok: true, row }
  } catch { return { ok: false } }
}

export function recentDisposals({ limit = 200 } = {}) {
  try {
    return fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).slice(-limit)
  } catch { return [] }
}

