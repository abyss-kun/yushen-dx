// 隐私分级：钱/档案/应用/文件/照片默认不说；奶茶这类日常可说可不说。
import assert from 'node:assert/strict'
import { classify, mayShare } from '../lib/privacy.js'

assert.equal(classify('今天喝了杯奶茶，挺甜').tier, 'S1')
assert.equal(classify('银行卡余额还有 3000').tier, 'S3')
assert.equal(classify('身份证 11010119900101123X').tier, 'S3')
assert.equal(classify('桌面上的那个 exe 我装好了').tier, 'S2')
assert.equal(classify('C:\\Users\\Administrator\\Desktop\\a.png').tier, 'S2')
assert.equal(classify('相册里那张照片删了').tier, 'S2')
assert.equal(classify('这个 bug 我修好了，测试通过').tier, 'S0')

// 对外：日常可以，私人和秘密不行
assert.equal(mayShare('今天喝了杯奶茶', 'qq').ok, true)
assert.equal(mayShare('银行卡余额 3000', 'qq').ok, false)
assert.equal(mayShare('桌面上那个 exe', 'bili').ok, false)
// 对主人：私人也能说
assert.equal(mayShare('银行卡余额 3000', 'owner').ok, true)

console.log(JSON.stringify({ ok: true, tiers: 5, share: 3 }))
