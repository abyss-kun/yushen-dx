// 隐私：落盘前抹敏感信息；命中的要标出来，不能被当成没发生。
import assert from 'node:assert/strict'
import { redact, hasSecret } from '../lib/redact.js'

const cases = [
  ['api_key = sk-1234567890abcdef123456', 'API密钥|键值密钥'],
  ['Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop', 'Bearer'],
  ['password: hunter2hunter2', '键值密钥'],
  ['卡号 6222 0212 3456 7890 123 转账', '银行卡'],
  ['身份证 11010119900101123X', '身份证'],
  ['电话 13812345678 找我', '手机号'],
]
for (const [input, kind] of cases) {
  const out = redact(input)
  assert.equal(out.redacted, true, input)
  assert.match(out.text, /\[已隐藏:/, input)
  assert.doesNotMatch(out.text, /1234567890abcdef|hunter2|6222 0212|11010119900101123X|13812345678/, input)
  assert.ok(out.hits.some((h) => new RegExp(kind).test(h.rule)), `${input} -> ${JSON.stringify(out.hits)}`)
}

// 普通对话不误伤
assert.equal(hasSecret('今天天气不错，我们去看看海'), false)
assert.equal(redact('第 3 版，20 条记录，2026-10-25').redacted, false)

// 文本原样保留，只换敏感段
const keep = redact('在群里说：password=abcd1234，然后回车').text
assert.match(keep, /在群里说：/)
assert.match(keep, /然后回车/)

console.log(JSON.stringify({ ok: true, cases: cases.length, noFalsePositive: true }))
