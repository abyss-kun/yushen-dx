// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜memory-core/generic/now-page.js:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: generic-now-page
 * kind: module
 * summary: 通用“一页现在”：最近事件 + 最近决定 + 我记得的自己；只读，不依赖鱼神的议程/心情/角色。
 * tags: 现在, 通用, 独立包, 注入
 * created: 2026-11-24 21:5x
 * author: 大鱼·本班
 * authority: 老板（2026-11-24：独立记忆包也要有“现在”）
 * audience: dsh-memory 独立包、以后别的壳
 * owner: 框架；只读，不写任何账
 * usage: buildGenericNow({dir, memoryFile, maxChars}) → 一段 ≤320 字
 * why: 鱼神的一页“现在”绑了议程/心情/capmap，独立包没有这些；先做一个“通用版”
 * result: 有决定就说决定，有自我记忆就说我记得；没有就说“还没有”，不编
 * mutable: 可改；数据源可缺省
 */
import fs from 'node:fs'
import path from 'node:path'
import { readDefinitions } from './definitions.js'
import { readSelf } from './self-memory.js'

function eventsOf(memoryFile) {
  try {
    const doc = JSON.parse(fs.readFileSync(memoryFile, 'utf8').replace(/^\uFEFF/, ''))
    const rows = Array.isArray(doc?.events) ? doc.events : []
    const ats = rows.map((e) => String(e?.at || '')).filter(Boolean).sort()
    return { count: rows.length, last: ats.length ? ats[ats.length - 1].slice(0, 10) : '' }
  } catch { return { count: 0, last: '' } }
}

export function buildGenericNow({ dir = '', memoryFile = '', maxChars = 320 } = {}) {
  const lines = ['## 现在（通用记忆）']
  const ev = eventsOf(memoryFile)
  lines.push(ev.count ? `- 最近事件：${ev.count} 条（最后 ${ev.last}）` : '- 最近事件：还没有')
  const defs = readDefinitions({ limit: 3, dir })
  lines.push(defs.length ? `- 最近决定：${defs.map((r) => String(r.text || '').slice(0, 40)).join('；')}` : '- 最近决定：还没有')
  const self = readSelf({ limit: 2, dir })
  lines.push(self.length ? `- 我记得：${self.map((r) => String(r.text || '').slice(0, 40)).join('；')}` : '- 我记得：还没有')
  let out = lines.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, Math.max(0, maxChars - 1))}…`
  return out
}
