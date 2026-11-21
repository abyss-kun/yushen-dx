// 生成 / 自检 B站投稿简介的「固定尾巴」（2026-11-02 老板定：插件链接 + 群号每次必带）。
// 用法：
//   node scripts/bili-desc.mjs --body 正文.txt --out 简介.txt
//   node scripts/bili-desc.mjs --check 已写好的简介.txt
// 少了链接或群号 → 退出码 1，不发。
import fs from 'node:fs'
import path from 'node:path'

export const TAIL_LINK = 'https://github.com/abyss-kun/yushen-dx'
export const TAIL_GROUP = '1132802806'
export const TAIL = [
  '',
  '鱼神插件：',
  TAIL_LINK,
  '',
  `交流群：${TAIL_GROUP}（安装包在群文件，三档：desktop / mobile / lite）`,
].join('\n')

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? String(process.argv[i + 1] || '') : ''
}

/** 正文 + 尾巴；已经带过就不重复追加 */
export function withTail(body = '') {
  const b = String(body || '').trimEnd()
  const hasLink = b.includes(TAIL_LINK)
  const hasGroup = b.includes(TAIL_GROUP)
  if (hasLink && hasGroup) return b + '\n'
  return (b + '\n' + TAIL).replace(/\n{3,}/g, '\n\n') + '\n'
}

/** 检查一段简介是否合规 */
export function checkDesc(text = '') {
  const t = String(text || '')
  const missing = []
  if (!t.includes(TAIL_LINK)) missing.push('插件链接')
  if (!t.includes(TAIL_GROUP)) missing.push('群号')
  return { ok: missing.length === 0, missing }
}

const body = arg('body')
const out = arg('out')
const check = arg('check')

if (check) {
  const r = checkDesc(fs.readFileSync(check, 'utf8'))
  if (!r.ok) { console.error(`✗ 简介缺：${r.missing.join('、')}（B站发布固定尾巴）`); process.exit(1) }
  console.log('✓ 简介齐全：插件链接 + 群号都在')
  process.exit(0)
}

if (body) {
  const text = withTail(fs.readFileSync(body, 'utf8'))
  const r = checkDesc(text)
  if (!r.ok) { console.error('✗ 生成后仍缺：' + r.missing.join('、')); process.exit(1) }
  if (out) fs.writeFileSync(out, text, 'utf8')
  else process.stdout.write(text)
  console.log(`\n✓ 已生成（${text.length} 字），尾巴齐`)
  process.exit(0)
}

console.log('用法：--body <正文文件> [--out <输出>] 或 --check <简介文件>')
