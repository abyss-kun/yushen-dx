// 改｜2026-11-24 23:55｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜lib/compaction-mode.js:1｜本轮整理提交：该文件此前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
/* 标签
 * id: lib-compaction-mode
 * kind: module
 * summary: 压缩摘要模式：default=官方、memory=我们的记忆模板、off=只提醒不自动压；页面开关以后读写这里。
 * tags: 压缩, 摘要, 开关, 默认, 记忆
 * created: 2026-11-17 00:40:00
 * changed: 2026-11-17 00:40:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-17：压缩摘要要能开关、能还原）
 * audience: 页面设置、压缩 provider、系统简报
 * owner: 框架；只读写 switches.json 的 compactionMode
 * mutable: 可改；三档和默认值不许悄悄改
 * usage: getMode() / setMode('default'|'memory'|'off') / describeMode()
 * why: 官方默认摘要和记忆完整摘要是两种东西，必须能切换、能还原
 * result: 一个三档设置；默认 default，不会因为开关丢原文
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const fileOf = () => path.join(dataRoot(HOME), 'switches.json')
export const MODES = Object.freeze(['default', 'memory', 'off'])
export const MODE_LABEL = Object.freeze({ default: '官方默认摘要', memory: '记忆完整摘要', off: '关闭自动压缩' })

function readSwitches() {
  try {
    let s = fs.readFileSync(fileOf(), 'utf8')
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
    const data = JSON.parse(s)
    return data && typeof data === 'object' ? data : {}
  } catch { return {} }
}

export function getMode() {
  const m = String(readSwitches().compactionMode || 'default').toLowerCase()
  return MODES.includes(m) ? m : 'default'
}

export function setMode(mode) {
  const m = String(mode || '').toLowerCase()
  if (!MODES.includes(m)) return { ok: false, why: `只能是 ${MODES.join(' / ')}` }
  const data = readSwitches()
  data.compactionMode = m
  const file = fileOf()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n', 'utf8')
  fs.renameSync(tmp, file)
  return { ok: true, mode: m, label: MODE_LABEL[m] }
}

export function describeMode() {
  const mode = getMode()
  return { mode, label: MODE_LABEL[mode], modes: MODES.map((m) => ({ mode: m, label: MODE_LABEL[m] })) }
}
