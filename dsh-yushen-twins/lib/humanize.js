/* 标签
 * id: lib-humanize
 * kind: module
 * summary: 白话层：给人看的文字，一律先过这里
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: plain / humanizeEvent（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// 白话层：给人看的文字，一律先过这里。
// 原则（2026-11-09 老板定）：
//   1) 不出现技术黑话（incident / job / payload / timeout 之类）；
//   2) 说人话，先讲"发生了什么、对你有啥影响、要你做什么"；
//   3) 数字带单位、时间带说法（"3 小时没动" 而不是 "3h stale"）；
//   4) 不确定的地方写"可能"，不装懂。

export const WORDS = {
  // 事件
  incident: '出了问题',
  incidents: '出的问题',
  job: '任务',
  jobs: '任务',
  ask: '有人找你',
  asks: '有人找你',
  restart: '重启',
  backup: '备份',
  sync: '同步',
  approval: '要你点头的事',
  // 状态
  ok: '没问题',
  failed: '没成功',
  error: '出了个错',
  warning: '要注意',
  timeout: '等太久了，没等到结果',
  offline: '掉线了',
  connected: '连上了',
  pending: '还没处理',
  done: '做完了',
  running: '正在跑',
  // 场面
  host: '后台',
  client: '界面',
  payload: '内容',
  endpoint: '接口',
}

// 把一句话里的技术词换成白话；保留原意，不改变量名/路径。
export function plain(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const [k, v] of Object.entries(WORDS)) {
    // 只换独立的英文词（前后不是字母/下划线），避免把变量名换坏
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9_])${k}([^A-Za-z0-9_]|$)`, 'gi'), (m, a, b) => a + v + b)
  }
  return out
}

// 事件 → 白话弹窗内容。每条都自带"发生了什么 / 要你做什么"。
export function humanizeEvent(kind, data = {}) {
  const at = data.at ? String(data.at).slice(11, 16) : ''
  if (kind === 'incident') {
    return {
      badge: '出了问题',
      title: data.title || '有件事没走通',
      body: `${data.what || '某个任务卡住了'}${at ? `（${at} 左右）` : ''}。\n可能原因：${data.why || '还没查出来'}。\n要我查还是先放着？`,
      confirmText: '我去看看',
      cancelText: '先放着',
    }
  }
  if (kind === 'ask') {
    return {
      badge: '有人找你',
      title: `「${data.who || '有人'}」在找你`,
      body: `「${data.text || '没说什么，只发了条消息'}」\n要现在回吗？`,
      confirmText: '去看看',
      cancelText: '稍后',
    }
  }
  if (kind === 'restart') {
    return {
      badge: '要先说一声',
      title: '真要重启？',
      body: '重启后会断开一下，正在跑的事会停住，重开就恢复。\n现在要跑的东西不多，这时候重启最省事。',
      confirmText: '那就重启',
      cancelText: '再等等',
    }
  }
  if (kind === 'notice') {
    return {
      badge: '说一声',
      title: data.title || '有件事做完了',
      body: data.body || '做完了，跟你说一声。',
      confirmText: '知道了',
      cancelText: '好',
    }
  }
  return { badge: '提醒', title: data.title || '有件事', body: data.body || '' }
}

export default { WORDS, plain, humanizeEvent }
