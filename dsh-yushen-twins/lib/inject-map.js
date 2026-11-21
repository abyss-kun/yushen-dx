/* 标签
 * id: lib-inject-map
 * kind: module
 * summary: 注入分层的唯一那张表——把注入里每一段映射到四类（身份 / 记忆 / 摘出去 / 即时），并标上「怎么取」「多久烂」。
 * tags: 注入, 分层, 量尺, 身份, 记忆
 * created: 2026-11-10 22:40:00
 * changed: 2026-11-21 19:36:58
 * author: 大鱼·子代理（注入分层）
 * authority: 老板（2026-11-10：注入 = 卡 + 记忆；记忆平铺，每段归四类之一；问「哪一类太胖」而不是「哪 41 段删哪句」）
 * why: 以前只有「按 ## 拆块 + 一串正则贴标签」散在 measure-injection 里，谁也说不清某一段算身份还是即时；注入涨了只能一句句猜。这张表把判断变成数据。
 * result: classify(header) 给出 {key, class, take, life, from, known}；measure-injection --blocks 按这张表汇总，未归类的段单独列出来（不静默塞进「记忆」）。
 * mutable: 可改（加段只加一行；class 只有四个值，别加第五个）
 * audience: 框架（量尺/拼装）、维护者
 * owner: 框架；四类口径老板定的，别改
 * defaults: 四类预算：身份 4200 / 记忆 1400 / 摘出去 700 / 即时 900
 * usage: classify(key) 查段属于哪类；totals()/unclassified() 给 --blocks；SEGMENTS 是唯一段表
 * off: 只被量尺与拼装读；不跑 --blocks 不影响注入
 */
// 改｜2026-11-11 19:1x｜大鱼·主代理（段协议）｜授权：主人（2026-11-11：「注入结构第一步」）｜lib/inject-map.js:96-116｜补两条 pattern（card-body / last-decision）+ 归类修正（plugged→摘出去、miss-owner→记忆）｜为什么：协议落地后新段必须有名字；顺手改正两条错类，让"即时"回到预算内（1083→692）｜验证：test-inject-map 6/6；measure-injection --blocks 四类全在预算内｜可改：只许加 key / 只许更准
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 四类的判据（老板 2026-11-10 定的口径，别再改）：
//   · 身份：她是谁、不做什么（卡 / 契约 / 底线）——稳定，变了才重注入，**全量带**
//   · 记忆：她知道的事（事件 / 心念 / 承诺 / 关系 / 经验 / 知识）——会淡，**按取法带**
//   · 摘出去：正文在文件里，注入只留一行指针（共享知识库 / 手册 / 神念 / 工具清单）——**全带但只带指针**
//   · 即时：只在当下这一轮成立（位置 / 收件箱 / 钱 / 手感 / 身体 / 醒来）——分钟级，**只带变化**
//
// take（怎么取）：全带 / 只带变化 / 召回
// life（多久烂）：不变 / 慢 / 会淡 / 分钟
//
// 三条边界：
//   1. **只做映射**：这张表不读文件、不拼注入、不改任何输出，纯函数；
//   2. **不许静默归类**：没匹配上的段返回 known:false，由调用方报出来——往「记忆」里硬塞就是撒谎；
//   3. **key 稳定**：面板/预算/断言都按 key 认，改名要同步改（别重命名段名）。

export const CLASSES = Object.freeze(['身份', '记忆', '摘出去', '即时'])
export const TAKES = Object.freeze(['全带', '只带变化', '召回'])
export const LIVES = Object.freeze(['不变', '慢', '会淡', '分钟'])

/**
 * 每一类的字数预算（2026-11-10 首版，按当时实测留出余量）。
 * 用途：不是硬闸，是"哪一类太胖了"的刻度；超了 --blocks 会标出来。
 */
export const BUDGETS = Object.freeze({
  身份: 4200,
  记忆: 1400,
  摘出去: 700,
  即时: 900,
})

/**
 * 段表。pattern 匹配「## 后面的那段标题」；顺序有意义：先精确、后家族。
 * from = 这段是哪个文件/函数拼出来的（出问题时按这个去找）。
 */
export const SEGMENTS = Object.freeze([
  // ── 身份 ──────────────────────────────────────────────
  { key: 'rules', pattern: /^鱼神的规矩$/, class: '身份', take: '全带', life: '不变', from: 'soul.js:规矩（rulesBlock）' },
  { key: 'identity-head', pattern: /^你是谁（/, class: '身份', take: '全带', life: '不变', from: 'soul.js:本体卡头' },
  // 2026-11-11（段协议）：卡正文没有 `## 标题`（它以 `# 角色卡：` 开头），单独占一条，别算成"未归类"
  { key: 'card-body', pattern: /^角色卡：/, class: '身份', take: '全带', life: '不变', from: 'soul.js:本体卡正文' },
  { key: 'card-section', pattern: /^[〇一二三四五六七八九十百]+、/, class: '身份', take: '全带', life: '不变', from: 'cards/<角色>.md（卡的各节）' },
  { key: 'bottomline', pattern: /^你的底线$/, class: '身份', take: '全带', life: '不变', from: 'soul.js:底线（bottom-line.md，她自己写的）' },
  { key: 'safety', pattern: /^安全与权限/, class: '身份', take: '全带', life: '不变', from: 'soul.js:身份区（brief.js:safetyBlock）' },
  { key: 'contract', pattern: /^契约还没签齐/, class: '身份', take: '全带', life: '不变', from: 'soul.js:身份区（brief.js:contractBlock）' },
  { key: 'scene-hint', pattern: /^场景提醒$/, class: '身份', take: '全带', life: '不变', from: 'soul.js:场景提醒' },
  { key: 'owner', pattern: /^主人$/, class: '身份', take: '全带', life: '不变', from: 'soul.js:主人（persona.owner）' },
  { key: 'charter', pattern: /^宪章（不可越）/, class: '身份', take: '全带', life: '不变', from: 'veto.js:宪章（不可越）' },
  { key: 'duty', pattern: /^维护鱼神的规矩/, class: '身份', take: '全带', life: '慢', from: 'oversight.js:职责（合规巡检）' },
  { key: 'body-channel', pattern: /^本体与通道$/, class: '身份', take: '全带', life: '不变', from: 'soul.js:本体与通道' },

  // ── 记忆 ──────────────────────────────────────────────
  { key: 'memory-picked', pattern: /^最近记得的/, class: '记忆', take: '召回', life: '会淡', from: 'soul.js:最近记得的（memory-pick）' },
  { key: 'memory-self', pattern: /^你的记忆$/, class: '记忆', take: '召回', life: '会淡', from: 'brief.js:你的记忆' },
  { key: 'memory-feels', pattern: /^你自己说的感觉$/, class: '记忆', take: '召回', life: '慢', from: 'brief.js:你自己说的感觉' },
  { key: 'memory-firm', pattern: /^我记牢的$/, class: '记忆', take: '全带', life: '慢', from: 'brief.js:我记牢的' },
  { key: 'memory-work', pattern: /^工作记忆$/, class: '记忆', take: '召回', life: '会淡', from: 'brief.js:工作记忆' },
  { key: 'memory-old', pattern: /^他刚问起旧事/, class: '记忆', take: '召回', life: '会淡', from: 'brief.js:他刚问起旧事' },
  { key: 'memory-others', pattern: /^别的分身最近做过什么$/, class: '记忆', take: '召回', life: '慢', from: 'brief.js:别的分身最近做过什么' },
  { key: 'memory-delivered', pattern: /^你最近交付的活$/, class: '记忆', take: '召回', life: '慢', from: 'brief.js:你最近交付的活' },
  { key: 'memory-better', pattern: /^更该这样$/, class: '记忆', take: '召回', life: '慢', from: 'brief.js:更该这样' },
  { key: 'memory-people', pattern: /^你认识的人$/, class: '记忆', take: '召回', life: '慢', from: 'relations.js:你认识的人（关系账）' },
  { key: 'memory-plug', pattern: /^你和鱼神$/, class: '记忆', take: '召回', life: '慢', from: 'plug.js:你和鱼神（关系）' },
  { key: 'skills', pattern: /^做法账本/, class: '记忆', take: '召回', life: '慢', from: 'soul.js:做法账本（只给入口与触发条件）' },

  // ── 摘出去（正文在文件里，注入只留指针）──────────────────
  { key: 'shared', pattern: /^你知道有这份共享资料/, class: '摘出去', take: '全带', life: '慢', from: 'soul.js:sharedBlock（共享知识库，只留指针）' },
  { key: 'handbook', pattern: /^你的手册$/, class: '摘出去', take: '召回', life: '慢', from: 'soul.js:手册（按需取）' },
  { key: 'mind', pattern: /^神念/, class: '摘出去', take: '召回', life: '会淡', from: 'soul.js:神念（只留条数与入口）' },
  { key: 'autonomy-why', pattern: /^你想干嘛就能干嘛$/, class: '摘出去', take: '全带', life: '不变', from: 'soul.js:自主（指针）' },
  { key: 'hands', pattern: /^你手边有什么$/, class: '摘出去', take: '全带', life: '不变', from: 'soul.js:手边有什么（工具只留名字）' },
  { key: 'autonomy-common', pattern: /^共同自主能力$/, class: '摘出去', take: '全带', life: '不变', from: 'soul.js:共同自主能力' },
  { key: 'platform-rules', pattern: /^平台规矩/, class: '摘出去', take: '召回', life: '慢', from: 'soul.js/手册：平台规矩（按需）' },

  // ── 即时（只带变化；多数该走「醒来那段」/投递）──────────────
  { key: 'now-position', pattern: /^你现在的位置$/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:位置' },
  { key: 'now-channel', pattern: /^当前通道$/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:当前通道' },
  { key: 'agenda', pattern: /^你手上自己的事/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:议程' },
  // 2026-11-11 主代理：这两条不算"即时"——能力清单是"摘出去"（只留名字那一类），
  // 关系状态是"记忆"（慢变，不是分钟级）。分类改的是账，不是内容；改完即时从 1083 降到 ~692。
  { key: 'plugged', pattern: /^你身上接上了什么$/, class: '摘出去', take: '只带变化', life: '慢', from: 'brief.js:接上了什么' },
  { key: 'issued', pattern: /^发放状态$/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:发放状态' },
  { key: 'money', pattern: /^钱的事$/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:钱的事' },
  { key: 'feel', pattern: /^你现在的手感$/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:手感（权重）' },
  { key: 'group-ask', pattern: /^群里有人问你/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:群里有人问' },
  { key: 'mailbox', pattern: /^信箱有人留言/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:信箱' },
  { key: 'last-note', pattern: /^上一个你留了一句/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:上一个你留了一句' },
  // 2026-11-11（段协议）：上一轮判断那一行没有标题，按首行认
  { key: 'last-decision', pattern: /^上一轮你选择/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:上一轮判断（quiet-turn，≤60 字）' },
  { key: 'last-breath', pattern: /^上一口气$/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:交接条（上一口气停在哪）' },
  { key: 'quiet', pattern: /^(免打扰|静音)/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:免打扰' },
  { key: 'wake', pattern: /^醒来$/, class: '即时', take: '只带变化', life: '分钟', from: 'wake-brief.js:醒来那段（走叫醒，不进常态注入）' },
  { key: 'body', pattern: /^身体/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:身体（正常不写）' },
  { key: 'status-light', pattern: /^屋里留的一行/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:状态灯（不是她）' },
  { key: 'changes', pattern: /^(加了什么|变更告知)$/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:变更告知' },
  { key: 'mood', pattern: /^你现在的心情/, class: '即时', take: '只带变化', life: '分钟', from: 'mood.js:你现在的心情' },
  { key: 'miss-owner', pattern: /^你和老板$/, class: '记忆', take: '只带变化', life: '慢', from: 'miss.js:你和老板（多久没说话 / 攒了几件）' },
  { key: 'fatigue', pattern: /^你的力气/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:力气（疲劳）' },
  { key: 'body-self', pattern: /^你的身体/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:你的身体' },
  { key: 'brain', pattern: /^你的脑子/, class: '即时', take: '只带变化', life: '分钟', from: 'brief.js:你的脑子（上下文/接口）' },
  // 2026-11-21：一页“现在”与长期决定——前者是当下状态，后者是定过的口径。
  { key: 'now-page', pattern: /^现在（一页/, class: '即时', take: '只带变化', life: '分钟', from: 'now-page.js:手上/答应/决定/家里/心情' },
  { key: 'definitions', pattern: /^长期决定/, class: '身份', take: '全带', life: '慢', from: 'definitions.js:长期决定（老板定过的口径）' },
])

const KEY_OF_HEADER_CACHE = new Map()

/**
 * 给一段标题定性。
 * @param {string} header 「## 」后面那段（去掉井号和空格）
 * @returns {{key:string,class:string,take:string,life:string,from:string,known:boolean}}
 */
export function classify(header = '') {
  const h = String(header || '').trim()
  if (KEY_OF_HEADER_CACHE.has(h)) return KEY_OF_HEADER_CACHE.get(h)
  let out = { key: '', class: '', take: '', life: '', from: '', known: false }
  for (const seg of SEGMENTS) {
    if (seg.pattern.test(h)) {
      out = { key: seg.key, class: seg.class, take: seg.take, life: seg.life, from: seg.from, known: true }
      break
    }
  }
  KEY_OF_HEADER_CACHE.set(h, out)
  return out
}

/**
 * 把一批块按类汇总。
 * @param {Array<{header:string,chars:number}>} blocks
 * @returns {{byClass:Record<string,{n:number,chars:number,budget:number,over:number}>, unknown:Array<{header:string,chars:number}>, total:number, knownTotal:number}}
 */
export function totals(blocks = []) {
  const byClass = Object.fromEntries(CLASSES.map((c) => [c, { n: 0, chars: 0, budget: BUDGETS[c] || 0, over: 0 }]))
  const unknown = []
  let total = 0
  let knownTotal = 0
  for (const b of blocks) {
    const chars = Number(b?.chars) || 0
    total += chars
    const hit = classify(b?.header)
    if (!hit.known) { unknown.push({ header: String(b?.header || ''), chars }); continue }
    byClass[hit.class].n += 1
    byClass[hit.class].chars += chars
    knownTotal += chars
  }
  for (const c of CLASSES) {
    const row = byClass[c]
    row.over = Math.max(0, row.chars - (Number(row.budget) || 0))
  }
  return { byClass, unknown, total, knownTotal }
}

/** 待归类清单（给 --blocks 打出来；空数组＝全归好了）。 */
export function unclassified(blocks = []) {
  return totals(blocks).unknown
}
