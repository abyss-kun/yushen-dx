// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-card-check
 * kind: module
 * summary: 角色卡体检：只读判断缺哪几节、能不能直接用；不改卡。
 * tags: 角色卡, 体检, 只读
 * created: 2026-11-11 01:10:00
 * changed: 2026-11-11 01:10:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 老板（新建角色时）、她、新角色
 * owner: 框架；**卡的内容归角色本人**，这里只体检
 * mutable: 可改判据（只许更严）；不许在这里自动补卡
 * usage: checkCard(text) → {ok, missing[], sections}；只读
 * why: 接别人的卡时不知道能不能用；新卡又常缺节
 * result: 一份只读体检结果
 */
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
