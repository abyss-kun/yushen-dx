/* 标签
 * id: lib-inject-pages
 * kind: module
 * summary: 读「注入书」页面（pages/注入/*.md）：带元数据头的静态正文段，注入时按 key 取；读不到返回 null 让调用方回落。
 * audience: 注入拼装（brief.js / soul.js）、新装的角色、维护者
 * owner: 框架；页面正文归写它的人（每个页面头里自己写着 owner）
 * mutable: 可改；缺页必须回落（调用方回落到代码字面量，注入不许少段）
 * usage: loadPage('brief:safety') → {ok,key,meta,body}；测试可用 setPagesDir/resetPagesCache
 * off: 没有开关——删掉 pages/注入/ 下的页面就等于全部回落到代码里的字面量（注入不会少段）
 * tags: 注入, 注入书, 页面, 静态段, 回落
 * created: 2026-11-11 19:10:00
 * changed: 2026-11-11 19:28:39
 * author: 大鱼·主代理（注入书这一步）
 */
// 改｜2026-11-11 19:16｜大鱼·主代理（注入书）｜授权：主人（2026-11-11 19:0x：「做」注入结构）｜lib/inject-pages.js:1-91｜新增：读 pages/注入/*.md 的页面加载器（loadPage/setPagesDir/resetPagesCache），读不到返回 null 让调用方回落｜为什么：把注入正文从代码字面量搬进页面，改文案不用改代码；缺页必须回落，不然装上别人的机器会少一段｜验证：node scripts/test-inject-pages.mjs 4/4；node scripts/regression.mjs 295 通过（仅本条留痕红）｜可改：可改；页面缺失时必须回落、不许抛
/* 内部：页面加载器（2026-11-11 19:16）
 * authority: 主人（2026-11-11 19:0x：「做」——注入结构第二步：把静态正文从代码搬到文件）
 * why: 静态段一直硬编码在 brief.js / soul.js 里，改一句话要改代码、也看不出"谁写的、谁能改"；搬到页面文件后，一眼能看到元数据和正文。
 * result: loadPage('brief:safety') → {ok, key, meta, body}；页面缺失返回 null（调用方必须回落到代码里的字面量，注入不许因缺页而少一段）。
 * mutable: 可改（页面正文就是注入原文，改它等于改她读到的话）
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 约定（和 docs/说明格式.md 同一套字段）：
//   ---
//   key: brief:safety      ← 段协议里的 key，和 inject-map 对得上
//   class: 身份 / 记忆 / 摘出去 / 即时
//   take: 全带 / 只带变化 / 召回
//   life: 不变 / 慢 / 会淡 / 分钟
//   owner: 谁能改
//   usage: 这段出现在哪、给谁看
//   off: 怎么关
//   ---
//   正文（注入原文，逐字节）
//
// 边界：只读、无副作用；页面缺失或格式坏 → 返回 null，**绝不抛**。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'pages', '注入')
const META_KEYS = Object.freeze(['key', 'class', 'take', 'life', 'owner', 'usage', 'off'])

// 2026-11-11：测试要能"假装这些页面不存在"来验回落（改名真目录太危险），所以留一个只在测试里用的开关。
let dirOverride = null
export function pagesDir() { return dirOverride || DIR }
/** 测试专用：把页面目录指到别处（传 null 恢复）。生产不调。 */
export function setPagesDir(dir) { dirOverride = dir ? String(dir) : null; cache = null }

let cache = null

function parsePage(text) {
  const s = String(text || '')
  if (!s.startsWith('---')) return null
  const end = s.indexOf('\n---', 3)
  if (end < 0) return null
  const head = s.slice(3, end).replace(/^\r?\n/, '')
  const bodyRaw = s.slice(end + 4).replace(/^(\r?\n)/, '')
  const meta = {}
  for (const line of head.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_一-龥]+)\s*:\s*(.*)$/)
    if (m) meta[m[1]] = m[2].trim()
  }
  const body = bodyRaw.replace(/\r\n/g, '\n').replace(/\n$/, '')
  return { meta, body }
}

function loadAll() {
  if (cache) return cache
  const map = new Map()
  const dir = pagesDir()
  let names = []
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.md')) } catch { names = [] }
  for (const name of names) {
    try {
      const parsed = parsePage(fs.readFileSync(path.join(dir, name), 'utf8'))
      if (!parsed) continue
      const key = String(parsed.meta.key || '').trim()
      if (!key) continue
      map.set(key, { ok: true, key, file: name, meta: parsed.meta, body: parsed.body })
    } catch { /* 坏一页不影响别的页 */ }
  }
  cache = map
  return map
}

/** 丢掉缓存（测试用；生产不需要）。 */
export function resetPagesCache() { cache = null }

/**
 * 按 key 取一页。
 * @returns {{ok:true, key:string, file:string, meta:object, body:string}|null} 读不到就 null（调用方回落）
 */
export function loadPage(key) {
  const k = String(key || '').trim()
  if (!k) return null
  return loadAll().get(k) || null
}

/** 页面清单（诊断/测试用）。 */
export function listPages() {
  return [...loadAll().values()].map((p) => ({ key: p.key, file: p.file, meta: p.meta, chars: p.body.length }))
}

/** 元数据字段是否齐全（测试用；生产不关心）。 */
export function missingMeta(key) {
  const p = loadPage(key)
  if (!p) return [...META_KEYS]
  return META_KEYS.filter((k) => !String(p.meta[k] || '').trim())
}
