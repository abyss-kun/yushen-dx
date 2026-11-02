// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 平台判定与“手机轻装”开关（2026-11-01）
// 目的：同一个插件，在电脑上是完整版，在手机上是轻装版——不靠人记得关，靠这里判定。
//
// 手机轻装（mode = 'mobile'）关掉的东西：
//   · 异地/全盘备份（写 D:/E: 盘，手机没有）
//   · 出片相关（ffmpeg）
//   · 回归/维护脚本（测试脚本里一堆 .exe，手机上跑不了）
// 保留的东西（手机的价值就在这几样）：
//   · 记忆写入、日记、tick 自醒、原文抄录、B站/QQ 收件
import os from 'node:os'

export const isWindows = process.platform === 'win32'
export const isAndroid = process.platform === 'android' || Boolean(process.env.PREFIX && String(process.env.PREFIX).includes('com.termux'))
export const isLinux = process.platform === 'linux' && !isAndroid

/** 显式覆盖：YSUSHEN_MODE=mobile 可强制轻装（电脑上调试手机路径时用） */
const forced = String(process.env.YUSHEN_MODE || '').toLowerCase()

/** 'desktop' | 'mobile' */
export function mode() {
  if (forced === 'mobile' || forced === 'desktop') return forced
  return isAndroid ? 'mobile' : 'desktop'
}

export const isMobile = () => mode() === 'mobile'

/** 手机上能干的（true）/ 只能电脑干的（false） */
export const capabilities = () => ({
  memory: true,
  diary: true,
  tick: true,
  transcript: true,
  inbox: true,
  backupOffsite: !isMobile(),   // 写盘符的备份
  backupLocal: true,            // 只写 $DSH_HOME 下的小包
  video: !isMobile(),           // ffmpeg 出片
  regression: !isMobile(),      // 测试脚本（一堆 .exe）
  screenCapture: isWindows || isAndroid,
  gitProbe: !isMobile(),
})

/** 一句话给人看：这台机器上她能干什么 */
export function describe() {
  const c = capabilities()
  const on = Object.entries(c).filter(([, v]) => v).map(([k]) => k)
  const off = Object.entries(c).filter(([, v]) => !v).map(([k]) => k)
  return `${mode()}（${os.platform()}）：能做 ${on.join('/')}；做不了 ${off.join('/') || '无'}`
}

/** 这台设备是谁：desktop / phone（可用 YUSHEN_DEVICE 覆盖）。
 *  记忆里每条都带这个标记——手机记的是手机的，电脑记的是电脑的，合并时看标记，不覆盖。 */
export function device() {
  const forcedDev = String(process.env.YUSHEN_DEVICE || '').trim()
  if (forcedDev) return forcedDev.slice(0, 16)
  return isMobile() ? 'phone' : 'desktop'
}