// 鱼神 · Copyright (c) 2026 用户. All rights reserved.
// 名册：只读地看“公司里有谁、谁会什么”。
// 数据源：profile 的 package.json（依赖 + bundles）+ node_modules 里的 package.json。
// 不启动、不修改任何东西。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const SELF = 'dsh-yushen-twins'

export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function profilesDir() {
  return path.join(dshHome(), 'profiles')
}

/** 找到装着本插件的那个 profile；找不到就退回 desktop。 */
export function findProfile(pkgName = SELF) {
  const base = profilesDir()
  let names = []
  try {
    names = fs.readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch { /* 没有 profiles 目录 */ }

  for (const name of names) {
    const dir = path.join(base, name)
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      if (pkg?.dependencies?.[pkgName]) return { name, dir, pkg }
    } catch { /* 坏 profile 跳过 */ }
  }

  const fallback = process.env.DSH_PROFILE || 'desktop'
  const dir = path.join(base, fallback)
  let pkg = {}
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch { /* 没有就算了 */ }
  return { name: fallback, dir, pkg }
}

function readPkgVersion(profileDir, name) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(profileDir, 'node_modules', name, 'package.json'), 'utf8'))
    return pkg.version || ''
  } catch {
    return ''
  }
}

/** 名册：在岗（装了）+ 归属（依赖写法）；候选由后续接上（未装的插件包）。 */
export function readRoster(profile = findProfile()) {
  const deps = profile.pkg?.dependencies || {}
  const bundles = profile.pkg?.dsh?.profile?.bundles || []
  const names = new Set([...Object.keys(deps), ...bundles])

  const items = []
  for (const name of names) {
    const version = readPkgVersion(profile.dir, name)
    const spec = deps[name] || '(bundle)'
    items.push({
      name,
      version,
      spec,
      source: spec.startsWith('link:') ? 'link' : spec.startsWith('file:') ? 'file' : spec.startsWith('http') ? 'remote' : 'npm',
      installed: Boolean(version),
    })
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  return { profile: profile.name, count: items.length, items }
}
