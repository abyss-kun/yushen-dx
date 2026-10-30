// 装之前先认人：这台机器上已经有哪些角色。
// 只读，不改任何文件。判定按可靠性排序：名册 → 卡目录 → 旧版 persona → 别家插件。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { parseCardMeta, checkCard } from './card-check.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const DATA = path.join(HOME, 'dayu')

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

function listDir(dir, filter) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => (d.isFile() && filter(d.name)))
      .map((d) => path.join(dir, d.name))
  } catch { return [] }
}

/**
 * 认本机已有的角色。
 * @param {{ dataDir?: string, profilesDir?: string, extraDirs?: string[] }} [opts]
 * @returns {{ roles: Array<object>, checked: object }}
 */
export function detectRoles({ dataDir = DATA, profilesDir = path.join(HOME, 'profiles'), extraDirs = [] } = {}) {
  const roles = []
  const seen = new Set()
  const add = (row) => {
    // 同一个 id 只留一条（名册优先，其次卡，最后 persona/资产）
    const key = String(row.id || '').toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    roles.push(row)
  }
  const checked = { manifest: false, cardsDir: 0, persona: false, plugins: 0 }

  // 1) 名册：characters.json 说了算
  const manifest = readJson(path.join(dataDir, 'characters.json'))
  const rows = Array.isArray(manifest?.characters) ? manifest.characters : []
  if (rows.length) checked.manifest = true
  for (const row of rows) {
    const id = String(row?.id || '').trim()
    if (!id) continue
    const rel = row?.cards?.desk || row?.cards?.social || ''
    const cardPath = rel ? path.resolve(path.join(dataDir, 'soul'), rel) : ''
    let card = null
    if (cardPath && fs.existsSync(cardPath)) {
      try { card = fs.readFileSync(cardPath, 'utf8') } catch { card = null }
    }
    add({
      id,
      name: String(row?.name || card && parseCardMeta(card).name || id),
      kind: 'manifest',
      source: 'characters.json',
      path: cardPath || '',
      sha: card ? sha(card) : '',
      hasCard: Boolean(card),
      sections: card && parseCardMeta(card).name ? checkCard(card).missing.length === 0 : null,
    })
  }

  // 2) 卡目录：soul/cards/*.md（没有名册时，这里就是唯一线索）
  for (const file of listDir(path.join(dataDir, 'soul', 'cards'), (n) => n.endsWith('.md'))) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    checked.cardsDir += 1
    const meta = parseCardMeta(text)
    const base = path.basename(file).replace(/\.(desk|social)\.md$/i, '').replace(/\.md$/i, '')
    add({
      id: String(meta.id || base),
      name: String(meta.name || base),
      alias: String(meta.alias || ''),
      kind: 'card',
      source: 'soul/cards',
      path: file,
      sha: sha(text),
      hasCard: true,
      sections: meta.name ? checkCard(text).missing.length === 0 : null,
    })
  }

  // 3) 旧版 persona.json：scenes / memory 里的键就是角色线索
  const persona = readJson(path.join(dataDir, 'soul', 'persona.json'))
  if (persona) {
    checked.persona = true
    const keys = new Set([...Object.keys(persona.memory || {}), ...Object.keys(persona.scenes || {})])
    for (const raw of keys) {
      const id = /^(desk|social)$/.test(raw) ? 'dayu' : /Xiaoyu$/i.test(raw) ? 'xiaoyu' : /dragon/i.test(raw) ? 'dragon' : raw
      add({
        id,
        name: String(persona?.[id]?.callName || persona?.[id]?.name || id),
        kind: 'persona',
        source: 'soul/persona.json',
        path: path.join(dataDir, 'soul', 'persona.json'),
        sha: '',
        hasCard: false,
        sections: false,
      })
    }
  }

  // 4) 别家插件：roles/*.md、cards/*.md、persona*.json、assets/avatars/*
  const dirs = []
  try {
    for (const prof of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!prof.isDirectory()) continue
      const nm = path.join(profilesDir, prof.name, 'node_modules')
      let pkgs = []
      try { pkgs = fs.readdirSync(nm, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()) } catch { continue }
      for (const pkg of pkgs) {
        if (pkg.name.startsWith('.')) continue
        dirs.push(path.join(nm, pkg.name))
        // scoped 包（@scope/name）
        if (pkg.name.startsWith('@')) {
          try {
            for (const sub of fs.readdirSync(path.join(nm, pkg.name), { withFileTypes: true })) {
              if (sub.isDirectory()) dirs.push(path.join(nm, pkg.name, sub.name))
            }
          } catch { /* 忽略 */ }
        }
      }
    }
  } catch { /* 没有 profiles */ }
  dirs.push(...extraDirs)

  for (const dir of dirs) {
    try {
      checked.plugins += 1
      const name = path.basename(dir)
      if (name === 'dsh-yushen-twins') continue // 自己不算“别人家的角色”
      const look = (rel, ext) => listDir(path.join(dir, rel), (n) => n.endsWith(ext))
      for (const file of [...look('roles', '.md'), ...look('cards', '.md')]) {
        const text = fs.readFileSync(file, 'utf8')
        const meta = parseCardMeta(text)
        add({
          id: String(meta.id || path.basename(file, '.md')),
          name: String(meta.name || path.basename(file, '.md')),
          kind: 'plugin',
          source: `${name}/${path.relative(dir, file).split(path.sep).join('/')}`,
          path: file,
          sha: sha(text),
          hasCard: true,
          sections: checkCard(text).missing.length === 0,
        })
      }
      for (const file of look('.', 'persona.json')) {
        const doc = readJson(file)
        if (!doc) continue
        for (const id of Object.keys(doc.memory || {})) {
          add({ id, name: String(doc?.[id]?.callName || id), kind: 'plugin', source: `${name}/${path.basename(file)}`, path: file, sha: '', hasCard: false, sections: false })
        }
      }
      for (const sub of ['assets/avatars', 'assets/pet']) {
        const base = path.join(dir, sub)
        let names = []
        try { names = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { continue }
        for (const id of names) {
          add({ id, name: id, kind: 'plugin-asset', source: `${name}/${sub}/${id}`, path: path.join(base, id), sha: '', hasCard: false, sections: false })
        }
      }
    } catch { /* 单个插件坏了不影响别的 */ }
  }

  return { roles, checked }
}
