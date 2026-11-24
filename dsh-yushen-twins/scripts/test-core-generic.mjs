// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜scripts/test-core-generic.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: test-core-generic
 * kind: module
 * summary: 通用记忆核心的等价自测：lib/ 的薄壳和 memory-core/generic/ 的真身必须是同一套行为，不是两份源码。
 * tags: 测试, 记忆核心, 搬家, 薄壳, 定义, 自我记忆
 * created: 2026-11-24 21:2x
 * author: 大鱼·本班
 * authority: 老板（2026-11-24：核心那两个本来就通用的模块搬进 memory-core/generic/，lib 留薄壳转发）
 * why: 搬家最容易出的错不是搬错，是搬完 lib/ 和 core/ 悄悄长成两套（各写各的 jsonl、各有一套上限）
 * result: 同一套实现（函数同一引用）、写一处两边读到一致、注入块逐字一致、SELF_KINDS 8 类 四条钉住
 * mutable: 可改；只许更严（比“同行为”更松的断言不要写）
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 只删这个 mkdtemp 出来的临时家；不许碰真 ~/.dsh
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-core-generic-'))
assert.equal(path.dirname(TMP), os.tmpdir(), '临时家必须在系统 temp 下')
process.env.DSH_HOME = TMP
fs.mkdirSync(path.join(TMP, 'dayu'), { recursive: true })

const rel = (p) => new URL(p, import.meta.url).href
const libD = await import(rel('../lib/definitions.js'))
const coreD = await import(rel('../memory-core/generic/definitions.js'))
const libS = await import(rel('../lib/self-memory.js'))
const coreS = await import(rel('../memory-core/generic/self-memory.js'))

// 1. 同一套实现：薄壳只是转发，lib/ 与 core/ 拿到的是同一个模块实例、同一批函数
for (const n of ['readDefinitions', 'definitionConflict', 'addDefinition', 'buildDefinitionsBlock']) {
  assert.equal(typeof libD[n], 'function', `lib/definitions.js 没导出 ${n}`)
  assert.equal(libD[n], coreD[n], `${n} 不是同一份实现：lib/ 和 core/ 长成了两套`)
}
for (const n of ['readSelf', 'appendSelf', 'selfMemoryBlock']) {
  assert.equal(typeof libS[n], 'function', `lib/self-memory.js 没导出 ${n}`)
  assert.equal(libS[n], coreS[n], `${n} 不是同一份实现：lib/ 和 core/ 长成了两套`)
}
assert.equal(libS.SELF_KINDS, coreS.SELF_KINDS, 'SELF_KINDS 必须是同一个冻结数组')

// 2. 决定簿：从 lib/ 写一条，core/ 读到的东西必须一致（条数 + 文本 + 日期）
const one = '图书馆收录整个软件，角色只是其中一卷。'
assert.equal(libD.addDefinition({ text: one, source: '等价自测', quote: '原话' }).ok, true)
const fromLib = libD.readDefinitions()
const fromCore = coreD.readDefinitions()
assert.equal(fromCore.length, 1, `薄壳写的，真身没读到（读到 ${fromCore.length} 条）`)
assert.deepEqual(fromCore.map((r) => r.text), fromLib.map((r) => r.text))
assert.deepEqual(fromCore.map((r) => r.at), fromLib.map((r) => r.at))

// 反过来：从 core/ 写一条，lib/ 也读得到（同一份 jsonl，不是各写各的）
const two = '以后别把整段回答当成事件记。'
assert.equal(coreD.addDefinition({ text: two }).ok, true)
assert.equal(libD.readDefinitions().length, 2, '两边不是同一份 definitions.jsonl')
assert.equal(coreD.readDefinitions().length, 2)
assert.deepEqual(coreD.readDefinitions().map((r) => r.text).sort(), libD.readDefinitions().map((r) => r.text).sort())
// 去重也是同一套：薄壳再写一遍真身写过的那条
assert.equal(libD.addDefinition({ text: two }).deduped, true, '去重没走同一份逻辑')

// 3. 改口：同话题 + 改口 → 旧的标已覆盖；两边读到的都只剩生效的
const change = '决定：档案馆以后不再单独收一份，改用图书馆这一套。'
assert.equal(libD.addDefinition({ text: change }).ok, true)
const afterLib = libD.readDefinitions()
const afterCore = coreD.readDefinitions()
assert.deepEqual(afterCore.map((r) => r.text), afterLib.map((r) => r.text))
assert.ok(afterCore.every((r) => r.status !== 'superseded'), '生效里不该混进已覆盖的')
assert.equal(libD.readDefinitions({ includeSuperseded: true }).length, coreD.readDefinitions({ includeSuperseded: true }).length)

// 4. 注入块逐字一致：相关话题出块、不相关不出
const task = '你还记得图书馆收什么吗'
assert.equal(coreD.buildDefinitionsBlock(task), libD.buildDefinitionsBlock(task))
assert.match(coreD.buildDefinitionsBlock(task), /长期决定/)
assert.equal(libD.buildDefinitionsBlock('今天天气怎么样'), '')
assert.equal(coreD.buildDefinitionsBlock('今天天气怎么样'), '')

// 5. 自我记忆：从 lib/ 写一条，core/ 读回一致；反过来也一样
const deed = '把自启收进插件，返工两次，最后成了'
assert.equal(libS.appendSelf({ kind: 'deed', text: deed, emotion: '累', about: '老板' }).ok, true)
const selfFromCore = coreS.readSelf()
assert.equal(selfFromCore.length, 1, `薄壳写的，真身没读到（读到 ${selfFromCore.length} 条）`)
assert.deepEqual(selfFromCore.map((r) => r.text), libS.readSelf().map((r) => r.text))
assert.deepEqual(selfFromCore.map((r) => r.kind), ['deed'])

const lesson = '以为加功能是帮忙，其实让人更迷茫'
assert.equal(coreS.appendSelf({ kind: 'lesson', text: lesson }).ok, true)
assert.equal(libS.readSelf().length, 2, '两边不是同一份 self-memory.jsonl')
assert.deepEqual(coreS.readSelf({ kind: 'lesson' }).map((r) => r.text), [lesson])
assert.deepEqual(libS.readSelf({ kind: 'lesson' }).map((r) => r.text), [lesson])

// 6. SELF_KINDS：8 类，两边都含全
const KINDS = ['deed', 'lesson', 'moment', 'stance', 'bond', 'vow', 'wish', 'open']
assert.equal(libS.SELF_KINDS.length, 8, 'SELF_KINDS 应为 8 类')
assert.deepEqual([...libS.SELF_KINDS], KINDS)
assert.deepEqual([...coreS.SELF_KINDS], KINDS)
for (const k of KINDS) assert.ok(coreS.SELF_KINDS.includes(k), `真身缺 ${k}`)

// 7. 注入块逐字一致；角色过滤也一致（别的角色看不到 dayu 的）
assert.equal(coreS.selfMemoryBlock('dayu'), libS.selfMemoryBlock('dayu'))
assert.match(coreS.selfMemoryBlock('dayu'), /我最近记得的自己/)
assert.equal(libS.readSelf({ role: 'xiaoyu' }).length, coreS.readSelf({ role: 'xiaoyu' }).length)
assert.equal(libS.readSelf({ role: 'xiaoyu' }).length, 0)

// 8. 数据确实落在临时家里（没悄悄写回真 ~/.dsh），文件名与搬家前一致
assert.ok(fs.existsSync(path.join(TMP, 'dayu', 'definitions.jsonl')), '定义没落在 <DSH_HOME>/dayu/definitions.jsonl')
assert.ok(fs.existsSync(path.join(TMP, 'dayu', 'self-memory.jsonl')), '自我记忆没落在 <DSH_HOME>/dayu/self-memory.jsonl')

fs.rmSync(TMP, { recursive: true, force: true })
console.log('test-core-generic: 通过（同一份实现 / 决定簿两边一致 / 自我记忆两边一致 / SELF_KINDS 8 类）')
