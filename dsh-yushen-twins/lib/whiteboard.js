// 白板：临时看到的东西。不写进对话历史，每轮现拼一段；过期就自己消失。
//
// 2026-10-29 从 Cortico / 鱼搭子两边学来的同一个做法：
//   鱼搭子——最近 90 秒、最多 40 句字幕，每轮拼到 system 段，不写历史，不越看越厚；
//   Cortico——World 给的是「环境提示」，不是消息事件，不占对话轮次。
//
// 它和记忆的分工：
//   记忆：发生过的事，留下来，会变旧但不会消失。
//   白板：此刻眼前的东西，会过期，过期就当没看见过。
import fs from 'node:fs'
import path from 'node:path'
import { dshHome } from './paths.js'

const MAX_ITEMS = 40

function fileOf(role) {
  return path.join(dshHome(), 'dayu', 'runtime', role, '白板.json')
}

export function readBoard(role, { now = Date.now() } = {}) {
  try {
    const raw = fs.readFileSync(fileOf(role), 'utf8').replace(/^\uFEFF/, '')
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((it) => it && it.text && Number(it.expire || 0) > now)
  } catch { return [] }
}

export function writeBoard(role, items) {
  const p = fileOf(role)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(items.slice(-MAX_ITEMS), null, 1), 'utf8')
  fs.renameSync(tmp, p)          // 先写 .tmp 再改名：写一半断电也不会把文件写坏
}

/** 往白板上贴一条；ttl 秒后自动过期。 */
export function post(role, text, { ttl = 90, source = '' } = {}) {
  const now = Date.now()
  const items = readBoard(role, { now })
  items.push({ at: new Date(now).toISOString(), text: String(text).slice(0, 200), source, expire: now + ttl * 1000 })
  writeBoard(role, items)
  return items.length
}

/** 简报用的那一段。没东西就返回空串（不占上下文）。 */
export function boardLine(role, { now = Date.now() } = {}) {
  const items = readBoard(role, { now })
  if (!items.length) return ''
  const tail = items.slice(-8).map((it) => `- ${it.text}`).join('\n')
  return `## 你眼下看到的（不是记忆，过一会儿就没了）\n${tail}`
}
