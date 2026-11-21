/* 标签
 * id: lib-marker-rules
 * kind: module
 * summary: 每层必须带的标记清单；少一个就报告，防止“往上减内容时把功能也减掉”。
 * tags: 标记, 覆盖, 身份键, 出处键, 对账
 * created: 2026-11-12 21:20:00
 * changed: 2026-11-12 21:24:02
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：最底层标记最全；减了会改功能就不许减）
 * audience: 维护者、脚本、未来接层的人
 * owner: 框架；清单可以加，不能悄悄减
 * mutable: 可改；减标记必须同时改 test-marker-coverage 并说明功能去哪了
 * usage: MARKERS[layer], missingMarkers(layer,row) → 缺失字段数组
 * why: 只看内容容易漏坐标；把“每层必须有什么”写成清单，回归能先发现
 * result: 缺 turnId/ref/rawRef/fp/state 这类键会在测试/审计里露出来
 */
export const MARKERS = Object.freeze({
  raw: ['type', 'seq'],
  turn: ['turnId', 'sessionId', 'turn', 'source', 'refs', 'filter'],
  coarse: ['turnId', 'sessionId', 'turn', 'ref', 'rawRef', 'fp', 'state', 'filterVersion', 'keep', 'filterWhy'],
  pending: ['id', 'kind', 'at', 'turnId', 'sessionId', 'turn', 'ref', 'rawRef', 'fp', 'state', 'filterVersion'],
  inuse: ['turnId', 'sessionId', 'turn', 'ref', 'rawRef', 'fromRef', 'fp', 'kind', 'head'],
  session: ['sessionId', 'startedAt', 'endedAt', 'turns'],
})

export function missingMarkers(layer, row) {
  const keys = MARKERS[layer]
  if (!keys) return [`未知层：${layer}`]
  if (!row || typeof row !== 'object') return keys.slice()
  return keys.filter((k) => row[k] === undefined || row[k] === null || row[k] === '')
}
