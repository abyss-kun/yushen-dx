// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 峰时/谷时：一份口径，三处用（脚本、自由时间提示、以后别的）。
// 官方原文：Peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday through Friday,
//          excluding Chinese public holidays. All other hours are off-peak.
// 北京时间即：工作日 09:00-12:00、14:00-18:00 峰时；其余全谷时（周末、节假日整天）。
const TZ = 'Asia/Shanghai'

export function parts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  const out = {}
  for (const p of f.formatToParts(d)) if (p.type !== 'literal') out[p.type] = p.value
  return { wd: out.weekday, h: Number(out.hour) % 24, m: Number(out.minute) }
}

export function isPeak(d = new Date()) {
  const { wd, h } = parts(d)
  if (wd === 'Sat' || wd === 'Sun') return false
  return (h >= 9 && h < 12) || (h >= 14 && h < 18)
}

export function label(d = new Date()) { return isPeak(d) ? '峰时' : '谷时' }

export function nextSwitch(from = new Date()) {
  const cur = isPeak(from)
  for (let i = 1; i <= 60 * 48; i += 1) {
    const t = new Date(from.getTime() + i * 60000)
    if (isPeak(t) !== cur) return t
  }
  return null
}

export function stamp(d = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}
