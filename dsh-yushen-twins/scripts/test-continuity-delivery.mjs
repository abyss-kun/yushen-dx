// Offline integration: real residence delivery -> scoped mind lookup -> transport text.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-continuity-'))
process.env.DSH_HOME = home
const { recordInterest, recordPromise } = await import('../lib/mind-store.js')
const { deliverToRole, markBody, prepareResidenceText } = await import('../lib/residence.js')
const { buildSceneText } = await import('../lib/soul.js')
const { composeBiliPersona } = await import('../lib/bili-sync.js')
const root = path.join(home, 'dayu', 'soul')
fs.mkdirSync(path.join(root, 'cards'), { recursive: true })
fs.mkdirSync(path.join(root, 'memory'), { recursive: true })
fs.writeFileSync(path.join(root, 'cards', 'dayu.desk.md'), '# fixture identity')
fs.writeFileSync(path.join(root, 'cards', 'dayu.social.md'), '# fixture social identity')
fs.writeFileSync(path.join(root, 'memory', 'dayu.json'), JSON.stringify({ summary: 'PRIVATE_MEMORY_SENTINEL', habits: [], dynamics: [], events: [] }))
const scope = { channel: 'workbench', conversationId: 'resident-test', audience: 'private' }
const source = { quote: 'fixture source', speaker: 'fixture', messageId: 'fixture-message' }
recordInterest('dayu', { text: '海洋知识', scope, source })
recordPromise('dayu', { text: '待核实承诺', scope, source })
recordInterest('xiaoyu', { text: 'OTHER_ROLE_SENTINEL', scope, source })
recordInterest('dayu', { text: 'OTHER_SCOPE_SENTINEL', scope: { ...scope, conversationId: 'another' }, source })
markBody('dayu', { sessionId: 'resident-test', source: 'rpc' })
const calls = []
const deps = { agents: { get() {} }, findSession: async id => id === 'resident-test', prompt: async value => calls.push(value) }
const out = await deliverToRole('dayu', '海洋知识', deps)
assert.equal(out.sessionId, 'resident-test')
const sent = calls.at(-1).text
assert(sent.includes('海洋知识') && sent.includes('心念简报') && sent.includes('待核实承诺'))
assert(!sent.includes('OTHER_ROLE_SENTINEL') && !sent.includes('OTHER_SCOPE_SENTINEL'))
assert(!prepareResidenceText('dayu', 'other-session', '海洋知识').includes('心念简报'))
// 2026-10-27：常驻投递送进去的是整段场景提示（常 600+ 字），而心念库的 text 是检索词（上限 500）。
// 直接传整段会抛错 → 每轮挂一句「读取失败」，心念一次都没带进来过。这条断言钉住它。
const longPrompt = `小鱼，现在是你的自由时间，没人派活，也不用向谁汇报。${'· 想做就去做，不只是想。'.repeat(30)}`
assert(longPrompt.length > 500, 'fixture 必须真的超过 500 字')
const longOut = prepareResidenceText('dayu', 'resident-test', longPrompt)
assert(!longOut.includes('读取失败'), '整段场景提示不该把心念读取打挂')
assert(longOut.includes('心念简报'), '整段场景提示下仍要带进心念简报')
assert(buildSceneText('dayu', 'desk').includes('PRIVATE_MEMORY_SENTINEL'))
for (const scene of ['qq', 'social', 'bili', 'bilibili']) assert(!buildSceneText('dayu', scene).includes('PRIVATE_MEMORY_SENTINEL'), scene)
const bili = composeBiliPersona('dayu')
assert(bili.includes('当前通道：B站') && !bili.includes('PRIVATE_MEMORY_SENTINEL'))
console.log('continuity delivery: 13 assertions passed; isolated fixtures only, no model or network')
console.log(`fixtures: ${home}`)
