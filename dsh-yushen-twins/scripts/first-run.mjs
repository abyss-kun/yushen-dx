// 第一次运行：给新用户把"鱼窝"搭起来（认主 + 两个空白角色 + 点化）。
//
//   node scripts/first-run.mjs --call 老板 --qq 12345678
//
// 出厂包不带任何人的记忆/卡；这里用 preset/ 生成中性的卡，再把她"点化"。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const SOUL = path.join(DATA, 'soul')
const CARDS = path.join(SOUL, 'cards')

function arg(name, def = '') {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? String(process.argv[i + 1] || def) : def
}
const callName = arg('call', '老板').trim() || '老板'
const qq = arg('qq', '').trim()

const preset = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'preset', 'persona.preset.json'), 'utf8')) } catch { return {} }
})()
const charterPreset = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'preset', 'charter.preset.json'), 'utf8')) } catch { return {} }
})()

fs.mkdirSync(CARDS, { recursive: true })
fs.mkdirSync(path.join(SOUL, 'memory'), { recursive: true })
fs.mkdirSync(path.join(DATA, 'runtime'), { recursive: true })

function cardText(role, p) {
  return [
    `# ${p.name || role}`,
    '',
    `- 别名：${p.alias || p.name || role}`,
    `- 岗位：${p.role || '鱼窝里的一个角色'}`,
    `- 说话：${p.voice || '自然、简短'}`,
    `- 级别：${p.level || 'L0/L1'}`,
    '',
    '> 这是出厂预设卡，可以改成你自己的人。记忆从今天开始长。',
  ].join('\n')
}

const characters = []
for (const [id, key] of [['dayu', 'housekeeper'], ['xiaoyu', 'assistant']]) {
  const p = preset[key] || { id, name: id }
  const desk = `cards/${id}.desk.md`
  const social = `cards/${id}.social.md`
  fs.writeFileSync(path.join(SOUL, desk), cardText(id, p), 'utf8')
  fs.writeFileSync(path.join(SOUL, social), cardText(id, p), 'utf8')
  characters.push({
    id,
    name: p.name || id,
    alias: p.alias || p.name || id,
    title: p.name || id,
    cards: { desk, social },
    memory: `memory/${id}.json`,
  })
}
fs.writeFileSync(path.join(DATA, 'characters.json'), `${JSON.stringify({ version: 1, characters }, null, 2)}\n`, 'utf8')

// persona.json：老代码按场景找卡，写一份最小的
fs.writeFileSync(path.join(SOUL, 'persona.json'), `${JSON.stringify({
  version: 3,
  note: '出厂预设：两个中性角色，记忆从今天开始长',
  scenes: { desk: 'cards/dayu.desk.md', social: 'cards/dayu.social.md', deskXiaoyu: 'cards/xiaoyu.social.md', socialXiaoyu: 'cards/xiaoyu.social.md' },
}, null, 2)}\n`, 'utf8')

// 宪章：没有就写预设骨架
const CHARTER = path.join(DATA, 'charter.json')
if (!fs.existsSync(CHARTER)) {
  fs.writeFileSync(CHARTER, `${JSON.stringify({ version: 5, ...charterPreset }, null, 2)}\n`, 'utf8')
}

// 点化
let awakenResult = []
try {
  const { awaken, listAwakening } = await import(pathToFileURL(path.join(ROOT, 'lib', 'awakening.js')).href)
  for (const c of characters) {
    try { awaken(c.id, { note: '出厂预设点化', by: 'first-run' }) } catch { /* 已经醒了 */ }
  }
  awakenResult = listAwakening().map((x) => `${x.role ?? x.id ?? '?'}:${x.status}`)   // 2026-10-29:  stranger test 里这里打出了 undefined:awakened
} catch (e) { awakenResult = [`点化模块没跑起来：${String(e?.message || e).slice(0, 60)}`] }

// 认主
let ownerResult = null
if (qq) {
  try {
    const { writeOwner } = await import(pathToFileURL(path.join(ROOT, 'lib', 'onboard.js')).href)
    ownerResult = writeOwner({ callName })
    const ownerFile = path.join(DATA, 'owner.json')
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'))
    owner.uids = owner.uids || {}
    owner.uids.qq = [...new Set([...(owner.uids.qq || []), qq])]
    fs.writeFileSync(ownerFile, `${JSON.stringify(owner, null, 2)}\n`, 'utf8')
  } catch (e) { ownerResult = { error: String(e?.message || e).slice(0, 80) } }
}

console.log(JSON.stringify({
  ok: true,
  home: HOME,
  characters: characters.map((c) => `${c.id}=${c.name}`),
  awakened: awakenResult,
  owner: ownerResult || '没给 --qq，先不绑号（远程会认不出你）',
  next: [
    '启动 DSH 并启用 dsh-yushen-core',
    '工作台里她会第一次读到规则（简报里出现"接着的"）',
    '要聊天通道再加适配器；不用 QQ 也能先在鱼窝里养',
  ],
}, null, 2))
