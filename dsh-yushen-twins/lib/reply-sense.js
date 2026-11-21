/* 标签
 * id: lib-reply-sense
 * kind: module
 * tags: 回不回, 关系档位, 好感, 不掷骰子
 * created: 2026-11-04 14:10:00
 * changed: 2026-11-11 00:47:31
 * author: 照微·工作台
 * authority: 老板（2026-11-04：「希望回不回是靠感觉关系好感，而不是摇骰子」）
 * why: 桥里现在有一条 skipProbability 掷骰子——同样的对话，这次回下次不回，没法解释也没法改
 * result: 换成可解释的档位判断：主人/被点名/私聊 → 回；群里闲聊 → 按"熟不熟"决定；她写的「这轮不说」优先
 * mutable: 可改
 * audience: 桥（回不回）、面板
 * owner: 框架；档位阈值改之前先问老板
 * defaults: 主人/被点名/私聊 → 回；群里按熟不熟；她写了"这轮不说"优先
 * usage: decide({scene,isOwner,addressed,familiarity,fatigue}) → {reply,tier,why}；tierOf 只看档位
 * off: 桥不调它就等于不用（但那就回到掷骰子，不建议）
 * summary: 「这轮回不回」的档位判断：主人/点名/私聊→回，群里按熟，她写的"这轮不说"优先。
 */
// 「这轮回不回」的判断（2026-11-04）：不掷骰子。
//
// 输入全是**看得见的东西**：
//   scene       'private' | 'group'
//   isOwner     是不是主人本人
//   addressed   被 @ / 被引用 / 被叫名字
//   familiarity 最近 7 天这个人在这个会话里说了几句（可数）
//   fatigue     疲劳 0~100（她有身体，累了就少说）
//   quiet       她本人写的「这轮不说」（lib/quiet-turn.js），优先于一切
//
// 输出 { reply, tier, why }，理由能念给人听。
//
// 档位：
//   owner   主人本人
//   close   熟人（近 7 天 ≥ closeMin 句）
//   known   见过（近 7 天 ≥ knownMin 句）
//   stranger 生人（更少，或从没说过）
//
// 判据：
//   · 她写了「这轮不说」→ 一定不回（她的判断最高）
//   · 私聊 / 被点名 / 主人 → 回（不是概率，是规矩）
//   · 群里闲聊：close/known → 回；stranger → 先礼貌应一句，再按"暖度"决定要不要继续
//   · 疲劳 ≥ fatigueQuiet → 只回 close 及以上（累了不硬撑）
export const DEFAULT_SENSE = Object.freeze({
  closeMin: 6,        // 近 7 天说过 ≥6 句 = 熟人
  knownMin: 2,        // ≥2 句 = 见过
  fatigueQuiet: 70,   // 疲劳到这个数，群里只回熟人
  warmMin: 0.4,       // 生人的"暖度"到这个数才继续聊（礼貌那一下不算）
})

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0))

export function tierOf({ isOwner = false, familiarity = 0, policy = {} } = {}) {
  const p = { ...DEFAULT_SENSE, ...(policy || {}) }
  if (isOwner) return 'owner'
  const n = clamp(familiarity, 0, 10000)
  if (n >= p.closeMin) return 'close'
  if (n >= p.knownMin) return 'known'
  return 'stranger'
}

/**
 * @returns {{reply:boolean, tier:string, why:string}}
 *
 * 2026-11-04 老板追问：「生人不说话不接触那怎么变成熟人呢？从源头就堵死了」——
 * 对。所以熟度不是"只数对方说了几句"，而是**双向的**：
 *   theirTurns 对方说过几句（我们在回、在接话，也算一次来往）
 *   ourTurns   我们回过几句——**我们主动开口也是熟度的来源**
 *   encounters 在多少个不同场合同一个人出现过（不同群/私聊）
 * 而且"聊不来"只封这一阵，不封一辈子：cooldown 过了就再给一次礼貌机会（cooldownPassed）。
 */
export function decide({ scene = 'group', isOwner = false, addressed = false, familiarity = 0, fatigue = 0, quiet = false, firstContact = false, warmth = 0, hostile = false, cooldownPassed = false, ourTurns = 0, policy = {} } = {}) {
  const p = { ...DEFAULT_SENSE, ...(policy || {}) }
  const tier = tierOf({ isOwner, familiarity, policy: p })
  if (quiet) return { reply: false, tier, why: '她写了「这轮不说」——按她的判断' }
  if (isOwner) return { reply: true, tier, why: '主人本人' }
  if (addressed) return { reply: true, tier, why: '被点名/被引用：明确在跟她说话' }
  if (scene === 'private') return { reply: true, tier, why: '私聊：一对一，回' }
  // 群里闲聊
  if (Number(fatigue) >= p.fatigueQuiet) {
    return tier === 'close'
      ? { reply: true, tier, why: `累了（疲劳 ${Math.round(Number(fatigue))}），但这是熟人` }
      : { reply: false, tier, why: `累了（疲劳 ${Math.round(Number(fatigue))}），群里先不接` }
  }
  if (tier === 'close') return { reply: true, tier, why: `熟人（近 7 天说过 ${clamp(familiarity, 0, 9999)} 句）` }
  if (tier === 'known') return { reply: true, tier, why: '见过几面（近 7 天聊过）' }
  // 2026-11-04 老板：「生人看感觉，基本礼貌要有；他们主动接触了，可以先聊几句看看，喜欢就继续，不喜欢就不说。」
  // 生人不再一律闭嘴：主动来搭话的，先礼貌应一句；之后看"暖度"——聊得来就继续，聊不来就先不接；
  // 被骂/被逼做不该做的，礼貌也不再往下接。
  if (hostile) return { reply: false, tier, why: '对方不客气或想借她的手：礼貌到此为止' }
  if (firstContact) return { reply: true, tier, why: '生人主动来搭话：先应一句（基本礼貌）' }
  // 生人还没开过口、但我们接过话（ourTurns>0）——也是熟人这条路的起点：主动应一句不丢人。
  if (Number(ourTurns) > 0 && Number(warmth) >= p.warmMin * 0.5) {
    return { reply: true, tier, why: `还没聊开，但我们之前应过 ${Math.round(Number(ourTurns))} 次：再给一句` }
  }
  if (Number(warmth) >= p.warmMin) return { reply: true, tier, why: `聊得来（暖度 ${Number(warmth).toFixed(2)}）：继续几句` }
  // 聊不来不是拉黑：冷却过了就再给一次礼貌机会（不然源头就堵死了）
  if (cooldownPassed) return { reply: true, tier, why: '上次没聊开，隔了好一阵：再应一句看看' }
  return { reply: false, tier, why: `聊不到一块去（暖度 ${Number(warmth).toFixed(2)}）：这阵先不接，过些天再说` }
}
