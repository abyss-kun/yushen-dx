// 鱼神 · Copyright (c) 2026 用户. All rights reserved.
// 桌宠仓库：入职分析拆出来的模型/动图 + pet.json。
// 只读本地；发布版不打包别人的素材。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readRegistry } from './intake.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const PETS_DIR = path.join(HOME, 'dayu', 'pets')

function readJson(file, fallback) {
  try {
    let text = fs.readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

export function readPet(id) {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(id || ''))) return null
  const dir = path.join(PETS_DIR, id)
  const manifest = readJson(path.join(dir, 'pet.json'), null)
  if (!manifest || typeof manifest !== 'object') return null
  return { ...manifest, id, dir }
}

export function listPets() {
  let names = []
  try {
    names = fs.readdirSync(PETS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
  return names.map(readPet).filter(Boolean).map((pet) => ({
    id: pet.id,
    name: pet.name || pet.id,
    type: pet.type || 'image',
    actions: pet.actions || {},
    source: pet.source || {},
    assets: pet.assets || {},
    selector: String(pet.selector || ''),
    target: ['dayu', 'xiaoyu'].includes(pet.target) ? pet.target : 'dayu',
    bound: pet.bound === true,
    url: `/yushen-assets/pet?id=${encodeURIComponent(pet.id)}&asset=idle`,
  }))
}

/** 新用户第一次拖：把插件里内嵌的大图/动图拆出来，落成 pet.json。 */
export function extractEmbeddedPets(limit = 5) {
  let found = 0
  const registry = readRegistry()
  for (const plugin of (registry.plugins || []).slice(0, limit)) {
    const id = String(plugin.name || '').replace(/^@[^/]+\//, '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 60)
    if (!id || fs.existsSync(path.join(PETS_DIR, id, 'pet.json'))) continue
    for (const rel of ['lib/client.js', 'client.js', 'dist/client.js']) {
      const file = path.join(plugin.dir, rel)
      if (!fs.existsSync(file)) continue
      let text = ''
      try { text = fs.readFileSync(file, 'utf8') } catch { continue }
      const match = text.match(/data:image\/(webp|gif|png);base64,([A-Za-z0-9+/=]{100000,})/)
      if (!match) continue
      try {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
        const buf = Buffer.from(match[2], 'base64')
        const dir = path.join(PETS_DIR, id)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, `idle.${ext}`), buf)
        fs.writeFileSync(path.join(dir, 'pet.json'), `${JSON.stringify({
          id,
          name: String(plugin.name || id),
          type: ext,
          assets: { idle: `idle.${ext}` },
          bound: false,
          source: { plugin: plugin.name || id, license: plugin.license || '', rel: `${rel}#embedded` },
          extractedAt: new Date().toISOString(),
        }, null, 2)}\n`, 'utf8')
        found += 1
      } catch { /* 单只失败不影响别的 */ }
      break
    }
  }
  return found
}

export function bindPet(id, target) {
  if (!['dayu', 'xiaoyu'].includes(target)) throw new Error('target 只能是 dayu / xiaoyu')
  const pet = readPet(id)
  if (!pet) throw new Error('没有这只宠物')
  if (!pet.selector) throw new Error('这只宠物没有可绑定的 selector，先重新拆包')
  const file = path.join(pet.dir, 'pet.json')
  const raw = readJson(file, {})
  raw.bound = true
  raw.target = target
  fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
  return listPets().find((item) => item.id === id) || null
}

export function unbindPet(id) {
  const pet = readPet(id)
  if (!pet) throw new Error('没有这只宠物')
  const file = path.join(pet.dir, 'pet.json')
  const raw = readJson(file, {})
  raw.bound = false
  fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
  return listPets().find((item) => item.id === id) || null
}

export function petAssetFile(id, asset = 'idle') {  const pet = readPet(id)
  if (!pet) return ''
  const rel = pet.assets?.[asset] || pet.assets?.idle || ''
  if (!rel) return ''
  const base = path.resolve(pet.dir)
  const full = path.resolve(base, rel)
  if (!full.startsWith(base + path.sep)) return ''
  return fs.existsSync(full) ? full : ''
}

export function mimeOf(file) {
  const ext = path.extname(String(file || '')).toLowerCase()
  return ext === '.png' ? 'image/png'
    : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : 'application/octet-stream'
}
