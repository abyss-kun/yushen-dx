import { characterIds } from './characters.js'
// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// 鱼窝：两只鱼当前的形象 + 名字。
// 图只落用户目录（~/.dsh/dayu/avatars/<role>/idle.<ext>），永不进发布包。
// 没有用户图时回落到插件自带的默认形象（assets/avatars/<role>/idle.*）。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')

export const NEST_DIR = path.join(HOME, 'dayu', 'nest')
export const GUEST_DIR = path.join(NEST_DIR, 'guests')
export const USER_AVATARS = path.join(HOME, 'dayu', 'avatars')
export const DEFAULT_AVATARS = path.join(PKG, 'assets', 'avatars')
const INDEX = path.join(NEST_DIR, 'index.json')

// dragon 在鱼窝里只管形象和站位；她的人格卡与常驻会话在 soul/ 与 lib/residence.js，不写进 nest 档案。
// 角色从名册读（2026-10-27）；2026-10-30：出厂只住一个，但包里三张形象都要能取，所以把自带形象目录并进来。
export function roleList() {
  const ids = new Set()
  try { for (const id of characterIds()) ids.add(id) } catch { /* 名册读不到 */ }
  try {
    for (const e of fs.readdirSync(DEFAULT_AVATARS, { withFileTypes: true })) {
      if (e.isDirectory()) ids.add(e.name)
    }
  } catch { /* 没有自带形象目录 */ }
  return [...ids]
}
export const ROLE_LABEL = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
export const DEFAULT_NAMES = { dayu: '阿鲲', xiaoyu: '阿鲤', dragon: '照微' }

function assertRole(role) {
  if (!roleList().includes(role)) throw new Error(`role 只能是 ${roleList().join(' / ')}`)
}
export const MAX_BYTES = 8 * 1024 * 1024

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}
const EXTS = ['.webp', '.png', '.gif', '.jpg', '.jpeg']

function emptyIndex() {
  return {
    version: 1,
    slots: Object.fromEntries(roleList().map((role) => [role, {
      name: DEFAULT_NAMES[role], source: 'default', pos: { x: 0, y: 0 },
    }])),
    history: Object.fromEntries(roleList().map((role) => [role, []])), 
    guests: [],
  }
}

function clampPos(value) {
  const num = (v, fallback) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  return {
    x: Math.max(-1600, Math.min(1600, num(value?.x, 0))),
    y: Math.max(-1600, Math.min(1600, num(value?.y, 0))),
  }
}

function normalizeFrom(value) {
  if (!value || typeof value !== 'object') return null
  const out = {
    source: String(value.source || '').slice(0, 20),
    plugin: String(value.plugin || '').slice(0, 80),
    rel: String(value.rel || '').slice(0, 200),
    license: String(value.license || '').slice(0, 80),
  }
  return out.source ? out : null
}

function normalize(raw) {
  const base = emptyIndex()
  const out = { ...base }
  if (raw && typeof raw === 'object') {
    for (const role of roleList()) {
      const slot = raw.slots?.[role]
      if (slot && typeof slot === 'object') {
        out.slots[role] = {
          name: typeof slot.name === 'string' && slot.name.trim() ? slot.name.trim().slice(0, 24) : DEFAULT_NAMES[role],
          source: slot.source === 'user' ? 'user' : 'default',
          ext: typeof slot.ext === 'string' ? slot.ext : '',
          updatedAt: typeof slot.updatedAt === 'string' ? slot.updatedAt : '',
          pos: clampPos(slot.pos),
          from: normalizeFrom(slot.from),
        }
      }
      const hist = Array.isArray(raw.history?.[role]) ? raw.history[role] : []
      out.history[role] = hist.slice(0, 10)
    }
    const guests = Array.isArray(raw.guests) ? raw.guests : []
    out.guests = guests
      .filter((g) => g && typeof g.id === 'string' && /^g-[a-z0-9-]+$/i.test(g.id))
      .slice(0, 20)
      .map((g) => ({
        id: g.id,
        name: typeof g.name === 'string' && g.name.trim() ? g.name.trim().slice(0, 24) : '桌宠',
        ext: typeof g.ext === 'string' ? g.ext : '',
        from: normalizeFrom(g.from),
        createdAt: typeof g.createdAt === 'string' ? g.createdAt : '',
      }))
  }
  return out
}

export function readIndex() {
  try {
    let text = fs.readFileSync(INDEX, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    return normalize(JSON.parse(text))
  } catch {
    return emptyIndex()
  }
}

export function writeIndex(value) {
  fs.mkdirSync(NEST_DIR, { recursive: true })
  const text = JSON.stringify(value, null, 2)
  try { fs.copyFileSync(INDEX, INDEX + '.bak') } catch { /* 第一次没有旧文件 */ }
  const tmp = INDEX + '.tmp'
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, INDEX)
  return value
}

function firstFile(dir, exts = EXTS) {
  for (const ext of exts) {
    const file = path.join(dir, 'idle' + ext)
    try {
      if (fs.statSync(file).isFile()) return file
    } catch { /* 没有这个扩展名 */ }
  }
  return ''
}

export function userAvatarFile(role) {
  assertRole(role)
  return firstFile(path.join(USER_AVATARS, role))
}

export function defaultAvatarFile(role) {
  assertRole(role)
  return firstFile(path.join(DEFAULT_AVATARS, role))
}

/** 当前真正要出的图：用户图优先，没有就回落默认形象。 */
export function resolveAvatar(role) {
  return userAvatarFile(role) || defaultAvatarFile(role)
}

export function mimeOf(file) {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

function snapshotSlot(role, slot) {
  const user = userAvatarFile(role)
  const file = user || defaultAvatarFile(role)
  return {
    role,
    label: ROLE_LABEL[role],
    name: slot.name || DEFAULT_NAMES[role],
    source: user ? 'user' : 'default',
    ext: file ? path.extname(file).toLowerCase() : '',
    animated: Boolean(user || file) && /\.(webp|gif)$/i.test(file),
    pos: clampPos(slot.pos),
    from: slot.from || null,
    url: `/yushen-assets/avatar?who=${role}&v=${encodeURIComponent(slot.updatedAt || '0')}`,
  }
}

export function snapshot() {
  const idx = readIndex()
  return {
    ok: true,
    roles: roleList(),
    slots: Object.fromEntries(roleList().map((role) => [role, snapshotSlot(role, idx.slots[role])])),
    guests: idx.guests.map((g) => ({
      id: g.id,
      name: g.name,
      from: g.from,
      createdAt: g.createdAt,
      url: `/yushen-assets/guest?id=${encodeURIComponent(g.id)}`,
    })),
    maxBytes: MAX_BYTES,
  }
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([a-z0-9.+/-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || ''))
  if (!match) throw new Error('图的数据格式不对')
  const mime = match[1].toLowerCase()
  const ext = EXT_BY_MIME[mime]
  if (!ext) throw new Error('只收 png / jpg / webp / gif')
  const buf = Buffer.from(match[2], 'base64')
  if (!buf.length) throw new Error('图是空的')
  if (buf.length > MAX_BYTES) throw new Error('图太大，最多 8MB')
  return { mime, ext, buf }
}

function cleanName(name, role) {
  const text = String(name || '').trim().slice(0, 24)
  return text || DEFAULT_NAMES[role]
}

/** 收养：写用户图、记名字、旧的一条进历史。 */
export function adopt(role, name, dataUrl) {
  assertRole(role)
  const { ext, buf } = decodeDataUrl(dataUrl)
  return adoptBuffer(role, name, ext, buf, { source: 'upload' })
}

/** 从已入职插件的分析结果里收养（本地文件，不经过浏览器）。 */
export function adoptFile(role, name, filePath, meta = {}) {
  assertRole(role)
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (!EXT_BY_MIME[`image/${ext.slice(1)}`] && !['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    throw new Error('只收 png / jpg / webp / gif')
  }
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error('不是文件')
  if (stat.size > MAX_BYTES) throw new Error('图太大，最多 8MB')
  const buf = fs.readFileSync(filePath)
  return adoptBuffer(role, name, ext === '.jpeg' ? '.jpg' : ext, buf, {
    source: 'plugin',
    plugin: String(meta.plugin || ''),
    rel: String(meta.rel || ''),
    license: String(meta.license || ''),
  })
}

function adoptBuffer(role, name, ext, buf, from = {}) {
  const dir = path.join(USER_AVATARS, role)
  fs.mkdirSync(dir, { recursive: true })
  for (const old of EXTS) {
    try { fs.unlinkSync(path.join(dir, 'idle' + old)) } catch { /* 没这个文件 */ }
  }
  fs.writeFileSync(path.join(dir, 'idle' + ext), buf)

  const idx = readIndex()
  const before = idx.slots[role]
  idx.history[role] = [{
    name: before.name,
    source: before.source,
    ext: before.ext || '',
    at: before.updatedAt || '',
    from: before.from || null,
  }, ...idx.history[role]].slice(0, 10)
  idx.slots[role] = {
    name: cleanName(name, role),
    source: 'user',
    ext,
    updatedAt: new Date().toISOString(),
    pos: before.pos || { x: 0, y: 0 },
    from: normalizeFrom(from) || before.from || null,
  }
  writeIndex(idx)
  return snapshot()
}

function normalizeExt(ext) {
  const e = String(ext || '').toLowerCase()
  return e === '.jpeg' ? '.jpg' : e
}

function extFromMime(mime) {
  return EXT_BY_MIME[String(mime || '').toLowerCase().split(';')[0]] || ''
}

/** 收养一张已经拿到字节的图（给 URL / 本地路径用）。 */
export function adoptBytes(role, name, ext, buf, from = {}) {
  assertRole(role)
  const clean = normalizeExt(ext)
  if (!MIME_BY_EXT[clean]) throw new Error('只收 png / jpg / webp / gif')
  if (!buf?.length) throw new Error('图是空的')
  if (buf.length > MAX_BYTES) throw new Error('图太大，最多 8MB')
  return adoptBuffer(role, name, clean, buf, from)
}

/** 收一只“客人”：不占大鱼/小鱼的位置，单独进 guests。 */
export function adoptGuest(name, ext, buf, from = {}) {
  const clean = normalizeExt(ext)
  if (!MIME_BY_EXT[clean]) throw new Error('只收 png / jpg / webp / gif')
  if (!buf?.length) throw new Error('图是空的')
  if (buf.length > MAX_BYTES) throw new Error('图太大，最多 8MB')
  fs.mkdirSync(GUEST_DIR, { recursive: true })
  const id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  fs.writeFileSync(path.join(GUEST_DIR, id + clean), buf)
  const idx = readIndex()
  idx.guests = [{
    id,
    name: String(name || '桌宠').trim().slice(0, 24) || '桌宠',
    ext: clean,
    from: normalizeFrom(from),
    createdAt: new Date().toISOString(),
  }, ...idx.guests].slice(0, 20)
  writeIndex(idx)
  return snapshot()
}

export function guestFile(id) {
  if (!/^g-[a-z0-9-]+$/i.test(String(id || ''))) return ''
  const guest = readIndex().guests.find((g) => g.id === id)
  return guest ? path.join(GUEST_DIR, guest.id + guest.ext) : ''
}

export function removeGuest(id) {
  const idx = readIndex()
  const guest = idx.guests.find((g) => g.id === id)
  if (guest) {
    try { fs.unlinkSync(path.join(GUEST_DIR, guest.id + guest.ext)) } catch { /* 文件可能已不在 */ }
    idx.guests = idx.guests.filter((g) => g.id !== id)
    writeIndex(idx)
  }
  return snapshot()
}

/** 从 URL / dataURL / 本地路径收一张图；role 为空就收成客人。 */
export async function adoptUrl(role, name, src, from = {}) {
  // dataURL 分支也必须校验；未知角色不能绕过 adoptBytes 写出槽位目录。
  if (role) assertRole(role)
  const raw = String(src || '').trim()
  if (!raw) throw new Error('没有图地址')
  let buf
  let ext = ''
  if (/^data:/i.test(raw)) {
    const d = decodeDataUrl(raw)
    return role ? adoptBuffer(role, name, d.ext, d.buf, from) : adoptGuest(name, d.ext, d.buf, from)
  }
  if (/^https?:\/\//i.test(raw)) {
    const res = await fetch(raw, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`下载图失败：HTTP ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
    ext = extFromMime(res.headers.get('content-type')) || normalizeExt(path.extname(new URL(raw).pathname))
  } else {
    const file = raw.replace(/^file:\/\//i, '')
    buf = fs.readFileSync(file)
    ext = normalizeExt(path.extname(file))
  }
  if (!MIME_BY_EXT[normalizeExt(ext)]) throw new Error('只收 png / jpg / webp / gif')
  return role ? adoptBytes(role, name, ext, buf, from) : adoptGuest(name, ext, buf, from)
}

/** 挪位置：记住她站在窝里的哪个点（相对默认站位的像素偏移）。 */
export function move(role, x, y) {
  assertRole(role)
  const idx = readIndex()
  idx.slots[role] = { ...idx.slots[role], pos: clampPos({ x, y }) }
  writeIndex(idx)
  return snapshot()
}

export function rename(role, name) {
  assertRole(role)
  const idx = readIndex()
  idx.slots[role] = { ...idx.slots[role], name: cleanName(name, role) }
  writeIndex(idx)
  return snapshot()
}

/** 送走：删用户图，回落到自带形象；名字跟着回默认。 */
export function restore(role) {
  assertRole(role)
  const dir = path.join(USER_AVATARS, role)
  for (const ext of EXTS) {
    try { fs.unlinkSync(path.join(dir, 'idle' + ext)) } catch { /* 没这个文件 */ }
  }
  const idx = readIndex()
  const before = idx.slots[role]
  if (before.source === 'user') {
    idx.history[role] = [{
      name: before.name,
      source: before.source,
      ext: before.ext || '',
      at: before.updatedAt || '',
    }, ...idx.history[role]].slice(0, 10)
  }
  idx.slots[role] = { name: DEFAULT_NAMES[role], source: 'default', ext: '', updatedAt: new Date().toISOString(), pos: { x: 0, y: 0 } }
  writeIndex(idx)
  return snapshot()
}
