// 鱼神 · 角色名册
// 「谁住在这套软件里」只由这份名册决定：每个角色一张卡、一份记忆、一条常驻会话。
// 发行版不覆盖用户已有的角色：只读用户目录，写入时一律「已存在就拒绝」。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const DATA = path.join(HOME, 'dayu')
export const SOUL_DIR = path.join(DATA, 'soul')
export const MANIFEST = path.join(DATA, 'characters.json')
const PERSONA = path.join(SOUL_DIR, 'persona.json')

// 出厂自带的三个角色：新用户没有 characters.json 时也能跑；老用户沿用同一批文件。
const BUILTINS = [
  { id: 'dayu', name: '管家', alias: '管家', title: '鱼神·总台', cards: { desk: 'cards/dayu.desk.md', social: 'cards/dayu.social.md' }, memory: 'memory/dayu.json' },
  { id: 'xiaoyu', name: '助手', alias: '助手', title: '助手·管家', cards: { desk: 'cards/xiaoyu.social.md', social: 'cards/xiaoyu.social.md' }, memory: 'memory/xiaoyu.json' },
  { id: 'dragon', name: '顾问', alias: '顾问', title: '顾问·太上长老', cards: { desk: 'cards/dragon.desk.md', social: 'cards/dragon.desk.md' }, memory: 'memory/dragon.json' },
]
const ID_RE = /^[a-z][a-z0-9_-]{1,31}$/
const DEFAULTS = { titleSuffix: '·常驻', memory: () => ({}), card: (name) => `# ${name}（角色卡）\n\n> 这是你的本体卡。写清楚：你是谁、你在意什么、你能做什么、不能做什么、你的底线。\n` }

function fail(message) { throw new TypeError(message) }

/** 路径必须在角色目录里：绝对路径、`..`、越界一律拒绝。 */
function inside(base, rel, label) {
  if (typeof rel !== 'string' || !rel.trim()) fail(`${label} 不能为空`)
  if (path.isAbsolute(rel)) fail(`${label} 必须是相对路径：${rel}`)
  const full = path.resolve(base, rel)
  const prefix = path.resolve(base) + path.sep
  if (!full.startsWith(prefix)) fail(`${label} 跑到角色目录外面了：${rel}`)
  return full
}

function normalize(input, { source = 'manifest' } = {}) {
  if (!input || typeof input !== 'object') fail('角色必须是一个对象')
  const id = String(input.id || '').trim()
  if (!ID_RE.test(id)) fail(`角色 id 不合法（小写字母开头，2–32 位）：${id}`)
  const name = String(input.name || '').trim()
  if (!name || name.length > 40) fail(`角色 name 必须是 1–40 字：${id}`)
  const title = String(input.title || `${name}${DEFAULTS.titleSuffix}`).trim()
  if (title.length > 60) fail(`角色 title 太长：${id}`)
  const cards = input.cards && typeof input.cards === 'object' ? input.cards : {}
  const desk = inside(SOUL_DIR, cards.desk || DEFAULTS.cardPath?.(id) || `cards/${id}.desk.md`, `${id}.cards.desk`)
  const social = cards.social ? inside(SOUL_DIR, cards.social, `${id}.cards.social`) : desk
  const memory = input.memory ? inside(SOUL_DIR, input.memory, `${id}.memory`) : path.join(SOUL_DIR, 'memory', `${id}.json`)
  const cwd = String(input.cwd || '').trim()
  if (cwd && path.isAbsolute(cwd) === false) fail(`${id}.cwd 必须是绝对路径或留空`)
  const model = String(input.model || '').trim()
  return {
    id,
    name,
    alias: String(input.alias || '').trim().slice(0, 40),
    title,
    cards: { desk, social },
    cardRels: { desk: path.relative(SOUL_DIR, desk), social: path.relative(SOUL_DIR, social) },
    memory,
    memoryRel: path.relative(SOUL_DIR, memory),
    cwd,
    model,
    builtin: !input.builtin ? source === 'builtin' : Boolean(input.builtin),
    source,
  }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

/** 从旧版 persona.json 认识现有角色（没有 characters.json 的老安装）。 */
function fromPersona() {
  const persona = readJson(PERSONA)
  if (!persona) return []
  const ids = new Set([...Object.keys(persona.memory || {}), ...Object.keys(persona.scenes || {})].map((key) => {
    if (key === 'desk' || key === 'social') return 'dayu'
    if (key === 'socialXiaoyu' || key === 'deskXiaoyu') return 'xiaoyu'
    if (key === 'dragon' || key === 'dragonDesk' || key === 'dragonSocial') return 'dragon'
    return key
  }))
  const known = new Map(BUILTINS.map((c) => [c.id, c]))
  const out = []
  for (const id of ids) {
    if (!ID_RE.test(id)) continue
    const base = known.get(id)
    const cardFor = (scene) => persona.scenes?.[scene]
    const cards = id === 'dayu'
      ? { desk: cardFor('desk') || base?.cards.desk, social: cardFor('social') || base?.cards.social }
      : id === 'xiaoyu'
        ? { desk: cardFor('deskXiaoyu') || cardFor('socialXiaoyu') || base?.cards.desk, social: cardFor('socialXiaoyu') || base?.cards.social }
        : { desk: cardFor('dragon') || base?.cards.desk, social: cardFor('dragonSocial') || base?.cards.social }
    try {
      out.push(normalize({
        id,
        name: base?.name || id,
        alias: base?.alias || '',
        title: base?.title,
        cards,
        memory: persona.memory?.[id],
        cwd: base?.cwd,
        builtin: true,
      }, { source: 'persona' }))
    } catch { /* 单条坏了不影响别人 */ }
  }
  return out
}

let cache = { mtimeMs: -1, list: [] }

/** 名册：characters.json 优先；没有就从 persona.json 认识；再没有就是出厂三人。 */
export function listCharacters() {
  try {
    const st = fs.statSync(MANIFEST)
    if (cache.mtimeMs === st.mtimeMs) return cache.list
    const raw = readJson(MANIFEST)
    const rows = Array.isArray(raw?.characters) ? raw.characters : []
    const list = []
    const seen = new Set()
    for (const row of rows) {
      try {
        const c = normalize(row, { source: 'manifest' })
        if (seen.has(c.id)) continue
        seen.add(c.id)
        list.push(c)
      } catch { /* 坏条目跳过，不拖垮别人 */ }
    }
    if (list.length) {
      cache = { mtimeMs: st.mtimeMs, list }
      return list
    }
  } catch { /* 没有名册 */ }
  const fromPersonaList = fromPersona()
  const list = fromPersonaList.length
    ? fromPersonaList
    : BUILTINS.map((c) => normalize(c, { source: 'builtin' }))
  cache = { mtimeMs: -1, list }
  return list
}

export function characterIds() {
  return listCharacters().map((c) => c.id)
}

export function getCharacter(id) {
  const key = String(id || '').trim()
  const hit = listCharacters().find((c) => c.id === key)
  if (!hit) fail(`没有这个角色：${key}（现有：${characterIds().join(' / ') || '无'}）`)
  return hit
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/**
 * 加一个角色：不覆盖任何已有文件。
 * input: { id, name, alias?, title?, card?, memory?, cwd? }
 * - 卡文件/记忆文件已存在 → 报错（要改请用户自己改，插件不代写）。
 * - 名册里已有同 id → 报错。
 */
export function addCharacter(input = {}) {
  const id = String(input.id || '').trim()
  if (!ID_RE.test(id)) fail(`角色 id 不合法：${id}`)
  if (characterIds().includes(id)) fail(`已经有这个角色：${id}（不覆盖）`)
  const name = String(input.name || '').trim()
  if (!name) fail('角色 name 不能为空')
  const cardRel = String(input.cardRel || `cards/${id}.desk.md`)
  const memoryRel = String(input.memoryRel || `memory/${id}.json`)
  const cardPath = inside(SOUL_DIR, cardRel, 'card')
  const memoryPath = inside(SOUL_DIR, memoryRel, 'memory')
  if (fs.existsSync(cardPath)) fail(`卡文件已存在，不覆盖：${path.relative(SOUL_DIR, cardPath)}`)
  if (fs.existsSync(memoryPath)) fail(`记忆文件已存在，不覆盖：${path.relative(SOUL_DIR, memoryPath)}`)

  const raw = readJson(MANIFEST) || { version: 1 }
  const rows = Array.isArray(raw.characters) ? raw.characters.slice() : []
  const row = { id, name, alias: String(input.alias || '').trim(), title: String(input.title || '').trim() || `${name}${DEFAULTS.titleSuffix}`, cards: { desk: cardRel, social: cardRel }, memory: memoryRel, cwd: String(input.cwd || '').trim() }
  const all = [...rows, row]
  // 先写数据文件（新建，绝不覆盖），再写名册；名册失败就把新文件收回来。
  const created = []
  try {
    if (typeof input.card === 'string' && input.card.trim()) {
      fs.mkdirSync(path.dirname(cardPath), { recursive: true })
      fs.writeFileSync(cardPath, input.card, { encoding: 'utf8', flag: 'wx' })
      created.push(cardPath)
    } else {
      fs.mkdirSync(path.dirname(cardPath), { recursive: true })
      fs.writeFileSync(cardPath, DEFAULTS.card(name), { encoding: 'utf8', flag: 'wx' })
      created.push(cardPath)
    }
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true })
    fs.writeFileSync(memoryPath, JSON.stringify(input.memory || DEFAULTS.memory(), null, 2), { encoding: 'utf8', flag: 'wx' })
    created.push(memoryPath)
    writeAtomic(MANIFEST, `${JSON.stringify({ version: 1, ...raw, characters: all }, null, 2)}\n`)
  } catch (error) {
    for (const file of created) { try { fs.rmSync(file, { force: true }) } catch { /* 尽力回滚 */ } }
    throw error
  }
  cache = { mtimeMs: -1, list: [] }
  return getCharacter(id)
}
