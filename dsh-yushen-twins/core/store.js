// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: core-store
 * kind: module
 * summary: 宿主无关的存储：只认 $DSH_HOME/dayu，读/写/追加三件；写是 tmp+rename 原子替换。
 * tags: 存储, 原子写, 核心, 宿主无关
 * created: 2026-11-11 00:45:00
 * changed: 2026-11-11 00:45:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 核心层（ledger/soul/dispatch）、维护者
 * owner: 框架；改它影响所有落盘，要老板点头
 * defaults: 数据根 = $DSH_HOME/dayu（没设 DSH_HOME 时 ~/.dsh/dayu）
 * off: 没有关掉的开关——删了等于存储层断掉；换根只改 DSH_HOME
 * mutable: 可改；**不许 import 任何 DSH 宿主代码**（这是"宿主无关"的底线）
 * usage: read(rel) / readJson(rel) / write(rel, text) / append(rel, line)；rel 一律相对数据根
 * why: 换宿主、换机器、手机上跑，路径不能四处写死；写一半断电不能把文件写坏
 * result: 四个函数；写走 tmp+rename，读失败给 fallback，绝不抛到调用方
 */
// core · 宿主无关的存储
// 只认 ~/.dsh/dayu（或 DSH_HOME），不 import 任何 DSH 代码。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const DATA = path.join(HOME, 'dayu')

export function read(rel, fallback = '') {
  try { return fs.readFileSync(path.join(DATA, rel), 'utf8') } catch { return fallback }
}

export function readJson(rel, fallback = null) {
  try { return JSON.parse(read(rel, '')) } catch { return fallback }
}

export function write(rel, text) {
  const target = path.join(DATA, rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = target + '.tmp'
  fs.writeFileSync(tmp, String(text), 'utf8')
  fs.renameSync(tmp, target)
}

export function append(rel, line) {
  const target = path.join(DATA, rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.appendFileSync(target, String(line) + '\n')
}
