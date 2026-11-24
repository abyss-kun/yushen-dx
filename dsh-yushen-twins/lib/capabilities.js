// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-capabilities
 * kind: module
 * summary: 插件本事：读本机文件把插件真能干什么索引出来（不只"联不联网"）；只读、不外传。
 * tags: 能力, 索引, 只读
 * created: 2026-11-11 01:10:00
 * changed: 2026-11-11 01:10:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 她、capmap、维护者
 * owner: 框架；**能力清单只许据实**（没接通的不许写"能用"）
 * mutable: 可改；不许把"看到了"写成"接通了"
 * usage: 扫插件目录 → 能力条目；给 capmap/工具用
 * why: 老以为"装了就等于有"，实际很多插件只是装了
 * result: 一组据实的本机能力索引
 */
// 插件本事（本地全读）：不是只看“联不联网”，是把它能干什么读出来。
// 只读本机文件、只索引、不外传；读完给鱼神自己用。

import fs from 'node:fs'
import path from 'node:path'

const MAX_FILES = 300
const MAX_BYTES = 512 * 1024

function walk(dir, out, depth = 0) {
  if (depth > 5 || out.length >= MAX_FILES) return
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (out.length >= MAX_FILES) return
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { walk(full, out, depth + 1); continue }
    if (!/\.(js|mjs|cjs|json|md)$/i.test(e.name)) continue
    try { if (fs.statSync(full).size > MAX_BYTES) continue } catch { continue }
    out.push(full)
  }
}

/** 读一个插件目录，抽出“它能干什么”。 */
export function scanCapabilities(dir) {
  const files = []
  walk(dir, files)
  const tools = []
  const routes = []
  const commands = []
  let bytes = 0
  for (const file of files) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    bytes += text.length
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (/\b(?:tools?\.register|registerTool)\s*\(/.test(line)) {
        for (let j = i; j < Math.min(lines.length, i + 10); j += 1) {
          const m = lines[j].match(/name:\s*['"]([A-Za-z0-9_.-]{2,48})['"]/)
          if (m) { tools.push({ name: m[1], file: path.relative(dir, file), line: j + 1 }); break }
        }
      }
      if (/\b(?:webServer\.register|server\.register)\s*\(/.test(line)) {
        for (let j = i; j < Math.min(lines.length, i + 10); j += 1) {
          const m = lines[j].match(/path:\s*['"]([^'"]{2,80})['"]/)
          if (m) { routes.push({ path: m[1], file: path.relative(dir, file), line: j + 1 }); break }
        }
      }
      const c = line.match(/\b(?:registerCommand|command)\s*\(\s*['"]([A-Za-z0-9_.-]{2,32})['"]/)
      if (c) commands.push({ name: c[1], file: path.relative(dir, file), line: i + 1 })
    }
  }
  return {
    files: files.length,
    bytes,
    tools: dedupe(tools),
    routes: dedupe(routes),
    commands: dedupe(commands),
  }
}

function dedupe(list) {
  const seen = new Set()
  return list.filter((x) => {
    const k = JSON.stringify(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 80)
}
