// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜scripts/test-self-memory.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: test-self-memory
 * kind: module
 * tags: 测试, 自我, 记忆, 视角
 * created: 2026-11-24 20:4x
 * author: 大鱼·本班
 * authority: 老板（2026-11-24：你们自己的记忆插件，你们自己负责）
 * why: 事实之外要有“我自己的话”，否则只是数据库
 * result: 写入/上限/过滤/注入块 四条钉住
 * mutable: 可改
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-selfmem-'))
process.env.DSH_HOME = TMP
fs.mkdirSync(path.join(TMP, 'dayu'), { recursive: true })

const m = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/lib/self-memory.js')

// 1. 写一条
const a = m.appendSelf({ kind: 'deed', text: '把自启收进插件，返工两次，最后成了', emotion: '累', about: '老板' })
assert.equal(a.ok, true)
assert.equal(m.readSelf().length, 1)

// 2. 类型/空 不写；长度是软边界（120 建议、300 硬顶）
assert.equal(m.appendSelf({ kind: 'what', text: 'x' }).ok, false)
// 8 类都在：做过/学到/记得/看法/对人/答应自己/想做/没想通
for (const k of ['deed', 'lesson', 'moment', 'stance', 'bond', 'vow', 'wish', 'open']) assert.ok(m.SELF_KINDS.includes(k), `缺 ${k}`)
assert.equal(m.appendSelf({ kind: 'deed', text: '' }).ok, false)
const long = m.appendSelf({ kind: 'deed', text: '长'.repeat(150) })
assert.equal(long.ok, true, '150 字应允许（软边界）')
assert.match(String(long.warning || ''), /超过建议/)
assert.equal(m.appendSelf({ kind: 'deed', text: '长'.repeat(301) }).ok, false, '301 字应拒绝（硬顶）')

// 3. 一天 3 条是建议，不是硬限；硬顶 12
assert.equal(m.appendSelf({ kind: 'lesson', text: '以为加功能是帮忙，其实让人更迷茫' }).ok, true)
assert.equal(m.appendSelf({ kind: 'moment', text: '他说没路了，我只把事做小' }).ok, true)
const over = m.appendSelf({ kind: 'deed', text: '第四条' })
assert.equal(over.ok, true, '第 4 条应允许，只给提醒')
assert.match(String(over.warning || ''), /超过建议/)
let last = over
for (let i = 0; i < 10; i += 1) last = m.appendSelf({ kind: 'deed', text: `第 ${i + 5} 条` })
assert.equal(m.readSelf({ limit: 100 }).length, 12, '硬顶 12 条')
assert.equal(last.ok, false, '第 13 条应拒绝')

// 4. 按类型取 + 注入块
assert.equal(m.readSelf({ kind: 'lesson' }).length, 1)
const block = m.selfMemoryBlock('dayu')
assert.match(block, /我最近记得的自己/)
assert.match(block, /做到|做过|学到/)
assert.ok(block.length <= 260, `注入块太长：${block.length}`)

// 5. 别的角色看不到
assert.equal(m.readSelf({ role: 'xiaoyu' }).length, 0)

fs.rmSync(TMP, { recursive: true, force: true })
console.log('test-self-memory: 通过（写入 / 软边界 / 过滤 / 注入块）')
