/* 标签
 * id: recall-usage
 * kind: module
 * tags: 检索, 度量, 用没用上
 * created: 2026-11-04 14:25:00
 * changed: 2026-11-11 19:4x
 * author: 照微·工作台
 * authority: 老板（2026-11-04：都做——搜了有没有用要能量出来）
 * why: 检索日志只记了"搜了什么、命中几条"，没有"后来用没用上"就等于没验收
 * result: 拿日志里 ref 指向的原文，去她之后的记忆里找；够证据才标 used
 * mutable: 可改
 */
// 用法：
//   node scripts/recall-usage.mjs              # 核对最近 200 条（真写）
//   node scripts/recall-usage.mjs --dry        # 只报不写
//   node scripts/recall-usage.mjs --days 3
//
// 判据（故意保守）：ref 指向的原文那一行，和"检索之后"的记忆事件比二字组包含度；
// ≥0.55 且 ≥5 个共同片段才算「用上了」，0.45~0.55 只记「弱证据」（不算用上）。
// 找不到就算"没核对上"，不硬标"没用"——没证据不等于没用。
// 改｜2026-11-11 19:4x｜大鱼·本班｜授权：主人（「用没用上这个数是死的」）｜scripts/recall-usage.mjs:1-60｜改成薄壳，判据搬进 lib/recall-usage.js（可测）；不再拿 ref 的文件名当证据｜为什么：老版取 basename（如 2026-11-05）去记忆里找，文件名永远不在记忆里，67 次检索 0 次用上｜验证：node scripts/test-recall-usage.mjs 全过；真家 --dry 能得出非零命中或如实 0｜可改：可改；阈值只许收紧
import { verifyUsage } from '../lib/recall-usage.js'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const daysIdx = args.indexOf('--days')
const days = daysIdx >= 0 ? Math.max(1, Number(args[daysIdx + 1]) || 7) : 7

const r = verifyUsage({ days, dry })
console.log(`最近 ${days} 天：检索 ${r.stats.total} 次，已核对用上 ${r.stats.used} 次（${Math.round(r.stats.hitRate * 100)}%）`)
console.log(`本轮核对 ${r.checked} 条：用上 ${r.used}，弱证据 ${r.weak}${dry ? '（--dry：只报不写）' : r.marked ? `，已标 ${r.marked} 条` : ''}`)
if (!r.checked) console.log('没有待核对的检索记录。')
for (const o of r.rows.slice(0, 20)) console.log(`  · ${o.at} ${String(o.query || '').slice(0, 24)} → ${o.verdict}`)
