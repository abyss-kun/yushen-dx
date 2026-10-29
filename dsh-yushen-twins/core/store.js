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
