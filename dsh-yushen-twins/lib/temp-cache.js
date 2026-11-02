// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 临时缓存检查：一个东西在「临时缓存」里放了超过 7 天还没处理，就提醒一次。
// 老板 2026-10-31 定的：临时缓存只能中转，不能长住。
import fs from 'node:fs'
import path from 'node:path'
import { workspace } from './paths.js'

const DAY = 86400000
const CACHE = path.join(workspace(), '临时缓存')
const OUT = path.join(workspace(), '档案', '临时缓存检查')

export function checkTempCache({ days = 7, now = Date.now() } = {}) {
  if (!fs.existsSync(CACHE)) return { stale: [], dir: CACHE, note: '没有临时缓存目录' }
  const stale = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (e.name === 'README.md') continue
      const st = fs.statSync(p)
      if (now - st.mtimeMs > days * DAY) stale.push({ path: path.relative(CACHE, p), days: Math.floor((now - st.mtimeMs) / DAY) })
    }
  }
  walk(CACHE)
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, `${new Date(now).toISOString().slice(0, 10)}.md`), [
    `# 临时缓存检查 · ${new Date(now).toISOString().slice(0, 10)}`,
    '',
    `超过 ${days} 天没处理的：${stale.length} 个`,
    '',
    ...stale.map((s) => `- ${s.path}（放了 ${s.days} 天）`),
    '',
    stale.length ? '该处理了：能归位的归位，没用的进「待删」。' : '空的，干净。',
    '',
  ].join('\n'), 'utf8')
  return { stale, dir: CACHE }
}
