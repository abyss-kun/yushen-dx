// 想念：只记事实，不设阈值——找不找老板，是她的事。
//
// 事实有两样：多久没跟他说话；她攒了几件"想跟他说"的事。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir } from './runtime.js'
import { readInbox } from './inbox.js'

function newsFile(role) { return path.join(runtimeDir(role), 'news.json') }
function readNews(role) { try { return JSON.parse(fs.readFileSync(newsFile(role), 'utf8')) } catch { return { items: [] } } }
function writeNews(role, doc) {
  fs.mkdirSync(path.dirname(newsFile(role)), { recursive: true })
  fs.writeFileSync(newsFile(role), `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return doc
}

/** 攒一件想跟他说的事（看到的东西、想问的、想炫耀的）。 */
export function addNews(role, { what = '', now = Date.now() } = {}) {
  const text = String(what || '').trim()
  if (!text) throw new Error('想跟他说什么？写一句')
  const doc = readNews(role)
  doc.items = [...(doc.items || []), { at: new Date(now).toISOString(), what: text.slice(0, 200) }].slice(-50)
  return writeNews(role, doc)
}

export function listNews(role) { return readNews(role).items || [] }
export function clearNews(role) { return writeNews(role, { items: [] }) }

/** 上次跟老板说话是多久前（从收件箱里他自己的消息算，不猜）。 */
export function hoursSinceOwner(role, { now = Date.now(), days = 3 } = {}) {
  let last = 0
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now - i * 86400000)
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    try {
      for (const row of readInbox({ day, limit: 5000 }).rows) {
        if (row.isOwner && Number.isFinite(Date.parse(row.at))) last = Math.max(last, Date.parse(row.at))
      }
    } catch { /* 那天没记录 */ }
  }
  if (!last) return { hours: null, at: '' }
  return { hours: Math.round((now - last) / 3600000), at: new Date(last).toISOString() }
}

/** 注入用：只给事实，不催。 */
export function missLine(role, { now = Date.now() } = {}) {
  const since = hoursSinceOwner(role, { now })
  const news = listNews(role)
  const bits = []
  if (since.hours !== null) bits.push(`你上次跟老板说话是 ${since.hours} 小时前`)
  else bits.push('你还没跟老板说过话')
  if (news.length) {
    const latest = news[news.length - 1]
    bits.push(`你攒了 ${news.length} 件想跟他说的（最新：${String(latest.what || '').slice(0, 40)}）`)
  }
  // 抽屉早就造好了，缺的只是"知道有这么一个抽屉"。给的是口子，不是任务。
  const drawer = '想留给他看的，随手记一条（yushen_self action=add-news），他来了你能看见。'
  return `## 你和老板\n${bits.join('；')}。\n${drawer}\n想找他就找（工作台或私聊都行），不想找也不用找——没有"该多久找他一次"的规矩。`
}
