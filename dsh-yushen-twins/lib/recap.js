// 本体 → 通道：把「她本体最近做了什么」放一份到桥能看见的地方。
//
// 为什么需要：2026-10-27 群里实测——老板说"你现在不应该是同一个本体了吗"，
// 她答「不知道呀，我这边只看得到这个群，那边说了啥你不讲我就像隔着一堵墙」。
// 回写只做了 QQ → 本体，反方向没有：她群里不知道本体刚写完文案、刚渲了片子。
//
// 做法（不越 §7.4 的单向依赖）：
//   鱼神**主动**往桥的 state 目录丢一个文件（`state/recap/<role>.txt`）。
//   桥只读自己 state 目录里的文件，不知道是谁写的、也不需要知道。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir } from './runtime.js'
import { readAgenda } from './agenda.js'
import { getCharacter } from './characters.js'
import { qqBridgeState } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const BRIDGE_STATE = process.env.QQ_BRIDGE_STATE || qqBridgeState()

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function resolve(p) {
  const s = String(p || '')
  if (!s) return ''
  return path.isAbsolute(s) ? s : path.join(DATA, 'soul', s)
}
function one(s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n) }

/** 三行以内的"本体近况"。
 *
 * ⚠️ 可见范围（管家 2026-10-27 定的规矩：**私聊里的东西不进群**）：
 * 这份文件会被桥注入到**群聊**的唤醒里，所以只能装"群里能说"的东西。
 * 现在只取 source 以 `group:` 开头的经历（那些本来就是群里说过的话）；
 * 私聊、本体内部事件（入界/告知）、议程里的事，一律不往里放。
 * 要放宽，得先给每条记忆打可见范围标签——那是管家说的"下一步"，没做之前按最保守的来。
 */
export function buildRecap(role) {
  const lines = []
  try {
    const c = getCharacter(role)
    const mem = readJson(resolve(c?.memory), null)
    const evs = (Array.isArray(mem?.events) ? mem.events : [])
      .filter((e) => e && typeof e === 'object' && e.text)
      .filter((e) => String(e.source || '').startsWith('group:'))
      .slice(-2)
    for (const e of evs) lines.push(`- ${one(e.text, 70)}`)
  } catch { /* 读不到就算了 */ }
  return lines.slice(0, 3)
}

/** 写两份：本体自己留一份；桥的 state 里丢一份（桥只读自己的目录）。 */
export function writeRecap(role, { now = Date.now() } = {}) {
  const id = String(role || '').trim()
  if (!id) return { ok: false, error: '没有角色' }
  const lines = buildRecap(id)
  if (!lines.length) return { ok: true, empty: true }
  const text = `<!-- ${new Date(now).toISOString()} -->\n${lines.join('\n')}\n`
  const outs = []
  // 本体自己那份放在自己的目录（不冲突）；桥那份按角色命名（一个目录里放三个人的）。
  for (const [dir, name] of [[runtimeDir(id), 'recap.txt'], [path.join(BRIDGE_STATE, 'recap'), `recap-${id}.txt`]]) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, name)
      fs.writeFileSync(file, text, 'utf8')
      outs.push(file)
    } catch { /* 一边写不了不影响另一边 */ }
  }
  return { ok: outs.length > 0, files: outs, lines: lines.length }
}

/** 读回来（她自己看，或排查用）。 */
export function readRecap(role) {
  const id = String(role || '').trim()
  for (const [dir, name] of [[runtimeDir(id), 'recap.txt'], [path.join(BRIDGE_STATE, 'recap'), `recap-${id}.txt`]]) {
    try {
      const t = fs.readFileSync(path.join(dir, name), 'utf8')
      return { ok: true, at: (t.match(/<!-- ([^ ]+) -->/) || [])[1] || '', body: t.replace(/<!--.*-->\s*/, '').trim() }
    } catch { /* 试下一个 */ }
  }
  return { ok: false, error: '还没有本体近况' }
}
