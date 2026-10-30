import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-mind-tools-'))
const { markBody } = await import('../lib/residence.js')
const { registerMindTools } = await import('../lib/mind-tools.js')
const registered = []
registerMindTools({ register(t) { registered.push(t) } }, { type: 'object' })
const tool = registered[0]
const caller = id => ({ agent: { session: { header: { id } } } })
markBody('dayu', { sessionId: 'dayu-test' })
markBody('xiaoyu', { sessionId: 'xiaoyu-test' })
const soul = path.join(process.env.DSH_HOME, 'dayu', 'soul')
fs.mkdirSync(path.join(soul, 'cards'), { recursive: true })
fs.mkdirSync(path.join(soul, 'memory'), { recursive: true })
fs.writeFileSync(path.join(soul, 'cards', 'newcomer.desk.md'), '# 新角色\n')
fs.writeFileSync(path.join(soul, 'memory', 'newcomer.json'), '{}\n')
fs.writeFileSync(path.join(process.env.DSH_HOME, 'dayu', 'characters.json'), JSON.stringify({ version: 1, characters: [
  ...['dayu', 'xiaoyu', 'dragon'].map(id => ({ id, name: id, cards: { desk: 'cards/newcomer.desk.md' }, memory: 'memory/newcomer.json' })),
  { id: 'newcomer', name: '新角色', cards: { desk: 'cards/newcomer.desk.md' }, memory: 'memory/newcomer.json' },
] }))
markBody('newcomer', { sessionId: 'newcomer-test' })
// 动态名册在模块已加载后仍应被实时读取；不依赖静态三角色常量。
await assert.rejects(() => tool.execute({ action: 'query', role: 'dayu' }, caller('unbound')))
await assert.rejects(() => tool.execute({ action: 'remember', kind: 'owner_preference', text: '伪造确认' }, caller('dayu-test')))
const created = await tool.execute({ action: 'remember', kind: 'interest', text: '海洋探索', detail: '这是测试角色自己的声明，不伪装实际看过媒体' }, caller('dayu-test'))
assert.equal(created.item.role, 'dayu')
assert.equal(created.item.epistemic, 'inferred')
assert.equal(created.item.scope.conversationId, 'dayu-test')
const own = await tool.execute({ action: 'query', text: '海洋探索' }, caller('dayu-test'))
assert.equal(own.items.length, 1)
assert.equal((await tool.execute({ action: 'query', text: '海洋探索', role: 'dayu' }, caller('xiaoyu-test'))).items.length, 0)
assert.equal((await tool.execute({ action: 'remember', kind: 'interest', text: '海洋探索' }, caller('dayu-test'))).deduped, true)
const newcomer = await tool.execute({ action: 'remember', kind: 'question', text: '新角色隔离' }, caller('newcomer-test'))
assert.equal(newcomer.item.role, 'newcomer')
assert.equal((await tool.execute({ action: 'query', text: '新角色隔离' }, caller('newcomer-test'))).items.length, 1)
assert.equal((await tool.execute({ action: 'query', text: '新角色隔离' }, caller('dayu-test'))).items.length, 0)
console.log('mind tools: caller binding, refusal, own write/read, role isolation and dedupe passed; no network/model')
