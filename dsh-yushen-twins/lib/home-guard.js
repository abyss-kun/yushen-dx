// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 家目录护栏（2026-10-31 立）
//
// 为什么要它：今天 16:11–16:26，一次「出厂版干净环境安装测试」把**真家目录**
// 当成了试验场——~/.dsh/sessions、~/.dsh/storages、~/.dsh/dayu 被整目录重建，
// 三个常驻会话的日志变成 9 字节空帧，回收站里连痕迹都没有；事后只能靠目录的
// 创建时间（sessions 16:21:53、storages 16:26:25）倒推。
//
// 规矩只有一条：**破坏性删除不许在默认家目录上裸跑**。
//   1. DSH_HOME 显式指到别处（%TEMP%\dsh-factory 之类）→ 放行；
//   2. 真要动默认家目录 → 必须显式 DSH_ALLOW_DESTRUCTIVE_HOME=1；
//   3. 本模块只做判断，不删任何东西：删的代码自己调用它，抛错就停。
//
// 这挡不住手敲的 Remove-Item；它挡的是「脚本以为自己在测试环境」这一类。
import os from 'node:os'
import path from 'node:path'
import { dshHome } from './paths.js'

/** 默认家目录：~/.dsh（换机器/换用户名都从 os.homedir() 推，不写死）。 */
export function defaultHome() {
  return path.join(os.homedir(), '.dsh')
}

// 大小写不敏感、尾分隔符忽略：Windows 上 D:\x\.dsh\ 和 d:\x\.dsh 是同一个。
const norm = (p) => path.resolve(String(p || '')).replace(/[\\/]+$/, '').toLowerCase()

/** 当前解析出的家目录是不是默认那个。 */
export function isDefaultHome(home = dshHome()) {
  return norm(home) === norm(defaultHome())
}

/**
 * 破坏性操作前调用；默认家目录且没有显式放行就抛。
 * @param {string} op 操作名，写进错误信息里，方便追是哪一步。
 * @returns {{ok: true, home: string, reason: string}}
 */
export function assertDestructiveHome(op, { home = dshHome(), env = process.env } = {}) {
  if (!isDefaultHome(home)) return { ok: true, home, reason: 'isolated' }
  if (env.DSH_ALLOW_DESTRUCTIVE_HOME === '1') return { ok: true, home, reason: 'opt-in' }
  const error = new Error(
    `拒绝在默认家目录上做破坏性操作（${op}）：${home}。` +
    '先把 DSH_HOME 指到隔离目录（例如 %TEMP%\\dsh-factory）；' +
    '确要动真家目录，就显式设 DSH_ALLOW_DESTRUCTIVE_HOME=1 再跑。'
  )
  error.code = 'DESTRUCTIVE_HOME_REFUSED'
  throw error
}
