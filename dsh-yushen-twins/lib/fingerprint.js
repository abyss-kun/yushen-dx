// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 变更指纹：不哈希内容，只走一遍目录，拿「文件数 + 总字节 + 最新修改时间」。
// 用途：备份前先看一眼有没有变；没变就跳过这一轮，别白跑。
// 代价：一次 stat 遍历（几千个文件毫秒级），远小于复制/哈希整棵树。
import fs from 'node:fs'
import path from 'node:path'

/** 一个根目录的指纹；根不存在返回 null。 */
export function fingerprintOf(root, { maxFiles = 200000 } = {}) {
  let files = 0, bytes = 0, latest = 0
  const walk = (dir) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (files >= maxFiles) return
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.isFile()) continue
      try {
        const st = fs.statSync(p)
        files++; bytes += st.size
        if (st.mtimeMs > latest) latest = st.mtimeMs
      } catch { /* 正在写的文件跳过 */ }
    }
  }
  try { if (!fs.statSync(root).isDirectory()) return null } catch { return null }
  walk(root)
  return { files, bytes, latest: Math.round(latest) }
}

/** 多根合并成一个短字符串，用来跟上次比。 */
export function fingerprint(roots) {
  const parts = []
  for (const r of roots) {
    const p = typeof r === 'string' ? r : r?.path
    if (!p) continue
    const f = fingerprintOf(p)
    if (f) parts.push(`${path.basename(p)}:${f.files}/${f.bytes}/${f.latest}`)
  }
  return parts.join('|')
}
