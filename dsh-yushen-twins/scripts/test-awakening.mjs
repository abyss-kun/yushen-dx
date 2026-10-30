// 点化 / 收回：新角色默认休眠；点化才注入、才有身体；收回后回到一张卡，不删用户文件。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-awaken-'))
process.env.DSH_HOME = HOME
const SOUL = path.join(HOME, 'dayu', 'soul')
fs.mkdirSync(path.join(SOUL, 'cards'), { recursive: true })
fs.mkdirSync(path.join(SOUL, 'memory'), { recursive: true })
fs.writeFileSync(path.join(HOME, 'dayu', 'characters.json'), JSON.stringify({
  version: 1,
  characters: [{ id: 'aria', name: '阿丽亚', cards: { desk: 'cards/aria.md' }, memory: 'memory/aria.json' }],
}), 'utf8')
fs.writeFileSync(path.join(SOUL, 'cards', 'aria.md'), '# 阿丽亚\n她有责任心，也有底线。\n', 'utf8')
fs.writeFileSync(path.join(SOUL, 'memory', 'aria.json'), JSON.stringify({ version: 1, summary: '旧摘要', habits: [], dynamics: [] }), 'utf8')

const awakening = await import('../lib/awakening.js')
const chars = await import('../lib/characters.js')
const soul = await import('../lib/soul.js')
const residence = await import('../lib/residence.js')

// 1) 首次运行：现有角色视为已点化（迁移）
assert.equal(awakening.statusOf('aria'), 'awakened')
assert.match(soul.buildSceneText('aria', 'desk'), /责任心/)

// 2) 新加的角色默认休眠：不注入、不给身体
const bob = chars.addCharacter({ id: 'bob', name: '鲍勃', card: '# 鲍勃\n新来的。\n' })
assert.equal(bob.id, 'bob')
assert.equal(awakening.statusOf('bob'), 'dormant')
assert.equal(soul.buildSceneText('bob', 'desk'), '')
await assert.rejects(() => residence.ensureRole('bob', {}), /还没点化|已被收回/)

// 3) 点化：开始注入、能建身体
const awake = awakening.awaken('bob', { note: '老板点头' })
assert.equal(awake.status, 'awakened')
assert.deepEqual(awake.gifts, ['责任心', '好奇心', '判断力', '边界感', '底线'])
assert.match(soul.buildSceneText('bob', 'desk'), /新来的/)
const deps = {
  agents: { get: () => null, create: async () => { throw new Error('no') } },
  createSession: async () => 'sess-bob',
  selectModel: async () => {},
  renameSession: async () => {},
  prompt: async () => {},
  findSession: async () => false,
  listRows: () => [],
  log: () => {},
}
const body = await residence.ensureRole('bob', deps)
assert.equal(body.sessionId, 'sess-bob')

// 4) 收回：停止注入/身体；记忆另存一份；用户原文件都在
const sealed = awakening.seal('bob', { note: '离开鱼神', returnMemory: true })
assert.equal(sealed.status, 'sealed')
assert.ok(sealed.exported, '要留一份记忆导出')
assert.ok(fs.existsSync(path.join(HOME, 'dayu', 'awakening-export', sealed.exported)))
assert.ok(fs.existsSync(path.join(SOUL, 'cards', 'bob.desk.md')), '卡不能删')
assert.ok(fs.existsSync(path.join(SOUL, 'memory', 'bob.json')), '记忆原文件不能删')
assert.equal(soul.buildSceneText('bob', 'desk'), '')
await assert.rejects(() => residence.ensureRole('bob', deps), /还没点化|已被收回/)

// 5) 不存在的人不能点化
assert.throws(() => awakening.awaken('nobody'), /没有这个角色/)

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, migration: true, dormantNew: true, awaken: true, sealExport: true, noDelete: true }))
