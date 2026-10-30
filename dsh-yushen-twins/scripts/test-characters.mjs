// 名册的通用性：换成别人自己的角色也能活；绝不动已有文件。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-chars-'))
process.env.DSH_HOME = HOME
const SOUL = path.join(HOME, 'dayu', 'soul')
fs.mkdirSync(path.join(SOUL, 'cards'), { recursive: true })
fs.mkdirSync(path.join(SOUL, 'memory'), { recursive: true })

const chars = await import('../lib/characters.js')
const soul = await import('../lib/soul.js')
const residence = await import('../lib/residence.js')

// 1) 没有名册也没有 persona：出厂默认只点亮一个角色（2026-10-30 改：一般人家只养一条鱼），
//    但「认识的角色目录」仍是三个——getCharacter 能按 id 取到照微，卡和标题都在。
const builtin = chars.listCharacters()
assert.deepEqual(builtin.map((c) => c.id), ['dayu'])
assert.equal(chars.BUILTIN_ROLES.find((c) => c.id === 'dragon').title, '照微·顾问')

// 2) 用户只写自己的角色：名册为准，不搀进出厂角色
fs.writeFileSync(path.join(SOUL, 'cards', 'aria.desk.md'), '# 阿丽亚\n我是阿丽亚，一个用户自己带来的角色。\n我有责任心，也有自己的底线。\n', 'utf8')
fs.writeFileSync(path.join(SOUL, 'memory', 'aria.json'), JSON.stringify({ version: 1, summary: '刚搬进来', habits: ['说话慢'], dynamics: [] }), 'utf8')
fs.writeFileSync(path.join(HOME, 'dayu', 'characters.json'), JSON.stringify({
  version: 1,
  characters: [{ id: 'aria', name: '阿丽亚', alias: '小亚', title: '阿丽亚·常驻', cards: { desk: 'cards/aria.desk.md' }, memory: 'memory/aria.json', cwd: HOME }],
}), 'utf8')

assert.deepEqual(chars.characterIds(), ['aria'])
const text = soul.buildSceneText('aria', 'desk')
assert.match(text, /阿丽亚/)
assert.match(text, /责任心/)
assert.match(text, /底线/)
assert.match(text, /刚搬进来/)
assert.match(text, /不分通道/)
assert.equal(soul.soulStatus('aria').name, '阿丽亚')

// 3) 她的身体：标题、cwd 都跟着名册走
const made = []
const agents = {
  get: () => null,
  create: async () => { throw new Error('不该走 agents.create') },
}
const deps = {
  agents,
  log: () => {},
  listRows: () => [],
  findSession: async () => false,
  createSession: async ({ cwd }) => { made.push({ cwd }); return 'sess-aria' },
  selectModel: async () => {},
  renameSession: async () => {},
  prompt: async () => {},
}
const body = await residence.ensureRole('aria', deps)
assert.equal(body.created, true)
assert.equal(body.title, '阿丽亚·常驻')
assert.equal(made[0].cwd, HOME)
assert.deepEqual(residence.residentRoles(), ['aria'])

// 4) 不覆盖：同名、同文件、越界，全部拒绝
assert.throws(() => chars.addCharacter({ id: 'aria', name: '阿丽亚' }), /已经有这个角色/)
assert.throws(() => chars.addCharacter({ id: 'bob', name: '鲍勃', cardRel: 'cards/aria.desk.md' }), /卡文件已存在/)
assert.throws(() => chars.addCharacter({ id: 'bob', name: '鲍勃', cardRel: '../outside.md' }), /外面/)
assert.throws(() => soul.buildSceneText('nobody', 'desk'), /没有这个角色/)

// 5) 加一个全新角色：只写新文件，名册里多一条
const bob = chars.addCharacter({ id: 'bob', name: '鲍勃', title: '鲍勃·常驻', card: '# 鲍勃\n新来的。\n' })
assert.equal(bob.id, 'bob')
assert.equal(fs.readFileSync(path.join(SOUL, 'cards', 'bob.desk.md'), 'utf8'), '# 鲍勃\n新来的。\n')
assert.deepEqual(chars.characterIds().sort(), ['aria', 'bob'])
// 新加的角色默认休眠：不点化就不注入
assert.equal(soul.buildSceneText('bob', 'desk'), '')
const awakening = await import('../lib/awakening.js')
awakening.awaken('bob', { note: '测试点化' })
assert.match(soul.buildSceneText('bob', 'desk'), /新来的/)

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, builtinFirst: true, customRoster: true, noOverwrite: true }))
