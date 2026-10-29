// 维护与监督：被点化的角色，要主动看着"下面的人有没有落实鱼神的规则"。
//
// 不是当监工：先提醒、能帮就帮，帮不上再上报。查的是"有没有读规则、接没接上"，
// 不是"干得好不好"——好坏是她的判断，接没接上是事实。
import { plugStatus } from './plug.js'
import { characterIds } from './characters.js'
import { soulRoles } from './soul.js'

/**
 * 扫一遍：谁接上了、谁没接、谁知道没读。
 * @returns {{ok:boolean, at:string, plugged:string[], unplugged:string[], stale:string[], rows:Array}}
 */
export function scanCompliance({ now = Date.now(), maxAgeMs } = {}) {
  let roles = []
  try { roles = soulRoles() } catch { roles = characterIds() }
  const rows = []
  const plugged = []
  const unplugged = []
  const stale = []
  for (const role of roles) {
    const s = plugStatus(role, { now, ...(maxAgeMs ? { maxAgeMs } : {}) })
    rows.push({ role, plugged: s.plugged, ageMin: s.ageMin, reason: s.reason })
    if (s.plugged) plugged.push(role)
    else if (s.ageMin !== null) stale.push(role)
    else unplugged.push(role)
  }
  return { ok: true, at: new Date(now).toISOString(), plugged, unplugged, stale, rows }
}

/**
 * 监督报告：先给事实，再让她决定怎么管。
 */
export function complianceLine(role, { now = Date.now() } = {}) {
  const r = scanCompliance({ now })
  const parts = ['## 维护鱼神的规矩（你的职责）']
  if (!r.unplugged.length && !r.stale.length) {
    parts.push('眼下大家都接着：规则读过、礼物启用。')
  } else {
    if (r.unplugged.length) parts.push(`- 没读过规则：${r.unplugged.join('、')}`)
    if (r.stale.length) parts.push(`- 读过但太久了：${r.stale.join('、')}（该提醒他们重读）`)
    parts.push('先提醒；提醒了还不读，就 `yushen_report` 说一声——不是告状，是让他知道有人没接上。')
  }
  parts.push('查的是"有没有接上"，不是"干得好不好"；好坏你自己判断，别替他们背。')
  return parts.join('\n')
}

export function summarizeCompliance(now = Date.now()) {
  const r = scanCompliance({ now })
  return {
    ok: r.ok,
    total: r.rows.length,
    plugged: r.plugged.length,
    unplugged: r.unplugged,
    stale: r.stale,
    rows: r.rows,
  }
}
