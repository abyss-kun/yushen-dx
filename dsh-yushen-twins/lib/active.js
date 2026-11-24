// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-active
 * kind: module
 * summary: 活跃层：现在在聊什么 + 我正在做什么；每条带出处，做完要结算，不结算一天后提醒一次。
 * tags: 活跃层, 手头事, 出处, 结算
 * created: 2026-11-11 00:58:00
 * changed: 2026-11-11 00:58:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 她（醒来先看这个）、简报、维护者
 * owner: 框架；条目是她自己的事，清除要按她的结算，不许系统偷偷清
 * defaults: 不结算的条目一天后提醒一次；条目上限见实现
 * off: 不写活跃层就没有"手头在干嘛"，关了不影响记忆
 * mutable: 可改；两条规矩（带出处 / 做完结算）不许破
 * usage: addActive/readActive/finishActive → 增/查/结；每条带来源会话或群
 * why: 醒来只知道记忆里有什么，不知道手头正干着哪件事、哪个群还等她回
 * result: 一个小活跃层：跨群不串味（带出处），不结算会提醒
 */
// 活跃层：现在在聊什么 + 我正在做什么。
//
// 2026-10-29 从 dsh-onebot-hub 的「活跃层」学来的。它解决的是我们的一个老毛病：
// 醒过来只知道"记忆里有什么"，不知道"手头正干着哪件事、哪个群还在等我回"。
//
// 两条规矩（它的原话，我照抄）：
//   1. **每条都带出处**——A 群能看见 B 群在聊什么，但不会张冠李戴。
//   2. **做完要结算**——留一行摘要进长期记忆，或者直接删掉；
//      一直不结算的条目，一天后提醒一次。
import fs from 'node:fs'
import path from 'node:path'
import { dshHome } from './paths.js'

const MAX_ITEMS = 20
const STALE_HOURS = 24

function fileOf(role) {
  return path.join(dshHome(), 'dayu', 'runtime', role, '活跃.json')
}

export function readActive(role) {
  try {
    const arr = JSON.parse(fs.readFileSync(fileOf(role), 'utf8').replace(/^\uFEFF/, ''))
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function write(role, items) {
  const p = fileOf(role)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(items.slice(-MAX_ITEMS), null, 1), 'utf8')
  fs.renameSync(tmp, p)
}

/** 开一件"进行中"的事。source 写清楚在哪儿（群/私聊/工作台）。 */
export function begin(role, { text = '', source = '', kind = 'doing' } = {}) {
  const items = readActive(role)
  const item = {
    id: `a-${Date.now().toString(36)}`,
    text: String(text).slice(0, 160),
    source: String(source).slice(0, 60),
    kind,
    at: new Date().toISOString(),
    settled: false,
  }
  items.push(item)
  write(role, items)
  return item
}

/** 结算：留一行摘要（进记忆由调用方做），或者直接删。 */
export function settle(role, id, { summary = '' } = {}) {
  const items = readActive(role)
  const it = items.find((x) => x.id === id)
  if (!it) return { ok: false, reason: '没有这一条' }
  if (summary) {
    it.settled = true
    it.summary = String(summary).slice(0, 200)
  } else {
    const i = items.indexOf(it)
    items.splice(i, 1)
  }
  write(role, items)
  return { ok: true, item: it }
}

/** 简报里那一段：进行中的 + 超过一天没结算的（提醒一次）。 */
export function activeLine(role, { now = Date.now() } = {}) {
  const items = readActive(role).filter((x) => !x.settled)
  if (!items.length) return ''
  const stale = []
  const show = items.slice(-6).map((x) => {
    const ageH = (now - Date.parse(x.at)) / 3600000
    if (ageH > STALE_HOURS) stale.push(x)
    return `- [${x.source || '?'}] ${x.text}`
  }).join('\n')
  const head = `## 手头进行中的（${items.length} 条）`
  const tail = stale.length
    ? `\n**有 ${stale.length} 条挂了一天以上没结算**——要么做，要么结掉，别挂着。`
    : ''
  return `${head}\n${show}${tail}`
}
