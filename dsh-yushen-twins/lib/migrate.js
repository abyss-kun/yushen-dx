// 鱼神双子星 · 搬家（导出 / 导入）
// 魂、宪章、鱼窝档案、开关、老板偏好——打成一个 JSON 包，能带走、能在另一台机器落下。
// 形象图片不塞进包（体积大），到新家再收养；这里只带“她是谁、定过什么”。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { workspace } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const BACKUP = path.join(DATA, 'backups')
const WORKSPACE = workspace()

const FILES = [
  ['soul', 'soul/persona.json'],
  ['charter', 'charter.json'],
  ['nest', 'nest/index.json'],
  ['switches', 'switches.json'],
  ['owner', 'owner.md'],
  ['handbook', 'docs/员工手册.md'],
]

const FORMAT = 'yushen-move-v2'

function readText(rel) {
  try { return fs.readFileSync(path.join(DATA, rel), 'utf8') } catch { return '' }
}

function digest(files) {
  return crypto.createHash('sha256').update(JSON.stringify({ format: FORMAT, files })).digest('hex')
}

export function exportBundle() {
  const files = {}
  for (const [key, rel] of FILES) {
    let text = readText(rel)
    // 员工手册在作品目录里，不在数据目录；第一次搬家顺手带上。
    if (!text && key === 'handbook') {
      try { text = fs.readFileSync(path.join(WORKSPACE, '员工手册.md'), 'utf8') } catch { /* 没有就算了 */ }
    }
    if (text) files[key] = { rel, text }
  }
  return {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    source: { host: os.hostname(), platform: process.platform },
    note: '形象图不随包；到新家再收养。宪章、魂、手册都在包里。',
    checksum: digest(files),
    files,
  }
}

export function importBundle(bundle) {
  if (!bundle || !String(bundle.format || '').startsWith('yushen-move-')) throw new Error('不是大小的搬家包（format 不对）')
  const files = bundle.files && typeof bundle.files === 'object' ? bundle.files : {}
  if (bundle.checksum && digest(files) !== bundle.checksum) throw new Error('搬家包校验不通过（可能被改过或传坏了）')
  const entries = Object.entries(files).filter(([, v]) => v && typeof v.text === 'string')
  if (!entries.length) throw new Error('包里没有可导入的文件')

  // 先备份，再写；写失败可以从备份回滚。
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(BACKUP, `import-${stamp}`)
  fs.mkdirSync(dir, { recursive: true })
  const imported = []
  for (const [key, value] of entries) {
    const rel = String(value.rel || '')
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue
    const target = path.join(DATA, rel)
    try {
      if (fs.existsSync(target)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
        fs.copyFileSync(target, path.join(dir, rel))
      }
    } catch { /* 备份失败也继续，尽量导入 */ }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const tmp = target + '.tmp'
    fs.writeFileSync(tmp, value.text, 'utf8')
    fs.renameSync(tmp, target)
    imported.push(key)
  }
  return { ok: true, imported, backup: dir }
}
