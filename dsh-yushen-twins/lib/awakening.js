// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
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
  for (const c of listCharacters()) characters[c.id] = hasLived(c)
    ? { status: 'awakened', at: now, by: 'migration', note: '首次运行，现有角色视为已点化', gifts: [...GIFTS] }
    // 2026-10-31 老板：出厂要能"只有一个小鱼"，而且**点化才活**。
    // 以前这段把名册里所有人都标成已点化，结果干净装一注入就"活了"，点化形同虚设。
    // 现在只有"有记忆的人"（老用户迁移）才算已点化；干净装一律 dormant，等主人点化。
    : { status: 'dormant', at: now, by: 'migration', note: '干净装机：等人点化', gifts: [] }
  return write({ version: 1, updatedAt: now, characters })
}

/** 这个人有没有"活过"：记忆里有事件/习惯/关系，才算老用户，迁移时视为已点化。 */
function hasLived(c) {
  try {
    const p = c?.memory || path.join(DATA, 'soul', 'memory', `${c?.id}.json`)
    const m = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
    return ['events', 'habits', 'dynamics'].some((k) => Array.isArray(m?.[k]) && m[k].length > 0)
  } catch { return false }
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
  // 2026-10-31 老板问：新装用户没有角色卡，点化会怎样——实测是**空壳点化**：
  // 状态改成 awakened，但 buildSceneText 因为没卡返回 ''，不报错、不提示，她还"看起来活着"。
  // 卡是本体，点化只负责"让它活"，不负责造它。没卡就明着拒，别给一个空壳。
  const cardPath = c?.cards?.desk
  const hasCard = (() => {
    try { return Boolean(cardPath) && fs.statSync(cardPath).size > 0 } catch { return false }
  })()
  if (!hasCard) {
    const e = new Error(`还没有角色卡：先选一张卡（三选一的白纸卡，或用你自己的），再点化 ${c?.name || role}`)
    e.code = 'NO_CARD'
    throw e
  }
  const state = ensureState()
  const prev = state.characters[c.id] || {}
  state.characters[c.id] = { status: 'awakened', at: new Date().toISOString(), by, note: String(note || prev.note || ''), gifts: [...GIFTS] }
  state.updatedAt = new Date().toISOString()
  write(state)
  return state.characters[c.id]
}

/** 这个人的契约签了没有：`~/.dsh/dayu/contract/契约.json` 里 personal[role].role_signed。 */
export function contractSigned(role, { home = HOME } = {}) {
  try {
    const p = path.join(home, 'dayu', 'contract', '契约.json')
    const j = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
    return Boolean(j?.personal?.[role]?.role_signed)
  } catch { return false }
}

/**
 * 创建即生效（2026-10-31 老板定：**不要再让用户点一次"点化"**）。
 *
 * 老板原话：「点化不是让用户点，而是创建了，取名了，契约了，就已经生效了」。
 * 所以向导最后一步做完（卡建好、名字定了、契约签了）就自动走到这里，用户不需要另外点。
 * 顺序不能倒：没有卡就是空壳（注入 0 字），没有契约就是"活着但不认规矩"——两种都拒，并说清缺哪一样。
 *
 * @returns {{ok:true,status:'awakened',role:string}|{ok:false,role:string,why:string,code:string}}
 */
export function finishCreation(role, { note = '创建完成，自动生效', by = 'owner', home = HOME } = {}) {
  const cardPath = (() => { try { return getCharacter(role)?.cards?.desk } catch { return '' } })()
  const hasCard = (() => { try { return Boolean(cardPath) && fs.statSync(cardPath).size > 0 } catch { return false } })()
  if (!hasCard) return { ok: false, role, code: 'NO_CARD', why: '还没有角色卡：先选一张卡（三选一的白纸卡，或用你自己的）' }
  if (!contractSigned(role, { home })) return { ok: false, role, code: 'NO_CONTRACT', why: '契约还没签：创建和契约要一起做完，她才算真的在' }
  try {
    const row = awaken(role, { note, by })
    return { ok: true, role, status: row.status }
  } catch (e) {
    return { ok: false, role, code: e?.code || 'AWAKEN_FAILED', why: String(e?.message || e) }
  }
}

/**
 * 收回（掠夺）：拔掉常驻与注入。
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
