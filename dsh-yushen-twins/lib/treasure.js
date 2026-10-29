// 分享：从她自己的宝藏里挑一张，给你看。
//
// 图片在本地（默认 D:\角色的宝藏），不走桥；挑图、看图都在本地。
// 发到 QQ 才需要桥（QQ 登录在桥那边）——这一步单独算。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { treasureDir } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const TREASURE_ROOT = treasureDir()

function indexFile(root = TREASURE_ROOT) { return path.join(root, 'images', 'images.jsonl') }

export function loadTreasure(root = TREASURE_ROOT) {
  let lines = []
  try { lines = fs.readFileSync(indexFile(root), 'utf8').split(/\r?\n/) } catch { return [] }
  const items = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line)
      items.push({
        id: r.id || r.hash,
        title: String(r.title || '').slice(0, 60),
        category: String(r.category || '').slice(0, 20),
        tags: Array.isArray(r.tags) ? r.tags.slice(0, 8) : [],
        file: String(r.file || ''),
        created: r.created || '',
      })
    } catch { /* 坏行跳过 */ }
  }
  return items
}

/** 按她的话挑一张（标题/分类/标签命中都算）。 */
export function pickTreasure(query = '', { limit = 3, root = TREASURE_ROOT } = {}) {
  const items = loadTreasure(root)
  const q = String(query || '').trim()
  if (!items.length) return { ok: false, reason: '宝藏库还没东西（或路径不对）', items: [] }
  const scored = items.map((it) => {
    const hay = `${it.title} ${it.category} ${it.tags.join(' ')}`
    const score = q ? (hay.includes(q) ? 3 : q.split('').filter((ch) => hay.includes(ch)).length) : 0
    return { ...it, score }
  })
  const picked = scored.filter((x) => (q ? x.score > 0 : true)).sort((a, b) => b.score - a.score || String(b.created).localeCompare(String(a.created))).slice(0, Math.max(1, limit))
  return { ok: true, query: q, total: items.length, items: picked }
}

/** 分享时的一句话（她自己说，不是模板；这里只给素材）。 */
export function shareMaterial(item) {
  if (!item) return null
  const exists = item.file && fs.existsSync(item.file)
  return { title: item.title, category: item.category, tags: item.tags, file: item.file, exists, hint: exists ? '文件在本地，可以直接给她看；发到 QQ 要走桥' : '文件不在了，别硬发' }
}
