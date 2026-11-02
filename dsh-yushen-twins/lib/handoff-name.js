// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// 交接文件名：YYYY-MM-DD-HHMM.md（本机本地时间，精确到分钟）。
//
// 为什么单独一个文件：2026-10-31 体检发现「手册写一套命名、目录里叫另一套」，
// 自动写的那条又用的是 ISO 的 T/秒格式——三处各说各话。现在规则只在这里一份：
//   · 手册第四节写正则 + 人读的格式；
//   · dayu/index.js 的 writeHandoff 用 handoffName() 生成；
//   · scripts/regression.mjs 第 113 条把两边正文字面比对，并检查目录里已有的文件。
// 改格式就三处一起改；只改一处会让 113 当场红。
// 例子：2026-10-31-1905.md（= 2026-10-31 19:05）
export const HANDOFF_NAME_RE = /^\d{4}-\d{2}-\d{2}-\d{4}\.md$/

const pad = (n) => String(n).padStart(2, '0')

/** 按本地时间生成交接文件名（只给名字，不带目录）。 */
export function handoffName(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.md`
}

/** 从交接文件名还原显示用的时间：2026-10-31-1905.md → 「2026-10-31 19:05」；不合规就原样返回。 */
export function handoffDisplayTime(name) {
  const raw = String(name).replace(/\.md$/, '')
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/)
  if (m) return `${m[1]} ${m[2]}:${m[3]}`
  // 读旧自动档：2026-10-31T14-21-38（改规则前写的）——只兼容读，新写的只用新格式
  const legacy = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})$/)
  return legacy ? `${legacy[1]} ${legacy[2]}:${legacy[3]}` : raw
}
