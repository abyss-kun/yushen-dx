/* 标签
 * id: lib-polite-relay
 * kind: module
 * summary: 礼貌寒暄的代发——只发"不表态"的话术（按关系分桶、0 token），发完留痕，醒来能看见"我替你回了谁"。
 * tags: 代发, 礼貌, 话术, 桥, 留痕
 * audience: 桥（/decide 走它）、她的醒来那段、新装的角色
 * owner: 框架；话术她自己改（polite-replies.json），"只发不表态"这条边界不许破
 * defaults: 三个桶各 3 句；同一人一天一次
 * usage: isPolite(text) → pickReply({familiarity,isOwner}) → noteRelay()；醒来那段调 relaysSince()
 * off: 删掉 polite-replies.json 并清空桶，或去掉 /decide 里的礼貌短路（改代码，需老板点头）
 * created: 2026-11-10 23:05:00
 * changed: 2026-11-11 00:47:31
 * author: 大鱼·主代理（第三批）
 * authority: 主人（2026-11-10 21:5x：「代发指的是礼貌型的，比如别人跟你打个招呼，你不回又不好，回了又浪费；回了之后要她醒了能知道」；2026-10-18 口径：固定话术优先 0 token）
 * why: 以前要么沉默（像死了），要么用系统模板「她不在」（机器味），没有"按关系回一句客套"这条路
 * result: isPolite / pickReply / noteRelay / relaysSince；话术库可被她覆盖（~/.dsh/dayu/polite-replies.json）
 * mutable: 可改（默认话术可以改；**边界不许破**：只发不表态的话，不接具体事、不做承诺）
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 三条边界（老板 2026-10-18 口径 + 今天补的）：
//   · **只发不表态的**：问候/应声/约时间。"行""可以""我帮你"这类一律不发——代发出一句承诺，醒来就变成她没做过的承诺。
//   · **0 token**：只从话术库挑，不调模型、不调本地引擎。
//   · **发完必留痕**：写进 runtime/<角色>/代传话.jsonl，醒来那段会说"你睡着时我替你回了谁"。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir } from './runtime.js'
import { GREET_RE } from './wake-score.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

/** 出厂默认话术（她能改：写 ~/.dsh/dayu/polite-replies.json 覆盖；桶名只认 熟/生/老板）。 */
export const DEFAULT_LIBRARY = Object.freeze({
  熟: ['在的，怎么啦', '刚看到～', '嗯嗯，我在'],
  生: ['你好，这边刚看到', '在的，你说', '收到了'],
  老板: ['在的', '看到了，等我看一眼'],
})

/** 是不是一句礼貌寒暄（不长、没有具体事）。 */
export function isPolite(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t || t.length > 24) return false
  return GREET_RE.test(t)
}

function library() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA, 'polite-replies.json'), 'utf8'))
    const out = {}
    for (const bucket of ['熟', '生', '老板']) {
      const arr = Array.isArray(raw?.[bucket]) ? raw[bucket].filter((x) => typeof x === 'string' && x.trim()) : []
      out[bucket] = arr.length ? arr : [...DEFAULT_LIBRARY[bucket]]
    }
    return out
  } catch { return { ...DEFAULT_LIBRARY } }
}

/**
 * 按关系挑一句。纯挑选，不生成。
 * @param {{familiarity?:number, isOwner?:boolean, seed?:number}} ctx
 */
export function pickReply({ familiarity = 0, isOwner = false, seed = 0 } = {}) {
  const lib = library()
  const bucket = isOwner ? '老板' : (Number(familiarity) >= 2 ? '熟' : '生')
  const arr = lib[bucket] || lib.生
  const i = Math.abs(Math.floor(Number(seed) || 0)) % arr.length
  return { bucket, reply: arr[i] }
}

/** 代发留痕（只增不改；写不进去也不挡回话）。 */
export function noteRelay(role, { who = '', text = '', said = '', bucket = '', kind = 'polite', now = Date.now() } = {}) {
  const row = {
    at: new Date(now).toISOString(),
    kind,
    who: String(who).slice(0, 60),
    text: String(text).slice(0, 200),
    said: String(said).slice(0, 200),
    bucket: String(bucket).slice(0, 20),
  }
  try {
    fs.mkdirSync(runtimeDir(role), { recursive: true })
    fs.appendFileSync(path.join(runtimeDir(role), '代传话.jsonl'), `${JSON.stringify(row)}\n`, 'utf8')
    return { ok: true, row }
  } catch (e) { return { ok: false, reason: String(e?.message || e) } }
}

/** 她上次醒之后，我替她代发了几句（醒来那段用）。 */
export function relaysSince(role, { sinceMs = 0, limit = 20 } = {}) {
  const out = []
  try {
    const lines = fs.readFileSync(path.join(runtimeDir(role), '代传话.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      try {
        const r = JSON.parse(line)
        const t = Date.parse(String(r.at || ''))
        if (!Number.isFinite(t) || t < Number(sinceMs || 0)) continue
        out.push(r)
      } catch { /* 坏行跳过 */ }
    }
  } catch { return [] }
  return out.slice(-Math.max(1, Number(limit) || 20))
}
