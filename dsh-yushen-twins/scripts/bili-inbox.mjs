// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// B站收件：借 bili-duty 的登录态，把 @我 / 回复我 / 未读私信 写进她的收件箱（只读、不回复）。
// 2026-11-01 主人：想在 B站 跟我说话。先做「听得到」。
//
// 用法：node scripts/bili-inbox.mjs [--mode dm|at|replies] [--limit 20]
// 输出：一行 JSON（tick 取最后一行，和 build-live-index / index-media 一个写法）。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const PY = path.join(HOME, 'bili-duty', '.venv', 'Scripts', 'python.exe')
const SCRIPT = path.join(HOME, 'bili-duty', 'bili_inbox.py')
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? String(process.argv[i + 1] || dflt) : dflt
}
// 只放这三种：拼错模式名不该静默退回私信（那会让「@我」看起来跑了、其实拉到的是别的篮子）。
const MODES = ['dm', 'at', 'replies']
const mode = arg('mode', 'dm')
const limit = arg('limit', '20')

if (!MODES.includes(mode)) {
  console.log(JSON.stringify({ ok: false, mode, reason: `没有这种模式：${mode}（只能是 ${MODES.join(' / ')}）` }))
  process.exit(0)
}
if (!fs.existsSync(PY) || !fs.existsSync(SCRIPT)) {
  console.log(JSON.stringify({ ok: false, mode, reason: '没有 bili-duty 的 venv 或脚本（先跑 bili_setup / 登录）' }))
  process.exit(0)
}
const r = spawnSync(PY, [SCRIPT, '--mode', mode, '--limit', limit], { encoding: 'utf8', timeout: 120000 })
const line = String(r.stdout || '').trim().split('\n').pop() || ''
console.log(line || JSON.stringify({ ok: false, mode, reason: '没有输出', stderr: String(r.stderr || '').slice(0, 200) }))
