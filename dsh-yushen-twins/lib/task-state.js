// Task events affect expression only; never change persona, mood or diary.
import { recordFishState } from './state-adapter.js'

export function syncTaskState(tasks, role = 'dayu') {
  if (!['dayu', 'xiaoyu'].includes(role)) throw new Error('未知角色')
  const mine = tasks.filter((task) => (task.role || 'dayu') === role)
  const active = mine.find((task) => ['dispatched', 'redispatched'].includes(task.status))
  const returned = mine.find((task) => task.status === 'returned')
  const latest = active || returned || mine[0]
  const expression = active ? '工作' : returned ? '思考'
    : latest?.status === 'done' ? '完成' : latest?.status === 'aborted' ? '错误' : '平静'
  return recordFishState(role, { expression, lastReason: latest ? `任务 ${latest.id}：${latest.status}` : '没有活动任务' })
}
