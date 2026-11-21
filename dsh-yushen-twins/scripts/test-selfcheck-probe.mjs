// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 自检的执行探针（2026-11-01，安全闸门第 3 条）：
// 10-31 18:06–18:51 命令全瞎，可自检 7 项全绿——因为它只查"文件在不在"，从不试跑。
// 这条测：自检里必须有「执行」「写读」两项，而且真跑一遍它们是绿的；临时家目录，不碰真数据。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-selfcheck-'))
process.env.DSH_HOME = TMP
fs.mkdirSync(path.join(TMP, 'dayu'), { recursive: true })

const { inProcessCheck } = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/lib/selfcheck.js')
const r = inProcessCheck()
const names = r.checks.map((c) => c.name)
assert.ok(names.includes('执行'), `自检里没有「执行」探针：${names.join('、')}`)
assert.ok(names.includes('写读'), `自检里没有「写读」探针：${names.join('、')}`)
const exec = r.checks.find((c) => c.name === '执行')
const io = r.checks.find((c) => c.name === '写读')
assert.equal(exec.ok, true, `执行探针红了：${exec.detail}`)
assert.equal(io.ok, true, `写读探针红了：${io.detail}`)
// 探针文件不许留在家里
const leftovers = fs.readdirSync(path.join(TMP, 'dayu')).filter((f) => f.includes('.__probe_'))
assert.deepEqual(leftovers, [], `探针文件没删：${leftovers.join('、')}`)

fs.rmSync(TMP, { recursive: true, force: true })
console.log('自检执行探针：能起进程 / 能写能读 / 不留残file 三组都过')
