/* 标签
 * id: lib-wake-score
 * kind: module
 * summary: 一条群/私聊消息值不值得把她叫醒——纯规则打分，四档输出（必醒/该醒/可代发/可睡），不调模型。
 * tags: 唤醒, 权重, 桥, 代发, 规则
 * audience: 桥（决定叫不叫她）、新装的角色
 * owner: 框架；权重数字和档位要老板点头才能改
 * defaults: 档位 70/40/15；信号与权重见实现
 * usage: scoreMessage(msg,{familiarity,followups}) → {score,band,signals,greeting,toOthers}；band 四档
 * off: 桥改成"每条都醒"就等于不用它（不建议：那会把别人的聊天都当成找她）
 * created: 2026-11-10 23:00:00
 * changed: 2026-11-11 00:47:31
 * author: 大鱼·主代理（第三批）
 * authority: 主人（2026-11-10 21:5x：「桥：可以加个权重判定……有没有@她，指定她，谁说的话，谁对谁说的，是和她说的还是对别人说的」）
 * why: 以前桥只有"被唤醒就回"和几条死配置；谁在叫她、是不是在跟别人说话、催了几次，全没进判据
 * result: scoreMessage() 给分和档位，每条信号都进 why（能念给人听）；纯函数，可单测
 * mutable: 可改（权重数字可以调；判据只增不减；**不许在这里调模型**）
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 为什么要"对谁说"这一维：群里大部分话不是冲她说的。以前只要被唤醒就整段读、整段回，
// 等于把别人的聊天都当成找她。加上"没点名 + 没有第二人称"→ 扣分，才分得出"你们聊"和"叫我"。
//
// 边界：本模块**不调模型、不读通道、不写任何东西**，只做一道算术。

export const BANDS = Object.freeze({
  必醒: 70,
  该醒: 40,
  可代发: 15,
})

/** 礼貌寒暄：这类不叫醒、按关系代发一句（0 token）。 */
export const GREET_RE = /^(在吗|在不在|早上好|早安|早|晚安|晚上好|睡了?吗|吃饭了吗|吃了吗|哈+|哈哈+|嘿嘿|谢谢|谢了|辛苦了|辛苦|你好|您好|嗨|hi|hello|在么)[!！。.~～?？\s]*$/i

/**
 * 一条消息值不值得叫醒。
 * @param {{text?:string, atMe?:boolean, isOwner?:boolean, kind?:'group'|'private', name?:string}} msg
 * @param {{familiarity?:number, followups?:number}} [ctx] familiarity: 0 生 / 1 一般 / 2 熟；followups: 同一人 5 分钟内已发几条
 * @returns {{score:number, band:string, signals:Array<{name:string,delta:number}>, greeting:boolean, toOthers:boolean}}
 */
export function scoreMessage(msg = {}, { familiarity = 0, followups = 0 } = {}) {
  const text = String(msg.text || '').replace(/\s+/g, ' ').trim()
  const isOwner = msg.isOwner === true
  const isPrivate = String(msg.kind || '') === 'private'
  const atMe = msg.atMe === true
  const greeting = GREET_RE.test(text)
  const hasSecondPerson = /你|您/.test(text)
  const isQuestion = /[?？]/.test(text) || /吗|呢|怎么|什么|哪|谁|为什么|能不能|可不可以/.test(text)
  // 对别人说：没点名、不是老板、也不是私聊，而且这句话里没有"你/您"
  const toOthers = !atMe && !isOwner && !isPrivate && !hasSecondPerson

  const signals = []
  const add = (name, delta) => { if (delta) signals.push({ name, delta }) }
  if (isOwner) add('老板本人', 50)
  if (isPrivate) add('私聊', 45)
  if (atMe) add('点她的名', 40)
  if (isQuestion) add('在问她', 20)
  if (toOthers) add('在对别人说', -30)
  if (familiarity >= 2) add('熟人', 20)
  else if (familiarity <= 0) add('生人', -10)
  const extra = Math.max(0, Number(followups) || 0) - 1
  if (extra > 0) add(`连续追问 ${Math.min(extra, 3)} 条`, Math.min(extra, 3) * 15)
  if (greeting) add('礼貌寒暄', -20)

  let score = signals.reduce((a, s) => a + s.delta, 0)
  // 硬信号不许被其它扣分压下去（老板本人 / 私聊 / 点她的名 / 礼貌寒暄）：
  //   · 老板和私聊：再冷也至少「该醒」——不能把老板找我调成可睡
  //   · 点她的名：那是冲她来的，至少「必醒」
  //   · 寒暄：至少「可代发」——这正是"不回不好、回了浪费"那一档
  if ((isOwner || isPrivate) && score < BANDS.该醒) score = BANDS.该醒
  if (atMe && score < BANDS.必醒) score = BANDS.必醒
  if (greeting && score < BANDS.可代发) score = BANDS.可代发
  score = Math.max(0, Math.min(100, score))

  const band = score >= BANDS.必醒 ? '必醒'
    : score >= BANDS.该醒 ? '该醒'
      : score >= BANDS.可代发 ? '可代发'
        : '可睡'
  return { score, band, signals, greeting, toOthers }
}
