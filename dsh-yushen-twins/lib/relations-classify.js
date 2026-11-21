/* 标签
 * id: lib-relations-classify
 * kind: module
 * summary: 关系判定：两条结论之间到底是哪种关系（2026-11-03 老板：「与其说分歧，不如说问题」）
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: sim / eventKey / classifyPair（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// 关系判定：两条结论之间到底是哪种关系（2026-11-03 老板：「与其说分歧，不如说问题」）。
//
// 判的先后顺序很重要：先看「是不是同一件事」再谈「说法冲不冲突」。
//   同一对象 + 同一时间窗 + 互斥   → 分歧
//   同一对象 + 不同时间窗 + 一成一败 → 问题（开待查单，不是分歧）
//   不同对象 / 不同时间             → 事实（都留，排时间线）
//   后一条明说改了口              → 演进（旧标 superseded）
//   后一条只是加细节              → 补充
//   字数/单位不同但说的是一个数      → 口径（同一个数）
//   条件不同                      → 分情况（不是矛盾）
//   说了「不算 / 说错了」          → 撤回
//
// 全部是规则，不调模型。判不出来的返回 unknown，交给上层决定要不要问模型。
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const digits = (s) => (String(s || '').match(/\d+(?:\.\d+)?/g) || [])

// 二字组 Jaccard
export function sim(a, b) {
  const g = (s) => {
    const t = String(s || '').replace(/\s+/g, '')
    const out = new Set()
    for (let i = 0; i + 2 <= t.length; i++) out.add(t.slice(i, i + 2))
    return out
  }
  const A = g(a); const B = g(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / new Set([...A, ...B]).size
}

const RULES = {
  supersede: /(改成|改为|纠正|不再|换成|替换|覆盖|推翻|作废|取消|只留|只保留|全删|去掉|按角色|分开)/,
  retract: /(不算|说错|作废|撤回|当我没说|别记|删掉)/,
  scoped: /(如果|假如|当.*时|情况下|谷时|峰时|工作日|周末|万一)/,
  success: /(完成|成功|通过|搞定|跑通|一致|正常)/,
  fail: /(缺|没|未|失败|有问题|不一致|停|断|漏|坏)/,
}

/** 事件键：同一对象 + 同一时间窗。用来区分「两次不同的备份」和「同一次备份的两种说法」。
 *  只取「主题词 + 日期 + 时段（上午/下午/晚上/深夜）」，宁可粗，不要假精确。 */
export function eventKey({ subject = '', head = '', at = '' } = {}) {
  const day = String(at || '').slice(0, 10)
  const hh = Number(String(at || '').slice(11, 13))
  const slot = Number.isFinite(hh) ? (hh < 6 ? '深夜' : hh < 12 ? '上午' : hh < 18 ? '下午' : '晚上') : ''
  const topic = String(subject || head || '').slice(0, 8).replace(/[^\w一-龥]/g, '')
  return [topic, day, slot].filter(Boolean).join('-')
}

/** 单位换算后比较数字（4.9GB vs 5000MB 这类别当矛盾）。 */
function sameNumber(a, b) {
  const na = digits(a); const nb = digits(b)
  if (!na.length || !nb.length) return false
  if (na.length !== nb.length) return false
  return na.every((x, i) => Math.abs(Number(x) - Number(nb[i])) < 1e-9)
}

/**
 * 判两条结论的关系。
 * @returns {{type:'duplicate'|'supersede'|'retract'|'scoped'|'accuracy'|'unit'|'issue'|'divergence'|'fact'|'unknown', why:string, eventA:string, eventB:string}}
 */
export function classifyPair(a, b) {
  const ta = norm(a?.head || a?.text || a?.stance)
  const tb = norm(b?.head || b?.text || b?.stance)
  const ea = eventKey({ subject: a?.subject, head: ta, at: a?.at })
  const eb = eventKey({ subject: b?.subject, head: tb, at: b?.at })
  const s = sim(ta, tb)
  const sameEvent = ea === eb
  const later = String(b?.at || '').localeCompare(String(a?.at || '')) >= 0
  const laterText = later ? tb : ta
  const base = { eventA: ea, eventB: eb }

  if (s >= 0.8) return { ...base, type: 'duplicate', why: `几乎同一句（相似 ${s.toFixed(2)}）` }
  if (RULES.retract.test(tb)) return { ...base, type: 'retract', why: '后一条说了不算/说错' }
  // 改口信号可能落在任一条里（「纠正判断」常写在新的那条，「不再/改成」也常在被覆盖前的说明里）
  if (RULES.supersede.test(tb) || RULES.supersede.test(ta)) {
    // 两边都只是"有条件"的写法时不当演进（分情况优先）
    if (!(RULES.scoped.test(ta) && RULES.scoped.test(tb))) return { ...base, type: 'supersede', why: '有一条明说改了口/换了做法' }
  }
  if (sameNumber(ta, tb)) return { ...base, type: 'unit', why: '数字相同，只是写法不同' }
  if (s >= 0.45 && digits(ta).length && digits(tb).length && !sameNumber(ta, tb)) {
    return { ...base, type: 'accuracy', why: '同一件事，数字更准了（后者覆盖）' }
  }
  if (RULES.scoped.test(ta) || RULES.scoped.test(tb)) return { ...base, type: 'scoped', why: '各自有适用条件' }
  if (!sameEvent) {
    // 不同时间窗：一成一败 → 这是「问题」（该追为什么会坏），不是分歧
    const oneOk = RULES.success.test(ta) && RULES.fail.test(tb)
    const oneBad = RULES.fail.test(ta) && RULES.success.test(tb)
    if (oneOk || oneBad) return { ...base, type: 'issue', why: '同一件事，一次成一次败' }
    return { ...base, type: 'fact', why: '不同时间/不同对象的两件事' }
  }
  // 同一时间窗：真的互斥吗
  const opposite = (RULES.success.test(ta) && RULES.fail.test(tb)) || (RULES.fail.test(ta) && RULES.success.test(tb))
  if (opposite) return { ...base, type: 'divergence', why: '同一时段，一成一败' }
  if (s >= 0.5) return { ...base, type: 'supersede', why: '同一件事，后一条更全（覆盖前一条）' }
  return { ...base, type: 'unknown', why: '规则判不出，需要人看或问模型' }
}

export const RELATION_LABEL = {
  duplicate: '重复',
  supersede: '演进（后者覆盖）',
  retract: '撤回',
  scoped: '分情况',
  accuracy: '精度升级',
  unit: '口径（同一个数）',
  issue: '问题（一成一败，要查）',
  divergence: '分歧（同一时段互斥）',
  fact: '事实（不同时间的两件事）',
  unknown: '判不出',
}
