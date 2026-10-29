// 鱼神 · 首次启动播种
// 出厂版：第一次跑时把 blank 白纸复制到数据目录，让新老板从“空”开始，而不是从作者的记忆开始。
// 作者版：数据已存在，什么都不做。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BLANK = path.join(ROOT, 'blank', 'persona.blank.json')
const KERNEL_CHARTER = path.join(ROOT, 'kernel', 'charter.default.json')

/** 只在真正“空”的时候播种；已有任何数据就不碰。 */
export function seedIfBlank() {
  const result = { seeded: [], skipped: [] }
  try {
    const soulFile = path.join(DATA, 'soul', 'persona.json')
    if (!fs.existsSync(soulFile) && fs.existsSync(BLANK)) {
      fs.mkdirSync(path.dirname(soulFile), { recursive: true })
      fs.copyFileSync(BLANK, soulFile)
      result.seeded.push('soul/persona.json')
    } else {
      result.skipped.push('soul/persona.json')
    }

    const charterFile = path.join(DATA, 'charter.json')
    if (!fs.existsSync(charterFile) && fs.existsSync(KERNEL_CHARTER)) {
      fs.mkdirSync(DATA, { recursive: true })
      fs.copyFileSync(KERNEL_CHARTER, charterFile)
      result.seeded.push('charter.json')
    } else {
      result.skipped.push('charter.json')
    }

    if (result.seeded.length) {
      const eventsDir = path.join(DATA, 'events')
      fs.mkdirSync(eventsDir, { recursive: true })
      fs.appendFileSync(
        path.join(eventsDir, `${new Date().toISOString().slice(0, 10)}.jsonl`),
        JSON.stringify({ at: new Date().toISOString(), type: 'seed', text: `首次启动播种：${result.seeded.join('、')}` }) + '\n',
      )
    }
  } catch (e) {
    result.error = String(e?.message || e)
  }
  return result
}
