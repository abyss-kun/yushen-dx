// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-encoding
 * kind: module
 * summary: 编码哨兵：收到一串问号/替换符先怀疑发送端编码坏了，别当成她的话。
 * tags: 编码, 乱码, 哨兵
 * created: 2026-11-11 01:20:00
 * changed: 2026-11-11 01:20:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 路由层、桥、维护者
 * owner: 框架；判据只许更准
 * mutable: 可改阈值；不许把"像乱码"判成正常
 * usage: looksGarbled(text) → true/false；命中就别当内容
 * why: 中文环境里编码一坏，整段变问号，还容易被当成她乱说话
 * result: 一个纯判定函数
 */
// 编码哨兵：收到一串问号/替换符，别当成她的话，先怀疑发送端编码坏了。
export function looksGarbled(text = '') {
  const s = String(text || '')
  if (s.trim().length < 6) return false
  const bad = (s.match(/[?？�]/g) || []).length
  return bad / s.length > 0.3
}
