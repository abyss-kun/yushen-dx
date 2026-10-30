// 编码：UTF-8 严格解；GBK/GB18030 兜底；替换符要能识别。
import assert from 'node:assert/strict'
import { decodeBody, hasReplacement } from '../lib/body.js'

assert.equal(decodeBody(Buffer.from('{"text":"小鱼"}', 'utf8')), '{"text":"小鱼"}')
// “小鱼”的 GBK 字节：D0 A1 D3 E3
const gbk = Buffer.from([0x7b, 0x22, 0x74, 0x65, 0x78, 0x74, 0x22, 0x3a, 0x22, 0xd0, 0xa1, 0xd3, 0xe3, 0x22, 0x7d])
assert.equal(decodeBody(gbk), '{"text":"小鱼"}')
assert.equal(hasReplacement(decodeBody(Buffer.from('{"text":"\uFFFD\uFFFD"}', 'utf8'))), true)
assert.equal(hasReplacement(decodeBody(Buffer.from('{"text":"小鱼"}', 'utf8'))), false)

console.log(JSON.stringify({ ok: true, utf8: true, gbkFallback: true, replacementDetected: true }))
