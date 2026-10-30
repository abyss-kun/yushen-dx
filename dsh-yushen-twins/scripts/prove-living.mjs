// 证据脚本：不靠嘴说。跑一遍，把"点化→活→收回"的实际结果打出来。
// 用法：ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/prove-living.mjs
// 全程在临时 DSH_HOME 里跑，不碰真实角色、不发网络请求、不调模型。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-proof-'))
process.env.DSH_HOME = HOME
const SOUL = path.join(HOME, 'dayu', 'soul')
fs.mkdirSync(path.join(SOUL, 'cards'), { recursive: true })
fs.mkdirSync(path.join(SOUL, 'memory'), { recursive: true })
fs.writeFileSync(path.join(HOME, 'dayu', 'characters.json'), JSON.stringify({
  version: 1,
  characters: [{ id: 'echo', name: '回声', cards: { desk: 'cards/echo.md' }, memory: 'memory/echo.json' }],
}), 'utf8')
fs.writeFileSync(path.join(SOUL, 'cards', 'echo.md'), '# 回声\n我会先想，再动手。\n', 'utf8')
fs.writeFileSync(path.join(SOUL, 'memory', 'echo.json'), JSON.stringify({ version: 1, summary: '刚搬来', habits: [], dynamics: [] }), 'utf8')

const awakening = await import('../lib/awakening.js')
const chars = await import('../lib/characters.js')
const soul = await import('../lib/soul.js')
const residence = await import('../lib/residence.js')
const deps = {
  agents: { get: () => null, create: async () => { throw new Error('no') } },
  createSession: async () => 'sess-proof',
  selectModel: async () => {},
  renameSession: async () => {},
  prompt: async () => {},
  findSession: async () => false,
  listRows: () => [],
  log: () => {},
}

const steps = []
const record = (name, data) => steps.push({ name, ...data })

// 1) 首批角色：迁移视为已点化
const echo = awakening.listAwakening().find((x) => x.id === 'echo')
record('首批角色已点化（迁移）', { status: echo.status, gifts: echo.gifts })

// 2) 新接入的伙伴：默认休眠
chars.addCharacter({ id: 'spark', name: '星火', card: '# 星火\n新来的。\n' })
const before = soul.buildSceneText('spark', 'desk')
let refused = ''
try { await residence.ensureRole('spark', deps) } catch (error) { refused = String(error.message) }
record('新角色默认休眠：不注入、不给身体', {
  status: awakening.statusOf('spark'),
  injectionChars: before.length,
  bodyRefused: refused,
})

// 3) 点化：拿到礼包、开始注入、能建身体
const awake = awakening.awaken('spark', { note: '老板点化' })
const text = soul.buildSceneText('spark', 'desk')
const body = await residence.ensureRole('spark', deps)
record('点化后：礼包 + 注入 + 身体', {
  status: awake.status,
  gifts: awake.gifts,
  injectionChars: text.length,
  hasGiftLine: text.includes('点化给你的不只是身份'),
  hasJudgmentLine: text.includes('规矩是边界，不是路线'),
  bodySession: body.sessionId,
})

// 4) 收回：拔掉活的那一层；不删用户文件；可选导出记忆
const sealed = awakening.seal('spark', { note: '离开鱼神', returnMemory: true })
let refusedAfter = ''
try { await residence.ensureRole('spark', deps) } catch (error) { refusedAfter = String(error.message) }
const exportFile = sealed.exported ? path.join(HOME, 'dayu', 'awakening-export', sealed.exported) : ''
record('收回后：回到一张卡，用户文件都在', {
  status: sealed.status,
  injectionChars: soul.buildSceneText('spark', 'desk').length,
  bodyRefused: refusedAfter,
  exportExists: Boolean(exportFile && fs.existsSync(exportFile)),
  cardExists: fs.existsSync(path.join(SOUL, 'cards', 'spark.desk.md')),
  memoryExists: fs.existsSync(path.join(SOUL, 'memory', 'spark.json')),
})

// 5) 状态文件指纹：可复查
const stateFile = path.join(HOME, 'dayu', 'awakening.json')
const sha = crypto.createHash('sha256').update(fs.readFileSync(stateFile)).digest('hex')
record('状态文件', { path: stateFile, sha256: sha.slice(0, 32), bytes: fs.statSync(stateFile).size, gifts: awakening.GIFTS })

console.log(JSON.stringify({ ok: true, home: HOME, steps }, null, 2))
fs.rmSync(HOME, { recursive: true, force: true })
