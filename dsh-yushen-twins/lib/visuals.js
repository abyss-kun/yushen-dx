// 鱼神 · Copyright (c) 2026 用户. All rights reserved.
// 视觉登记表 → 注入人格的一小段「能看到的图」说明（只读，不写注册表）。
//
// ⚠ 来源说明：2026-10-25 03:22 仓库被清空，原始 lib/visuals.js 随之后丢失。
// 本文件是**按 registry.json 现有结构重建的替代实现**，只陈述登记表里确实存在的条目和 status，
// 不推断「已上线」「可动」「定稿」；素材是否可对外使用仍以注册表 status 和老板确认为准。
//
// 约定与 lib/soul.js 一致：读不到就返回空串，绝不因为素材缺失挡住人格注入。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const VISUAL_DIR = process.env.YUSHEN_VISUAL_DIR || path.join(HOME, 'dayu', 'visuals')
const REGISTRY = path.join(VISUAL_DIR, 'registry.json')
const MAX_CHARS = 1600

let cache = null
let cacheMtime = 0

export function readRegistry() {
  try {
    const st = fs.statSync(REGISTRY)
    if (cache && st.mtimeMs === cacheMtime) return cache
    let text = fs.readFileSync(REGISTRY, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const raw = JSON.parse(text)
    if (!Array.isArray(raw?.roles)) return null
    cache = raw
    cacheMtime = st.mtimeMs
    return raw
  } catch {
    return null
  }
}

/** 拼成一小段可注入的文本；没有登记表或没有条目时返回空串。 */
export function buildPublicVisualBlock() {
  const reg = readRegistry()
  if (!reg) return ''
  const lines = []
  for (const role of reg.roles) {
    if (!role || !role.key) continue
    const variants = Array.isArray(role.variants) ? role.variants : []
    const usable = variants.filter((v) => v && v.id)
    if (!usable.length) continue
    const items = usable.slice(0, 6).map((v) => `${v.id}（${v.status || '未标状态'}）`).join('、')
    const more = usable.length > 6 ? ` 等 ${usable.length} 项` : ''
    lines.push(`- ${role.name || role.key}：${items}${more}`)
  }
  if (!lines.length) return ''
  const head = '## 能看到的图（登记表·静态素材）'
  const tail = '说明：图在 ~/.dsh/dayu/visuals；这些都是静态素材，不等于可动模型或运行时已上线；status 是草案/待修的，不能当定稿用。'
  const text = [head, ...lines, tail].join('\n')
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text
}
