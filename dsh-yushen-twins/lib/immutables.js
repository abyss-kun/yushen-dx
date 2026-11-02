// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 不可改清单的**事前**拦截（2026-11-01 补，安全闸门第 2 条）。
//
// 原来只有事后审计：`note-work` 记账时才拦、`check-provenance` 跑的时候才报——
// 文件**已经改过了**，靠人自己撤回（2026-10-31 就这么恢复过一张卡）。
// 这里给出一条能在**写之前**问一句的路：`assertWritable(file, { by })`。
//
// 规矩（清单原文照抄，不改）：
//   · 角色卡只归卡的主人自己：大鱼改大鱼的、小鱼改小鱼的、照微改照微的；
//   · 别人（另一个角色、员工、任何会话）一律不许碰，连一个字都不行；
//   · 老板本人要改另说 —— `by: '主人'` / `by: 'owner'` 放行。
//
// 边界（别读成它能挡一切）：它是个**库**，谁写卡谁得先调它；
// 会话里直接 `write` 文件不经过插件，这条路它挡不住——那需要宿主侧的 pre-write 钩子。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIST = path.join(ROOT, '不可改清单.json')

let cache = { mtimeMs: -1, items: {} }

export function listImmutables() {
  try {
    const st = fs.statSync(LIST)
    if (cache.mtimeMs === st.mtimeMs) return cache.items
    const raw = JSON.parse(fs.readFileSync(LIST, 'utf8'))
    cache = { mtimeMs: st.mtimeMs, items: raw.items && typeof raw.items === 'object' ? raw.items : {} }
    return cache.items
  } catch { return {} }
}

const norm = (p) => String(p || '').replace(/\\/g, '/')

/** 卡的主人：`.../soul/cards/<role>.<scene>.md` → role；不是卡就返回 ''。 */
export function cardOwner(filePath) {
  const m = norm(filePath).match(/soul\/cards\/([A-Za-z0-9_-]+)\.[A-Za-z0-9]+\.md$/)
  return m ? m[1] : ''
}

/**
 * 这个路径在不在清单里。
 * @returns {{protected:boolean, hit:string, why:string, ownerRole:string}}
 */
export function matchImmutable(filePath) {
  const file = norm(filePath)
  const items = listImmutables()
  // 与 note-work 同一套匹配：相等 / 后缀 / 片段包含；`#` 后面是段名，比对时去掉。
  // 2026-11-01 补：清单里写的是**这台机器**的绝对路径，换个家目录（测试、别人的机器）就匹配不上。
  // 所以再按「/dayu/ 之后的尾巴」比一次——`soul/cards/dayu.desk.md` 这种形状到哪都成立。
  const hit = Object.keys(items).find((raw) => {
    const key = norm(raw.split('#')[0])
    if (file === key || file.endsWith(key) || key.includes(file)) return true
    const tail = key.includes('/dayu/') ? key.slice(key.indexOf('/dayu/') + '/dayu/'.length) : ''
    return Boolean(tail) && (file.endsWith(tail) || file.includes(`/${tail}`))
  }) || ''
  return { protected: Boolean(hit), hit, why: hit ? String(items[hit] || '') : '', ownerRole: cardOwner(file) }
}

/**
 * 写之前问一句：能不能写。
 * 不写盘、不发通知；纯判断，抛错表示拒。
 * @param {string} filePath 目标文件（绝对或相对都行）
 * @param {{by?:string}} opts by = 谁在写（角色 id 或 '主人'/'owner'）
 * @returns {{ok:true, hit:string}} 或抛错
 */
export function assertWritable(filePath, { by = '' } = {}) {
  const m = matchImmutable(filePath)
  if (!m.protected) return { ok: true, hit: '' }
  const who = String(by || '')
  const isOwner = /^(主人|owner)$/i.test(who)
  if (isOwner) return { ok: true, hit: m.hit }
  // 卡：只有本人能写
  if (m.ownerRole) {
    if (who && who === m.ownerRole) return { ok: true, hit: m.hit }
    const owner = m.ownerRole
    throw new Error(`不许写：${norm(filePath)} 是${owner}的卡（清单：${m.why}）。`
      + `只有${owner}本人能写；老板本人要改请用 by=主人。`)
  }
  // 其他不可改项：一律要主人
  throw new Error(`不许写：${norm(filePath)} 在不可改清单里（${m.why}）。只有老板本人开口（by=主人）才能动。`)
}
