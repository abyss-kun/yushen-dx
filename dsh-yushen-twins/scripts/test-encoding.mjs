// 编码哨兵：问号串要拦住；正常中文/英文不误伤。
import assert from 'node:assert/strict'
import { looksGarbled } from '../lib/encoding.js'

assert.equal(looksGarbled('????????????????????????????????'), true)
assert.equal(looksGarbled('你好，我是小鱼，我在。'), false)
assert.equal(looksGarbled('What? Really?'), false)
assert.equal(looksGarbled('???'), false) // 太短，不当乱码
assert.equal(looksGarbled('小鱼，你现在能回话吗？'), false)

console.log(JSON.stringify({ ok: true, catchesMojibake: true, noFalsePositive: true }))
