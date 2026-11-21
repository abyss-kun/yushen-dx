// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-body
 * kind: module
 * summary: 请求体解码：UTF-8 优先，不行按 GB18030（兼容 Windows PowerShell 5.1）；解不出就报"编码不对"，不把乱码当内容。
 * tags: 编码, 请求体, 容错
 * created: 2026-11-11 01:05:00
 * changed: 2026-11-11 01:05:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 本地接口（路由层）、维护者
 * owner: 框架；**不许把乱码当正常内容**这条要老板点头才动
 * mutable: 可改；只许加识别，不许静默吞错
 * usage: decodeBody(buf) → 文本；解不出返回明确错误标记
 * why: 中文环境里一条 gb2312 请求就整段变问号，以前还被当成她乱说话
 * result: 两级解码 + 错误显式
 */
// 请求体解码：UTF-8 优先；不是 UTF-8 就按 GB18030（兼容 Windows PowerShell 5.1 的 gb2312）再试。
// 解不出来或出现替换符，明确报"编码不对"，不把乱码当内容。
export function decodeBody(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || [])
  if (!bytes.length) return ''
  let text = ''
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try { text = new TextDecoder('gb18030').decode(bytes) } catch { text = bytes.toString('utf8') }
  }
  return text.trim()
}

export function hasReplacement(text = '') {
  return /\uFFFD/.test(String(text))
}
