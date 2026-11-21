/* 标签
 * id: test-reply-sense
 * kind: module
 * tags: 测试, 回不回, 关系档位
 * created: 2026-11-04 14:30:00
 * changed: 2026-11-04 14:30:00
 * author: 照微·工作台
 * authority: 老板（2026-11-04：回不回靠关系好感，不摇骰子）
 * why: 判断一旦回到"概率"，人工就没法解释为什么这次没回；这条把每条判据钉住
 * result: 九种情形逐条断言，改判据时这里会红
 * mutable: 可改
 */
// 回不回：九种情形（主人/点名/私聊/熟人/见过/生人/累了×2/她说不说）
import assert from 'node:assert/strict'

const { decide, tierOf, DEFAULT_SENSE } = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/lib/reply-sense.js')

// 档位
assert.equal(tierOf({ isOwner: true }), 'owner')
assert.equal(tierOf({ familiarity: DEFAULT_SENSE.closeMin }), 'close')
assert.equal(tierOf({ familiarity: DEFAULT_SENSE.knownMin }), 'known')
assert.equal(tierOf({ familiarity: 0 }), 'stranger')

// 1~3：三条"不是概率"的规矩
assert.equal(decide({ scene: 'group', isOwner: true }).reply, true, '主人不该被概率挡住')
assert.equal(decide({ scene: 'group', addressed: true }).reply, true, '被点名必须回')
assert.equal(decide({ scene: 'private' }).reply, true, '私聊必须回')

// 4~6：群里按熟不熟
assert.equal(decide({ scene: 'group', familiarity: 8 }).reply, true, '熟人该回')
assert.equal(decide({ scene: 'group', familiarity: 3 }).reply, true, '见过面的该回')
assert.equal(decide({ scene: 'group', familiarity: 0 }).reply, false, '群里生人闲聊不该回')

// 7~8：累了——熟人照回，见过的不硬撑
assert.equal(decide({ scene: 'group', familiarity: 8, fatigue: 80 }).reply, true, '累了也该回熟人')
assert.equal(decide({ scene: 'group', familiarity: 3, fatigue: 80 }).reply, false, '累了就别在群里硬撑')

// 7b：生人——先礼貌，再按"感觉"（2026-11-04 老板：生人看感觉，基本礼貌要有；
//     主动接触的先聊几句看看，喜欢就继续，不喜欢就不说）
{
  const first = decide({ scene: 'group', firstContact: true })
  assert.equal(first.reply, true, '生人主动来搭话，连礼貌都不给？')
  assert.match(first.why, /礼貌/)
  assert.equal(decide({ scene: 'group', warmth: 0.6 }).reply, true, '聊得来该继续')
  assert.equal(decide({ scene: 'group', warmth: 0.2 }).reply, false, '聊不到一块去还在硬聊')
  assert.equal(decide({ scene: 'group', warmth: 0.9, hostile: true }).reply, false, '对方不客气还继续')
  assert.equal(decide({ scene: 'group', firstContact: true, hostile: true }).reply, false, '一上来就不客气，连礼貌都省了')
}

// 9：她自己写的「这轮不说」最高优先，连主人都挡
{
  const r = decide({ scene: 'group', isOwner: true, quiet: true })
  assert.equal(r.reply, false, '她说不说，居然被"主人"盖掉了')
  assert.match(r.why, /这轮不说/)
}

// 每条判断都得能念给人听：why 不许空
for (const c of [{ scene: 'group' }, { scene: 'group', familiarity: 9 }, { scene: 'private' }, { scene: 'group', isOwner: true }]) {
  const r = decide(c)
  assert.ok(r.why && r.why.length >= 2, `判断没有理由：${JSON.stringify(c)}`)
}

// 策略可调（那是她的手感）：把 closeMin 调高，8 句就不再算熟人
assert.equal(decide({ scene: 'group', familiarity: 8, policy: { closeMin: 10 } }).tier, 'known')

// 7c：2026-11-04 老板追问「生人不说话不接触怎么变熟人」——所以：双向算熟度、冷却后重开、不永久拉黑
{
  assert.equal(decide({ scene: 'group', ourTurns: 1, warmth: 0.25 }).reply, true, '我们应过一句，也是熟度的起点')
  assert.equal(decide({ scene: 'group', warmth: 0.2 }).reply, false, '冷却中先不接')
  assert.equal(decide({ scene: 'group', warmth: 0.2, cooldownPassed: true }).reply, true, '冷却过了要再给一次机会，不然源头堵死')
  assert.match(decide({ scene: 'group', warmth: 0.2, cooldownPassed: true }).why, /再应一句/)
}

console.log(`回不回：主人/点名/私聊/熟人/见过/生人/累了×2/她说不说/理由不空/阈值可调/双向熟度与冷却 都过`)
