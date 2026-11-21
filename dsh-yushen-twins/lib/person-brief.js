/* 标签
 * id: lib-person-brief
 * kind: module
 * summary: 把“这个人我记得什么”压成一句，按同一个人 20 分钟窗口只带一次；读新人物卡，不碰桥。
 * tags: 人物卡, 注入, 会话, 一次, 摘要
 * created: 2026-11-14 22:45:00
 * changed: 2026-11-14 22:44:12
 * author: 大鱼·本班
 * authority: 老板（2026-11-14：人物卡按会话带一次）
 * audience: brief.js、以后页面
 * owner: 框架；只读人物卡，只写 runtime/<role>/person-card-seen.json
 * mutable: 可改；窗口宽度跟 wake-brief 的 20 分钟一致
 * usage: personCardLine(role,{who,now,consume}) → string
 * why: 人物卡已经落了，但还没进会话；重复塞会占上下文
 * result: 同一个人 20 分钟内只出现一次；没卡就不出现
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'
import { runtimeDir } from './runtime.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const WINDOW_MIN = 20

const walk = (dir, out = []) => {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (p.endsWith('.jsonl')) out.push(p)
  }
  return out
}

function cardOf(who) {
  const id = String(who || '').trim()
  if (!id) return null
  for (const f of walk(path.join(dataRoot(HOME), 'library', '在用', '人物'))) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const r = JSON.parse(line)
        if (String(r.personId || '') === id || String(r.name || '') === id) return r
      } catch { /* 坏行跳过 */ }
    }
  }
  return null
}

function markerFile(role) { return path.join(runtimeDir(role), 'person-card-seen.json') }
function readMarker(role) { try { return JSON.parse(fs.readFileSync(markerFile(role), 'utf8')) } catch { return {} } }
function writeMarker(role, value) {
  try {
    fs.mkdirSync(path.dirname(markerFile(role)), { recursive: true })
    fs.writeFileSync(markerFile(role), `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 })
  } catch { /* 记不上最多重复一次 */ }
}

export function personCardLine(role = '', { who = '', now = Date.now(), consume = true } = {}) {
  const id = String(role || '').trim()
  const target = String(who || '').trim()
  if (!id || !target) return ''
  const card = cardOf(target)
  if (!card) return ''
  const mark = readMarker(id)
  const last = Date.parse(mark.at || '')
  if (String(mark.who || '') === target && Number.isFinite(last) && now - last < WINDOW_MIN * 60000) return ''
  const style = Array.isArray(card.style) && card.style.length ? `；说话方式：${card.style.join('、')}` : ''
  const attitude = String(card.attitude?.toHer || '').trim() ? `；她对这个人：${card.attitude.toHer}` : ''
  const line = `## 你记得的这个人\n- ${String(card.head || card.name || target)}：${String(card.detail || '').slice(0, 120)}${style}${attitude}（${card.confidence || '推测'}）`
  if (consume) writeMarker(id, { who: target, at: new Date(now).toISOString() })
  return line
}
