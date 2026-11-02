// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// CLI：把旧记忆标成「已被取代」（2026-11-02）。
// 语义：不删、不改正文，只给旧事件写 validUntil=now + supersededBy + supersedeReason；
//       recall-now 默认不再返回它们，加 --include-expired 才翻得出来（并标「已失效」）。
//
// 用法：
//   node scripts/supersede.mjs --role dayu --old m-xxxx,m-yyyy --by m-zzzz --reason "改成B"
//   node scripts/supersede.mjs --role dayu --old m-xxxx --by "主人说不算数了" --reason "诺言作废"
import { supersede } from '../lib/memory.js'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? String(process.argv[i + 1] || '').trim() : ''
}

const role = arg('role')
const old = arg('old')
const by = arg('by')
const reason = arg('reason')

if (!role || !old) {
  console.error('用法：node scripts/supersede.mjs --role dayu --old m-xxxx,m-yyyy --by <说明或新事件id> --reason "改成B"')
  process.exit(2)
}

const r = supersede(role, { oldIds: old.split(','), byId: by, reason })
if (!r.ok) {
  console.error(`没标成：${r.reason}${r.missing?.length ? `（找不到：${r.missing.join(', ')}）` : ''}`)
  process.exit(1)
}
console.log(`已失效 ${r.changed} 条（role=${role}，by=${by || '—'}${reason ? `，原因：${reason}` : ''}）${r.missing?.length ? `；找不到 ${r.missing.length} 个 id：${r.missing.join(', ')}` : ''}`)
