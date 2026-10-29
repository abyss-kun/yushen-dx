import { characterIds } from './characters.js'
// 移动端网关：配对与设备令牌只存本机，不复用 DSH 管理令牌。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'mobile-devices.json')
const CODE_TTL = 5 * 60 * 1000
// 角色从名册读（2026-10-27）：接入第 4 个人自动有效
function roleList() { try { return characterIds() } catch { return [] } }

function read() {
  try {
    const value = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return value && typeof value === 'object' ? value : { pairing: null, devices: [] }
  } catch { return { pairing: null, devices: [] } }
}
function save(value) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = `${FILE}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, FILE)
}
function hash(token) { return crypto.createHash('sha256').update(token).digest('hex') }
function code() { return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0') }
function clean(value, max = 120) { return String(value ?? '').trim().slice(0, max) }

export function createMobileGateway() {
  return {
    roles: roleList(),
    issuePairing() {
      const state = read()
      const pairing = { code: code(), expiresAt: Date.now() + CODE_TTL }
      save({ ...state, pairing })
      return { code: pairing.code, expiresAt: new Date(pairing.expiresAt).toISOString() }
    },
    pair(input = {}) {
      const state = read()
      const pairing = state.pairing
      if (!pairing || pairing.expiresAt <= Date.now() || clean(input.code, 6) !== pairing.code) throw new Error('配对码无效或已过期')
      const token = crypto.randomBytes(32).toString('base64url')
      const device = { id: crypto.randomUUID(), name: clean(input.name, 80) || '安卓手机', createdAt: new Date().toISOString(), tokenHash: hash(token) }
      save({ pairing: null, devices: [...(Array.isArray(state.devices) ? state.devices : []), device] })
      return { deviceId: device.id, deviceName: device.name, token }
    },
    authenticate(token) {
      const raw = clean(token, 300)
      if (!raw) return null
      const state = read()
      const found = (state.devices || []).find((device) => crypto.timingSafeEqual(Buffer.from(device.tokenHash), Buffer.from(hash(raw))))
      return found ? { id: found.id, name: found.name } : null
    },
    revoke(deviceId) {
      const state = read()
      const devices = (state.devices || []).filter((device) => device.id !== clean(deviceId, 80))
      save({ ...state, devices })
      return { ok: true, revoked: devices.length !== (state.devices || []).length }
    },
    listDevices() { return (read().devices || []).map(({ tokenHash, ...device }) => device) },
    validateRole(role) { if (!roleList().includes(clean(role, 20))) throw new Error('未知角色') ; return clean(role, 20) },
  }
}

export const MOBILE_CODE_TTL_MS = CODE_TTL
