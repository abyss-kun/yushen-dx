// 鱼神双子星 · 进程排他锁（robust）
// 只用文件系统，不启动任何进程、不影响任何现有进程：
//   · 抢锁：mkdir -p + open 'wx'，锁内容带随机 token（防 PID 复用误判）
//   · 判活：process.kill(pid, 0)；EPERM 说明进程存在但没权限 → 当**存活**，绝不误删
//   · 回收：只回收“pid 已死”或“坏锁且超过宽限期”的锁；删之前**重读**，
//           token 与原始内容完全一致才移除（防止把别人刚抢到的锁删掉）
//   · 重试：有上限（默认 3 次），不做无限递归
//   · 释放：只认自己的 token（且 pid 一致），文件被换过就不动
// 坏锁（空文件/非 JSON/没有合法 pid）默认保守等待 graceMs，超时后才尝试回收。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export const DEFAULT_ATTEMPTS = 3
export const DEFAULT_GRACE_MS = 10_000
export const DEFAULT_RETRY_DELAY_MS = 30
export const TOKEN_BYTES = 16

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * PID 是否还活着。
 * EPERM = 进程存在但当前用户没权限 → 视为存活（保守，不夺锁）；
 * ESRCH / 非法 pid → 视为已死；其它未知错误也保守视为存活。
 */
export function processAlive(pid) {
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 0) return false
  try {
    process.kill(n, 0)
    return true
  } catch (err) {
    if (err && err.code === 'EPERM') return true
    if (err && err.code === 'ESRCH') return false
    return true
  }
}

/**
 * 只读锁文件。文件不存在时返回 { exists: false }；内容坏掉时 parsed 为 null。
 * 读权限等异常会抛出，由调用方决定保守策略。
 */
export function readLock(file) {
  const target = path.resolve(file)
  let raw
  try {
    raw = fs.readFileSync(target, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return { exists: false, raw: '', parsed: null, mtimeMs: 0 }
    throw err
  }
  let parsed = null
  try {
    const value = JSON.parse(raw)
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value
  } catch { /* 坏内容保留 raw，由调用方按坏锁处理 */ }
  let mtimeMs = 0
  try { mtimeMs = fs.statSync(target).mtimeMs } catch { /* 文件刚被删也算没有 */ }
  return { exists: true, raw, parsed, mtimeMs }
}

function validPid(value) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * 创建一个锁句柄（不写盘，acquire 时才抢）。
 * options:
 *   attempts      抢锁尝试上限（默认 3）
 *   retryDelayMs  回收后重试的间隔（默认 30ms）
 *   graceMs       坏锁宽限期（默认 10s；测试可传 0）
 *                 注意：open 'wx' 到写 token 之间有极短空窗，别人可能读到空文件；
 *                 默认宽限期就是用来覆盖这个空窗的，生产别把 graceMs 设成 0。
 *   token         自定义 token（默认随机；测试用）
 *   isAlive       判活函数（默认 processAlive；测试用）
 *   hooks         { onAttempt(n), beforeReclaimVerify(ctx) }，仅供测试注入
 */
export function createLock(file, options = {}) {
  const target = path.resolve(file)
  const token = String(options.token || crypto.randomBytes(TOKEN_BYTES).toString('hex'))
  const attempts = Math.max(1, Math.floor(Number(options.attempts) || DEFAULT_ATTEMPTS))
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS) || 0)
  const graceMs = Math.max(0, Number(options.graceMs ?? DEFAULT_GRACE_MS) || 0)
  const isAlive = typeof options.isAlive === 'function' ? options.isAlive : processAlive
  const hooks = options.hooks && typeof options.hooks === 'object' ? options.hooks : {}
  let held = false

  function payload() {
    return { pid: process.pid, token, at: new Date().toISOString(), host: os.hostname(), version: 1 }
  }

  // open 'wx' 是原子的：谁先建成谁持有；建成后立刻写 token。
  function tryCreate() {
    let fd
    try {
      fd = fs.openSync(target, 'wx') // 已存在会抛 EEXIST，不会覆盖别人
    } catch (err) {
      if (err && err.code === 'EEXIST') return false
      throw err
    }
    try {
      fs.writeFileSync(fd, `${JSON.stringify(payload())}\n`, 'utf8')
    } finally {
      try { fs.closeSync(fd) } catch { /* 关不掉也要继续 */ }
    }
    const check = readLock(target)
    if (check.exists && check.parsed && check.parsed.token === token) return true
    // 自己刚建的文件读回来对不上：只删自己这份（file 里可能已被别人接手，那就不动）
    if (check.exists && !check.parsed) {
      try { fs.rmSync(target, { force: true }) } catch { /* 清不掉下次按坏锁处理 */ }
    }
    return false
  }

  function inspect() {
    let info
    try {
      info = readLock(target)
    } catch (err) {
      return { state: 'unreadable', error: err }
    }
    if (!info.exists) return { state: 'missing' }
    const ageMs = Date.now() - (info.mtimeMs || 0)
    const pid = info.parsed ? validPid(info.parsed.pid) : null
    if (!pid) return { state: 'broken', info, ageMs, reason: 'bad-pid' }
    return { state: isAlive(pid) ? 'live' : 'stale', info, ageMs, pid }
  }

  // 重读验证：raw（含 token/pid/at）与刚才判废时完全一致，才允许删。
  function reclaim(decision) {
    if (typeof hooks.beforeReclaimVerify === 'function') {
      try { hooks.beforeReclaimVerify({ file: target, state: decision.state, info: decision.info }) } catch { return false }
    }
    let again
    try {
      again = readLock(target)
    } catch {
      return false
    }
    if (!again.exists) return true // 别人先清掉了，等于回收成功
    if (again.raw !== decision.info.raw) return false // 内容变了 → 可能刚被接手，别删
    const before = decision.info.parsed
    const now = again.parsed
    const tokenBefore = before && typeof before.token === 'string' ? before.token : null
    const tokenNow = now && typeof now.token === 'string' ? now.token : null
    if (tokenBefore !== tokenNow) return false
    try {
      fs.rmSync(target, { force: true })
      return true
    } catch {
      return false
    }
  }

  async function acquire() {
    if (held) return true
    fs.mkdirSync(path.dirname(target), { recursive: true })

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (typeof hooks.onAttempt === 'function') hooks.onAttempt(attempt)

      if (tryCreate()) {
        held = true
        return true
      }

      const decision = inspect()
      if (decision.state === 'missing' || decision.state === 'unreadable') continue
      if (decision.state === 'live') return false // 活锁：直接让路，不碰
      if (decision.state === 'broken' && decision.ageMs < graceMs) return false // 坏锁且太新：保守等待
      if (decision.state === 'stale' || decision.state === 'broken') {
        if (!reclaim(decision)) return false
        if (attempt < attempts && retryDelayMs) await delay(retryDelayMs)
        continue
      }
    }
    return false
  }

  // 只删自己的：文件不存在、被换过、token/pid 对不上，都返回 false 且不动文件。
  function release() {
    if (!held) return false
    held = false
    let info
    try {
      info = readLock(target)
    } catch {
      return false
    }
    if (!info.exists || !info.parsed) return false
    const ownPid = Number(info.parsed.pid) === process.pid
    const ownToken = info.parsed.token === token
    if (!ownPid || !ownToken) return false
    try {
      fs.rmSync(target, { force: true })
      return true
    } catch {
      return false
    }
  }

  return {
    file: target,
    token,
    get held() { return held },
    acquire,
    release,
    read: () => readLock(target),
  }
}

/** 抢到返回锁句柄，没抢到返回 null（不抛错，调用方按“已有实例”处理）。 */
export async function acquireLock(file, options = {}) {
  const lock = createLock(file, options)
  return (await lock.acquire()) ? lock : null
}

/** 释放；只认自己的 token，失败返回 false。 */
export function releaseLock(lock) {
  try {
    return Boolean(lock && typeof lock.release === 'function' && lock.release())
  } catch {
    return false
  }
}
