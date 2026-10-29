// 隐私：落盘和注入之前先抹一遍。宁可少记，不可外泄。
// 纯函数，不联网、不调模型；只做模式匹配，不保证 100%，所以还配合"不记无关私聊"的边界。
const RULES = [
  { name: '私钥', re: /-----BEGIN[\s\S]*?-----END[^-]*-----/g },
  { name: 'API密钥', re: /\b(?:sk|ghp|gho|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}/g },
  { name: 'Bearer', re: /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi },
  { name: '键值密钥', re: /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|passcode|token|cookie)\s*[:=：]\s*[^\s,;，；]{4,}/gi },
  { name: '银行卡', re: /\b(?:\d[ -]?){16,19}\b/g },
  { name: '身份证', re: /\b\d{17}[\dXx]\b/g },
  { name: '手机号', re: /\b1[3-9]\d{9}\b/g },
]

/** 把明显敏感的东西换成 [已隐藏:类型]。返回 {text, hits}。 */
export function redact(input = '') {
  let text = String(input ?? '')
  const hits = []
  for (const rule of RULES) {
    let count = 0
    text = text.replace(rule.re, () => { count += 1; return `[已隐藏:${rule.name}]` })
    if (count) hits.push({ rule: rule.name, count })
  }
  return { text, hits, redacted: hits.length > 0 }
}

/** 只问"有没有"，不返回原文。 */
export function hasSecret(input = '') {
  return redact(input).redacted
}
