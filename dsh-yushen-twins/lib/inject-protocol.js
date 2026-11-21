/* 标签
 * id: lib-inject-protocol
 * kind: module
 * summary: 注入段协议：每一段都是 {key, text, from, owner, take, life, class}；拼装层只产出段，不再直接吐字符串。
 * tags: 注入, 段协议, 拼装, 身份, 记忆
 * created: 2026-11-11 19:1x
 * changed: 2026-11-11 19:16:49
 * author: 大鱼·主代理（段协议）
 * authority: 主人（2026-11-11：「注入结构第一步：段协议；行为零变化，不动内容/顺序/字数」）
 * why: 现在注入是 soul.js / brief.js 各自 `parts.push(字符串)`，段落没有名字、没有归属；想按段取、按段删、按段量都做不到。协议把"一段话"变成"一条可寻址的记录"。
 * result: seg() 造段、joinSegments() 拼回原文（逐字节一致）、SegText 是能记录 key 的数组（现有拼装代码不用大改）；key 优先用 inject-map 的段名。
 * mutable: 可改（分隔符由调用方传，不许在这里统一；不许引入副作用）
 * audience: 拼装层（soul.js / brief.js）、量尺、维护者
 * owner: 框架；改它等于改"注入怎么被寻址"，要老板点头
 * usage: new SegText('soul') 替代 const parts=[]；joinSegments(segs) 替代 parts.join('\n\n')
 * off: 不用它也能跑（拼装层退回字符串数组），但段就没有名字了
 */
// 改｜2026-11-11 19:1x｜大鱼·主代理（段协议）｜授权：主人（2026-11-11：「注入结构第一步」）｜lib/inject-protocol.js:1-109｜新增：seg / joinSegments / SegText / keyOf｜为什么：注入原来是 parts.push(字符串)，段没有名字，"按段取/按段删/按段量"都做不到｜验证：scripts/test-inject-protocol.mjs 6/6；A/B 逐字节一致（归一化时间/计数）；regression 294/0｜可改：可改（分隔符由调用方传，别在这里统一；不许引入副作用）
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 三条边界：
//   1. **不改内容**：协议只给每段贴名字，不增删一个字；分隔符由调用方传（soul 用 '\n\n'，brief 用 '\n\n'，
//      将来哪个改成 '\n' 也不许在这里替它改）。
//   2. **key 先查段表**：能对上 inject-map 的标题就用段表 key（rules / bottomline / …），
//      对不上才用 `<prefix>:h-<标题>`；没有标题的用 `<prefix>:<hint>` 或 `<prefix>:body`。
//   3. **纯函数**：不读文件、不写东西、不调模型。
import { classify } from './inject-map.js'

function slug(s, n = 12) {
  return String(s || '').replace(/[\s（）()【】\[\]·—－:：/\\]/g, '').slice(0, n)
}

/** 这段的标题（`## XXX` 的第一行）；没有就空串。 */
export function headingOf(text) {
  const m = String(text ?? '').match(/^##\s*([^\n]{1,40})/)
  return m ? m[1].trim() : ''
}

/**
 * 给一段文本起 key。
 * @param {string} text
 * @param {string} prefix soul / brief
 * @param {string} [hint] 没有标题时用的短名
 */
export function keyOf(text, prefix = 'seg', hint = '') {
  const t = String(text ?? '')
  const h = headingOf(t)
  const firstLine = t.split('\n')[0].replace(/^#+\s*/, '').trim()
  // 先按 `## 标题` 查表；没有标题的（卡正文、上一轮判断那种）按首行再查一次
  for (const probe of [h, h ? '' : firstLine]) {
    if (!probe) continue
    try {
      const c = classify(probe)
      if (c && c.known) return c.key
    } catch { /* 表坏了就用兜底 key，不许因此丢段 */ }
  }
  if (h) return `${prefix}:h-${slug(h)}`
  return `${prefix}:${slug(hint) || 'body'}`
}

/**
 * 造一段。
 * @returns {{key:string,text:string,from:string,owner:string,take:string|null,life:string|null,class:string|null}|null}
 */
export function seg(key, text, { from = '', owner = '', take = null, life = null, class: cls = null } = {}) {
  const t = String(text ?? '').trim()
  if (!t) return null
  return { key: String(key || ''), text: t, from: String(from || ''), owner: String(owner || ''), take, life, class: cls }
}

/** 把段拼回文本。分隔符由调用方给（默认 '\n\n'），保证与旧拼装逐字节一致。 */
export function joinSegments(segments, sep = '\n\n') {
  return (Array.isArray(segments) ? segments : [])
    .filter(Boolean)
    .map((s) => (typeof s === 'string' ? s : String(s.text ?? '')))
    .filter((t) => t !== '')
    .join(sep)
}

/**
 * 能记录 key 的字符串数组：`push(text, hint)`，`join()` 行为不变。
 * 这样 soul.js / brief.js 的拼装代码只需要换一行 `const parts = []`，其余 push 原样保留。
 */
export class SegText extends Array {
  constructor(prefix = 'seg') {
    super()
    this.prefix = String(prefix || 'seg')
    this.keyList = []
  }

  push(item, hint = '') {
    if (item === null || item === undefined) return this.length
    const text = String(item)
    if (!text) return this.length
    this.keyList.push(keyOf(text, this.prefix, hint))
    return super.push(text)
  }

  keyAt(i) { return this.keyList[i] || `${this.prefix}:body` }

  /** 转成段数组（空段丢掉）。 */
  segments() {
    const out = []
    for (let i = 0; i < this.length; i += 1) {
      const s = seg(this.keyAt(i), this[i], { from: this.prefix })
      if (s) out.push(s)
    }
    return out
  }
}
