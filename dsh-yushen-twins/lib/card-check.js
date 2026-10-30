// 角色卡体检：只读判断，不改卡。
// 用途：新建角色后提示“还缺哪几节没填”；接入别人的卡时判断能不能直接用。
import { CARD_SECTIONS } from './card-template.js'

/** 解析卡头 front-matter（只认简单的 key: value 与一层缩进）。 */
export function parseCardMeta(text = '') {
  const s = String(text || '')
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(s)
  if (!m) return {}
  const out = {}
  let parent = ''
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const indent = /^\s+/.test(line)
    const kv = /^\s*([\w-]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    const [, key, value] = kv
    if (!indent) {
      parent = key
      out[key] = value === '' ? {} : value.trim()
    } else if (parent && typeof out[parent] === 'object') {
      out[parent][key] = value.trim()
    }
  }
  return out
}

/**
 * 卡体检。
 * @returns {{ ok: boolean, hasMeta: boolean, sections: Array<{title: string, filled: number}>, missing: string[] }}
 */
export function checkCard(text = '') {
  const s = String(text || '')
  const meta = parseCardMeta(s)
  const body = s.replace(/^---[\s\S]*?---/, '')
  const sections = []
  const missing = []
  for (const title of CARD_SECTIONS) {
    const re = new RegExp(`^##\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm')
    const at = body.search(re)
    if (at < 0) { missing.push(title); sections.push({ title, filled: 0 }); continue }
    const rest = body.slice(at).split(/\r?\n/).slice(1).join('\n')
    const block = rest.split(/^##\s/m)[0] || ''
    const filled = block.split(/\r?\n/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line && !/^[^：:]+[：:]$/.test(line) && !line.endsWith('：') && !line.endsWith(':'))
      .length
    sections.push({ title, filled })
  }
  const ok = Object.keys(meta).length > 0 && missing.length === 0
  return { ok, hasMeta: Object.keys(meta).length > 0, sections, missing }
}
