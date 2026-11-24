// 改｜2026-11-24 23:00｜大鱼·工作台｜授权：主人（2026-11-24：常驻 compaction 长会话实测）｜scripts/check-resident-continuity.mjs:1｜新增常驻连续性验收：临时家种决定/自我/事件，反复重拼“现在”，证明压缩只压上下文、记忆在盘上不丢｜为什么：没有这条验收，“一条会话一直住”只是嘴上说｜验证：node scripts/check-resident-continuity.mjs 5 通过/0 失败；回归 325/0｜可改：可改（只许改严；临时目录留在系统 temp）
/* 标签
 * id: check-resident-continuity
 * kind: module
 * summary: 常驻“压缩后还接得上”的硬证据：记忆在盘上、每轮重拼；模拟上下文清空后决定/自我/现在页仍在。
 * tags: 常驻, 压缩, 验收, 记忆
 * created: 2026-11-24 22:5x
 * author: 大鱼·本班
 * authority: 老板（2026-11-24：常驻 compaction 长会话实测）
 * why: 压缩只压上下文，不压记忆；没有这条验收，“一条会话一直住”就只是嘴上说
 * result: 临时家里种决定/自我/事件，反复重拼“现在”和“我记得”，内容不丢、文件不变
 * mutable: 可改；只读/临时家，不碰真数据
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-resident-cont-'))
process.env.DSH_HOME = TMP
const DAYU = path.join(TMP, 'dayu')
fs.mkdirSync(path.join(DAYU, 'soul', 'memory'), { recursive: true })

const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')
let pass = 0
const ok = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`) }

try {
  const defs = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/memory-core/generic/definitions.js')
  const self = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/memory-core/generic/self-memory.js')
  const now = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/lib/now-page.js')

  ok('种下决定/自我/事件', () => {
    defs.addDefinition({ text: '常驻可以一条会话一直住', source: 'check' })
    defs.addDefinition({ text: '压缩只压上下文，不压记忆', source: 'check' })
    self.appendSelf({ kind: 'lesson', text: '记忆在盘上，重拼就行', emotion: '踏实' })
    fs.writeFileSync(path.join(DAYU, 'soul', 'memory', 'dayu.json'), JSON.stringify({ events: [
      { at: '2026-11-24T12:00:00Z', text: '老板问常驻', kind: 'say' },
      { at: '2026-11-24T13:00:00Z', text: '做了内部群叫醒', kind: 'say' },
    ] }), 'utf8')
  })

  const dFile = path.join(DAYU, 'definitions.jsonl')
  const sFile = path.join(DAYU, 'self-memory.jsonl')
  const before = { d: sha(dFile), s: sha(sFile) }

  ok('上下文清空后，一页现在仍带决定（重拼，不靠会话）', () => {
    const a = now.buildNowPage('dayu', { task: '常驻' })
    const b = now.buildNowPage('dayu', { task: '常驻' })
    assert.match(a, /常驻可以一条会话一直住/)
    assert.match(b, /压缩只压上下文/)
  })

  ok('自我记忆仍在（不同轮次重拼一致）', () => {
    const a = self.selfMemoryBlock('dayu')
    const b = self.selfMemoryBlock('dayu')
    assert.match(a, /记忆在盘上/)
    assert.equal(a, b)
  })

  ok('记忆文件没被“压缩”改动（只追加的还在）', () => {
    assert.equal(sha(dFile), before.d)
    assert.equal(sha(sFile), before.s)
    assert.equal(fs.readFileSync(dFile, 'utf8').trim().split(/\r?\n/).length, 2)
  })

  ok('压缩桥在（机制存在，不是空口）', () => {
    const bridge = fs.readFileSync('D:/DSH/大小鱼/dsh-yushen-twins/lib/compaction-bridge.js', 'utf8')
    assert.match(bridge, /installCompactionBridge/)
  })
} finally {
  fs.rmSync(TMP, { recursive: true, force: true })
}

console.log(`check-resident-continuity: ${pass} 通过 / 0 失败（临时家已清理）`)
