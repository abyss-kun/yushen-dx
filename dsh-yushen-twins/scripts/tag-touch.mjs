/* 标签
 * id: tag-touch
 * kind: module
 * tags: 标签, 刷新时间, 改动标注
 * created: 2026-11-03 00:20:00
 * changed: 2026-11-04 00:07:13
 * author: 照微·工作台
 * authority: 老板（2026-11-03：改了内容就要做标注，这个要做到）
 * why: 改完内容却忘了改标签 = 标签过期；用一个命令把 changed 刷到秒，别再靠记
 * result: 可批量刷新，只动 changed/author 两行
 * mutable: 可改
 */
// 用法：node scripts/tag-touch.mjs <文件...> [--author 谁] [--why 一句话]
// 只改标签块里的 changed（和可选的 author），不碰正文。
import fs from 'node:fs'
import path from 'node:path'
import { parseTagBlock } from '../lib/tags.js'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : '' }
const author = get('author')
if (!files.length) {
  console.error('用法：node scripts/tag-touch.mjs <文件...> [--author 谁]')
  process.exit(2)
}

const d = new Date()
const p2 = (n) => String(n).padStart(2, '0')
const now = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`

let touched = 0
for (const file of files) {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) { console.log(`跳过（不存在）：${file}`); continue }
  const text = fs.readFileSync(abs, 'utf8')
  const { found } = parseTagBlock(text)
  if (!found) { console.log(`跳过（没有标签块）：${file}`); continue }
  const next0 = text.replace(/^(\s*(?:\*|\/\/)?\s*changed:).*$/m, `$1 ${now}`)
  const next = author ? next0.replace(/^(\s*(?:\*|\/\/)?\s*author:).*$/m, `$1 ${author}`) : next0
  if (next === text) { console.log(`没变：${file}`); continue }
  fs.writeFileSync(abs, next, 'utf8')
  touched += 1
  console.log(`已刷新：${path.basename(file)} → changed ${now}`)
}
console.log(`共刷新 ${touched} 个`)
