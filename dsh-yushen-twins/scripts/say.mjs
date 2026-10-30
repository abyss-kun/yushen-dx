// 直接跟某位说话（UTF-8 正确版）。别再用 PowerShell 5.1 的字符串 Body——它默认 gb2312。
// 用法：ELECTRON_RUN_AS_NODE=1 "<exe>" scripts/say.mjs xiaoyu "说点什么"
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const role = args[0] || 'dayu'
const text = args.slice(1).join(' ').trim()
if (!text) {
  console.error('用法：say.mjs <dayu|xiaoyu|dragon> "内容"')
  process.exitCode = 2
} else {
  const token = fs.readFileSync(path.join(DATA, 'api-token'), 'utf8').trim()
  const baseRaw = fs.readFileSync(path.join(DATA, 'base-url'), 'utf8').trim()
  const base = /^https?:\/\//.test(baseRaw) ? baseRaw : `http://${baseRaw}`
  const res = await fetch(`${base}/api/dayu/residence/say`, {
    method: 'POST',
    headers: { 'x-yushen-token': token, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ role, text }),
  })
  const body = await res.text()
  console.log(body)
  if (!res.ok) process.exitCode = 1
}
