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
