// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-capmap
 * kind: module
 * summary: 查能力：她说"我想做 X"，这里给候选（工具/脚本/文档/插件/组合），只查本地表。
 * tags: 能力表, 检索, 本地, 零模型
 * created: 2026-11-11 01:10:00
 * changed: 2026-11-11 01:10:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 她（yushen_can / yushen_tools 背后）、新角色、维护者
 * owner: 框架；表由 `scripts/build-capmap.mjs` 生成（数据来源可扩）
 * defaults: 表在 ~/.dsh/dayu/capmap.json（生成物，可重建）
 * off: 不查就没有候选；不影响工具本身
 * mutable: 可改检索逻辑；**查不到就说没有，不编**
 * usage: 查一句大白话 → 候选几条（名字+怎么用+去哪看）
 * why: "我能不能做 X"每次都要人肉翻目录
 * result: 一个本地检索表 + 查询函数
 */
// 查能力：她说"我想做 X"，这里给候选（工具/脚本/文档/插件/组合）。
//
// 只查本地那张表（`scripts/build-capmap.mjs` 生成的 capmap.json），不联网、不叫模型。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const MAP = path.join(HOME, 'dayu', 'capmap.json')

export function loadCapmap() {
  try { return JSON.parse(fs.readFileSync(MAP, 'utf8')) } catch { return null }
}

/** 人话 → 表里的词。不是语义理解，只是把常见说法接上。 */
const ALIAS = {
  发消息: ['send', 'outbox', 'qq', '消息', '私聊'],
  回消息: ['send', 'outbox', 'qq', '回复'],
  私聊: ['private', 'qq', 'outbox'],
  看视频: ['bili', 'video', '视频', 'b站'],
  视频: ['bili', 'video', '视频'],
  改配置: ['settings', 'config', '开关', '设置'],
  设置: ['settings', 'config'],
  查资料: ['web', 'search', 'knowledge', '查'],
  看图: ['image', 'vision', '图'],
  记忆: ['memory', 'mind', '记忆'],
  定时: ['schedule', 'timer', 'cron', '定时'],
  钱: ['cost', 'token', '钱', '预算', 'budget'],
  睡觉: ['sleep', '休息', 'presence'],
  上报: ['report', 'escalate', '上报'],
  底线: ['bottom', 'refusal', '底线'],
}

/** 粗略检索：名字/描述/分类命中都算，命中多的排前面。 */
export function searchCapmap(query = '', { limit = 8 } = {}) {
  const map = loadCapmap()
  if (!map) return { ok: false, reason: '还没有能力表：先跑 node scripts/build-capmap.mjs', items: [], combos: [] }
  const q = String(query || '').toLowerCase().trim()
  const terms = q ? q.split(/[\s,，。?!？]+/).filter(Boolean) : []
  for (const [k, wants] of Object.entries(ALIAS)) if (q.includes(k)) terms.push(...wants)
  const uniq = [...new Set(terms)]
  const score = (it) => {
    const hay = `${it.name} ${it.what} ${it.how} ${it.kind}`.toLowerCase()
    let s = 0
    for (const t of uniq) if (hay.includes(t)) s += t.length >= 2 ? 2 : 1
    if (!uniq.length) s = it.kind === 'tool' ? 3 : (it.kind === 'doc' ? 2 : 1)
    if (it.kind === 'tool' && s > 0) s += 2 // 能直接用的排前面
    return s
  }
  const items = map.items
    .map((it) => ({ ...it, score: score(it) }))
    .filter((it) => it.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 8))
  const combos = (map.combos || []).filter((c) => !uniq.length || uniq.some((t) => `${c.name} ${c.steps.join(' ')}`.toLowerCase().includes(t)))
  return { ok: true, query: q, builtAt: map.builtAt, counts: map.counts, items, combos }
}

/** 一行摘要（注入用）：有多少工具、哪几类。 */
export function capmapLine() {
  const map = loadCapmap()
  if (!map) return ''
  return `## 你能用的东西\n${capmapCounts()}想找什么，用 yushen_can 查「想做什么」，它给你名字、怎么用、去哪看；找到就自己上手，或者拆开拼。`
}

/** 只有数字、没有标题——给「你手边有什么」并进去用（自净 2026-10-31：两节讲的是同一件事）。 */
export function capmapCounts() {
  const map = loadCapmap()
  if (!map) return ''
  const c = map.counts || {}
  return `工具 ${c.tool || 0} 个、脚本 ${c.script || 0} 个、文档 ${c.doc || 0} 份、外部通道 ${c.adapter || 0} 个。`
}
