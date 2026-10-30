// core · 魂与派活（只读文件，不依赖宿主）

import { readJson } from './store.js'

/** 她是谁：persona.json；没有就返回 null，不编。 */
export function soul() {
  return readJson('soul/persona.json', null)
}

/** 宪章：版本、身份、权限。 */
export function charter() {
  return readJson('charter.json', null)
}

/** 派活单：new → old。 */
export function jobs() {
  const list = readJson('dispatch.json', [])
  return Array.isArray(list) ? list : []
}

export function openJobs() {
  return jobs().filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
}

/** 她的概况：给 CLI/新宿主看的一眼。 */
export function profile() {
  const s = soul()
  const c = charter()
  return {
    name: s?.owner?.callName || s?.name || '大鱼',
    soulVersion: s?.version || '',
    charterVersion: c?.version || '',
    jobs: jobs().length,
    open: openJobs().length,
  }
}
