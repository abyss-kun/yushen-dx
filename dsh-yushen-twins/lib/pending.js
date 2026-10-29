// 「投出去的活，等的是哪一句回话」——只有投递之后说出来的那句才算数。
//
// 为什么要时间戳：事件流是有积压的。投递前就已经发出的那条回话，可能比投递晚几毫秒才被处理；
// 只按会话 id 认，就会把它当成这一轮的回复——通道标错、同一句写两遍，真回复反而漏标。
// 所以每次投递记一个时间点，拿事件自己的 time 比一比：早于投递的一律不算，继续等。
export function markPending(map, key, value, at = Date.now()) {
  map.set(String(key), { value, at: toMs(at) || Date.now() })
}

// 事件时间有的地方给毫秒、有的地方给秒，统一成毫秒再比。
export function toMs(value) {
  const n = Number(value) || 0
  if (!n) return 0
  return n < 1e12 ? n * 1000 : n
}

// 认领一次回复：认到了就删掉这条待办并返回它的 value；那条是投递前发出的，就返回 null 并留着继续等。
export function takePending(map, key, eventAt) {
  const id = String(key)
  const row = map.get(id)
  if (!row) return null
  const at = toMs(eventAt)
  if (at && row.at && at < row.at) return null
  map.delete(id)
  return row.value
}

// 只看不认领：有的地方要先判长短/内容再决定认不认，删早了就丢了这次待办。
export function peekPending(map, key, eventAt) {
  const id = String(key)
  const row = map.get(id)
  if (!row) return null
  const at = toMs(eventAt)
  if (at && row.at && at < row.at) return null
  return row.value
}
