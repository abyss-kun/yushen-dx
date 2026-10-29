// 分身池：提前养几条待命的员工会话，派活时直接取，不用每次现开。
// 只记“谁待命”；会话本身归 DSH，宿主重启后按 id 对不上就丢弃。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'pool.json')
const MAX = 8

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return { workers: [] } }
}
function write(v) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2), 'utf8')
  fs.renameSync(tmp, FILE)
}

export function listWorkers() {
  return read().workers || []
}

export function addWorker({ id, name }) {
  const v = read()
  if (v.workers.some((w) => w.id === id)) return v.workers
  v.workers = [{ id, name: String(name || '').slice(0, 40), at: new Date().toISOString(), status: 'idle' }, ...(v.workers || [])].slice(0, MAX)
  write(v)
  return v.workers
}

export function removeWorker(id) {
  const v = read()
  v.workers = (v.workers || []).filter((w) => w.id !== id)
  write(v)
  return v.workers
}

/** 丢掉已经不存在/在跑的；返回还在待命的。 */
export function liveWorkers(sessions = []) {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  return listWorkers().map((w) => {
    const s = byId.get(w.id)
    return s ? { ...w, running: Boolean(s.running), title: s.title || w.name } : null
  }).filter(Boolean)
}
