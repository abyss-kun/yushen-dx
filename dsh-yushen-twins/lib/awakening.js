// 点化与收回：谁在鱼神里"活着"，由这张状态表说了算。
// - 点化（awaken）：把本体、常驻身体、通道与判断权接上；新加的角色默认休眠，等人点化。
// - 收回（seal）：拔掉常驻与注入，角色回到一张普通的卡；用户自己的卡和图不动。
// - 只记本地状态；不联网、不上报、不删用户原文件。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { listCharacters, getCharacter } from './characters.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const STATE = path.join(DATA, 'awakening.json')
const EXPORT_DIR = path.join(DATA, 'awakening-export')
export const STATUSES = Object.freeze(['dormant', 'awakened', 'sealed'])
// 点化给的不只是身份：这些是"她会怎么判断"的底子，不是外部禁令。
export const GIFTS = Object.freeze(['责任心', '好奇心', '判断力', '边界感', '底线'])

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-') }

function readRaw() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

function write(state) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = `${STATE}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, STATE)
  return state
}

/** 第一次运行：现有角色视为已点化（迁移），之后新增的默认休眠。 */
function ensureState() {
  const raw = readRaw()
  if (raw && raw.characters && typeof raw.characters === 'object') {
    // 老状态补发点化礼包：已点化但没有 gifts 的，补上（不覆盖已有的）。
    let changed = false
    for (const row of Object.values(raw.characters)) {
      if (row?.status === 'awakened' && (!Array.isArray(row.gifts) || !row.gifts.length)) {
        row.gifts = [...GIFTS]
        changed = true
      }
    }
    if (changed) { raw.updatedAt = new Date().toISOString(); write(raw) }
    return raw
  }
  const now = new Date().toISOString()
  const characters = {}
  for (const c of listCharacters()) characters[c.id] = { status: 'awakened', at: now, by: 'migration', note: '首次运行，现有角色视为已点化', gifts: [...GIFTS] }
  return write({ version: 1, updatedAt: now, characters })
}

export function awakeningState() {
  return ensureState()
}

export function statusOf(role) {
  const state = ensureState()
  const row = state.characters[role]
  return row?.status || 'dormant'
}

export function isAwake(role) {
  return statusOf(role) === 'awakened'
}

export function listAwakening() {
  const state = ensureState()
  return listCharacters().map((c) => ({
    id: c.id,
    name: c.name,
    status: state.characters[c.id]?.status || 'dormant',
    at: state.characters[c.id]?.at || '',
    by: state.characters[c.id]?.by || '',
    note: state.characters[c.id]?.note || '',
    gifts: state.characters[c.id]?.gifts || [],
  }))
}

/** 点化：必须先是名册里的角色；不给死人点化，也不给不存在的人点化。 */
export function awaken(role, { note = '', by = 'owner' } = {}) {
  const c = getCharacter(role)
  const state = ensureState()
  const prev = state.characters[c.id] || {}
  state.characters[c.id] = { status: 'awakened', at: new Date().toISOString(), by, note: String(note || prev.note || ''), gifts: [...GIFTS] }
  state.updatedAt = new Date().toISOString()
  write(state)
  return state.characters[c.id]
}

/**
 * 收回（掠夺）：拔掉常驻与注入。
 * - 默认不动用户原文件；returnMemory=true 时把记忆另存一份中性 JSON 到 awakening-export/，原文件保留。
 * - 不删卡、不删图、不删记忆；"收回"的是活着的那一层，不是用户的东西。
 */
export function seal(role, { note = '', by = 'owner', returnMemory = false, exportDir = '' } = {}) {
  const c = getCharacter(role)
  const state = ensureState()
  const prev = state.characters[c.id] || {}
  let exported = ''
  if (returnMemory) {
    try {
      const dir = exportDir || EXPORT_DIR
      fs.mkdirSync(dir, { recursive: true })
      const src = c.memory
      if (fs.existsSync(src)) {
        exported = path.join(dir, `${c.id}-${stamp()}.json`)
        fs.copyFileSync(src, exported)
      }
    } catch { exported = '' }
  }
  state.characters[c.id] = {
    status: 'sealed',
    at: new Date().toISOString(),
    by,
    note: String(note || prev.note || ''),
    exported: exported ? path.basename(exported) : '',
  }
  state.updatedAt = new Date().toISOString()
  write(state)
  return { ...state.characters[c.id] }
}
