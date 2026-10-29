// 内置清单：只读 DSH 发行包的头（asar 目录表），拿名字，不拆代码。
// 读法：asar 头 = 4 字节标记 + 8 字节长度 + JSON 目录表；不需要额外依赖。

import fs from 'node:fs'
import { createRequire } from 'node:module'
import { asarPath } from './paths.js'

// 在 Electron 里，fs 被 asar 补丁接管：拿 app.asar 本体当文件打开会报“not found in asar”。
// original-fs 绕过补丁，只读发行包头；CLI 下没有它，就用普通 fs。
const require = createRequire(import.meta.url)
const rawFs = (() => { try { return require('original-fs') } catch { return fs } })()

const ASAR = asarPath()

export function readAsarTree(file = ASAR) {
  const fd = rawFs.openSync(file, 'r')
  try {
    const head = Buffer.alloc(16)
    rawFs.readSync(fd, head, 0, 16, 0)
    const jsonLen = head.readUInt32LE(12)
    if (!jsonLen || jsonLen > 32 * 1024 * 1024) throw new Error('asar 头长度不对')
    const buf = Buffer.alloc(jsonLen)
    rawFs.readSync(fd, buf, 0, jsonLen, 16)
    return JSON.parse(buf.toString('utf8'))
  } finally { rawFs.closeSync(fd) }
}

/** 内置模块清单：dsh/node_modules/@deepseek-ai/* 与 *dsh-*；只给名字。 */
export function listBuiltin(file = ASAR) {
  try {
    const tree = readAsarTree(file)
    const nm = tree?.files?.dsh?.files?.node_modules?.files || {}
    const names = []
    for (const [name, child] of Object.entries(nm)) {
      if (name === '@deepseek-ai') {
        for (const sub of Object.keys(child?.files || {})) names.push(`${name}/${sub}`)
      } else if (!name.startsWith('@') && /^dsh-|^cordis-/.test(name)) {
        names.push(name)
      }
    }
    return { ok: true, file, count: names.length, names: names.sort() }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), count: 0, names: [] }
  }
}
