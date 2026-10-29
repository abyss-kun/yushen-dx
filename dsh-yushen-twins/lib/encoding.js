// 编码哨兵：收到一串问号/替换符，别当成她的话，先怀疑发送端编码坏了。
export function looksGarbled(text = '') {
  const s = String(text || '')
  if (s.trim().length < 6) return false
  const bad = (s.match(/[?？�]/g) || []).length
  return bad / s.length > 0.3
}
