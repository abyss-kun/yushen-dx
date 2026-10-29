// 鱼神 · 查重（全知的一次查询，不是独立功能）
// 扫已装插件 + 自己：HTTP 路由、工具名，找重叠。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const PROFILE = path.join(HOME, 'profiles', 'desktop')
const SELF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function filesOf(dir) {
  const out = []
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let items = []
    try { items = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
    for (const it of items) {
      if (it.name.startsWith('.') || it.name === 'node_modules') continue
      const full = path.join(cur, it.name)
      if (it.isDirectory()) { if (!['backup', 'docs'].includes(it.name)) stack.push(full); continue }
      if (/\.(js|mjs|cjs)$/.test(it.name)) out.push(full)
    }
  }
  return out
}

function collect(pluginDir) {
  const routes = new Set()
  const tools = new Set()
  for (const file of filesOf(pluginDir)) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    for (const m of text.matchAll(/['"`](\/api\/[A-Za-z0-9_\-/]+)['"`]/g)) routes.add(m[1])
    for (const m of text.matchAll(/name:\s*['"`]([a-z][a-z0-9_]*\.[a-z0-9_]+)['"`]/g)) tools.add(m[1])
    for (const m of text.matchAll(/name:\s*['"`]([a-z][a-z0-9_]{2,})['"`]/g)) {
      if (['sidebar', 'main', 'plugin', 'tool', 'route'].includes(m[1])) continue
      tools.add(m[1])
    }
  }
  return { routes: [...routes], tools: [...tools] }
}

/** 返回 { plugins, dupRoutes, dupTools, notes }。 */
export function scanDuplicates() {
  const roots = [path.join(PROFILE, 'plugins'), path.join(HOME, 'plugins')]
  const plugins = []
  for (const root of roots) {
    let dirs = []
    try { dirs = fs.readdirSync(root, { withFileTypes: true }) } catch { continue }
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      try { plugins.push({ name: d.name, dir: fs.realpathSync(path.join(root, d.name)) }) } catch { /* 跳过 */ }
    }
  }
  try { if (fs.existsSync(path.join(SELF, 'package.json'))) plugins.push({ name: 'dsh-yushen-twins', dir: SELF }) } catch { /* 忽略 */ }

  const data = plugins.map((p) => ({ ...p, ...collect(p.dir) }))
  const routeMap = new Map()
  const toolMap = new Map()
  for (const p of data) {
    for (const r of p.routes) { if (!routeMap.has(r)) routeMap.set(r, []); routeMap.get(r).push(p.name) }
    for (const t of p.tools) { if (!toolMap.has(t)) toolMap.set(t, []); toolMap.get(t).push(p.name) }
  }
  const dupRoutes = [...routeMap].filter(([, owners]) => new Set(owners).size > 1).map(([name, owners]) => ({ name, owners: [...new Set(owners)] }))
  const dupTools = [...toolMap].filter(([, owners]) => new Set(owners).size > 1).map(([name, owners]) => ({ name, owners: [...new Set(owners)] }))
  return {
    at: new Date().toISOString(),
    plugins: data.map((p) => ({ name: p.name, routes: p.routes.length, tools: p.tools.length })),
    dupRoutes,
    dupTools,
    notes: ['sidebar.panellist / main 是插槽名，不是功能重名'],
  }
}
