// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 分身登记：哪条会话是哪个角色的分身、从哪个通道来的、什么时候。
//
// 为什么要有：这些天反复在"提过但没登记"上栽跟头。登记不能靠谁记得写，
// 每次投递（工作台说一句、QQ 桥转过来、群聊回一句）都自动记一笔。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = path.join(HOME, 'dayu', 'bodies.json')

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch { return false }
}

/** 记一具分身（幂等：同一条会话只更新时间和通道）。 */
export function registerBody({ role = '', sessionId = '', channel = '', now = Date.now() } = {}) {
  const r = String(role || '').trim()
  const sid = String(sessionId || '').trim()
  if (!r || !sid) return null
  const doc = readJson(FILE, { version: 1, roles: {} })
  const row = doc.roles[r] && typeof doc.roles[r] === 'object' ? doc.roles[r] : {}
  const prev = row[sid] || {}
  row[sid] = {
    channel: String(channel || prev.channel || '未知').slice(0, 20),
    firstAt: prev.firstAt || new Date(now).toISOString(),
    lastAt: new Date(now).toISOString(),
    count: (Number(prev.count) || 0) + 1,
  }
  doc.roles[r] = row
  writeJson(FILE, doc)
  return row[sid]
}


