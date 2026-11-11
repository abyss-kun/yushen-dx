// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 路径总入口：**先看环境、再找家，不写死本机的盘符**。
//
// 2026-11-12 老板原话：「去到新家应该先检索，了解家里情况才对，而不是绝对路径写死本机的」。
// 所以这里的规矩是：
//   1. 环境变量优先（给高级用户 / 测试 / 多份安装用）；
//   2. 其次在自己周围"认门牌"——从包根、工作区、用户目录这些**相对位置**往下找，
//      按目录里的特征文件确认（package.json 的 name、state/、events/ 这些），而不是猜某个绝对路径；
//   3. 都找不到就返回 ''，调用方必须优雅降级（不抛错、不假装能用）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = os.homedir()
const exists = (p) => { try { return Boolean(p) && fs.existsSync(p) } catch { return false } }
const firstExisting = (list, fallback = '') => list.find((p) => exists(p)) || fallback

/** DSH 家目录（几乎所有人都是 ~/.dsh，可用 DSH_HOME 覆盖）。 */
export function dshHome() {
  return process.env.DSH_HOME || path.join(HOME, '.dsh')
}

/** 包根目录（本文件在 lib/ 下，上一级就是包根）。不能用 URL.pathname，中文路径会被百分号编码。 */
export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

/** "家"的候选位置：包根周围、cwd、用户目录。都是相对得来的，不写盘符。 */
function homes() {
  const root = packageRoot()
  const out = [
    path.dirname(root),            // 插件就放在工作区里时
    path.dirname(path.dirname(root)),
    process.cwd(),
    HOME,
  ]
  return [...new Set(out.filter(Boolean))]
}

/** 在一个目录里认"门牌"：同名目录 + 特征文件。 */
function findNeighbor(name, marker) {
  for (const base of homes()) {
    const p = path.join(base, name)
    if (!exists(p)) continue
    if (!marker || exists(path.join(p, marker))) return p
  }
  return ''
}

/** 鱼神的数据目录（记忆/账本/派活都在 ~/.dsh/dayu）。没有就是 ''。 */
export function dayuHome() {
  const p = path.join(dshHome(), 'dayu')
  return exists(p) ? p : ''
}

/** QQ 桥根目录：先用环境变量，再在家的周围找带 state/ 的 qq-bridge。找不到就是 ''。 */
export function qqBridgeRoot() {
  const env = process.env.QQ_BRIDGE_ROOT
  if (env) return env
  return findNeighbor('qq-bridge', 'state')
}

/** 桥的状态目录。 */
export function qqBridgeState() {
  const env = process.env.QQ_BRIDGE_STATE
  if (env) return env
  const root = qqBridgeRoot()
  return root ? path.join(root, 'state') : ''
}

/** 跨机器的"能用/不能用"清单：给诊断和换机器时自查用（不抛错，全返回结果）。 */
export function describe() {
  const rows = [
    ['DSH 家目录', dshHome()],
    ['插件包根', packageRoot()],
    ['鱼神数据目录', dayuHome()],
    ['QQ 桥', qqBridgeRoot()],
    ['桥状态', qqBridgeState()],
  ]
  return rows.map(([name, p]) => ({ name, path: p, ok: exists(p) }))
}
