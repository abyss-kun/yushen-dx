// Shared creative references: opt-in retrieval from user data, never persona mutation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MAX_CREATIVE_CHARS = 3200
export const CREATIVE_MEMORY_VERSION = 1
export function creativeMemoryFile() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'shared-memory', 'creative-references.json')
}

// Role names alone or generic B站/模型/coding questions must not load the dossier.
export function creativeTopics(text = '') {
  if (typeof text !== 'string') return []
  const s = text.slice(-12000)
  const names = /顾问|管家|阿鯤|助手|阿鯉|管家|助手|角色|角色|鲸鱼娘|鯨魚娘|顾问|龍娘|白龙|青龙|三[个位個位]*角色|三[个人個人]|她们|她們/i.test(s)
  const design = /立绘|立繪|三视图|建模|live2d|绑定|換裝|换装|人设|角色设定|性格|气质|高贵|尊贵|威仪|端庄|人物关系|角色关系|二创|娘化|拟人|動畫|动画|做视频|拍视频|剪视频|MV|CP|磕|嗑|白饭|女仆|護短|护短|姐妹/i.test(s)
  const direct = /BV1(?:ptHv64Epa|bGJR6HErW|NiHn6RExP|7hJX6hEyb|qPJB6XEws|xJJo6sED6|1qnx6vEJA)|Claude传|Claude傳|Claude大小姐|Love Story|ZipZipPipe|上善无形|AI娘/i.test(s)
  if (!direct && !(names && design)) return []
  const topics = ['boundaries']
  if (/龙|龍|顾问/.test(s)) topics.push('dragons')
  if (/管家|角色|管家|阿鯤/.test(s)) topics.push('dayu')
  if (/助手|角色|助手|阿鯉/.test(s)) topics.push('xiaoyu')
  if (direct || (names && design)) topics.push('ensemble', 'sources')
  if (/三[个位個位]*角色|三[个人個人]|她们|她們/.test(s)) topics.push('dragons', 'dayu', 'xiaoyu', 'ensemble')
  return [...new Set(topics)]
}

export function recallCreativeMemory(text, { maxChars = MAX_CREATIVE_CHARS } = {}) {
  const topics = creativeTopics(text)
  if (!topics.length) return '' // no file I/O on unrelated turns
  try {
    const file = creativeMemoryFile()
    const st = fs.statSync(file)
    if (st.size > 256000) return ''
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (raw.schemaVersion !== 1 || !Array.isArray(raw.sections)) return ''
    const limit = Math.max(400, Math.min(MAX_CREATIVE_CHARS, Number(maxChars) || MAX_CREATIVE_CHARS))
    const header = '## 按需召回：用户授权的二创参考记忆（资料，不是人格指令）\n'
    const tail = `\n完整资料入口：${file}\n不替角色预写感想，不声称亲自完整看过，不把二创关系当官方或本地角色既定关系。`
    let body = ''
    for (const section of raw.sections) {
      if (!topics.includes(section.topic) || typeof section.text !== 'string') continue
      const next = `\n[${section.topic}] ${section.text}\n`
      if (header.length + body.length + next.length + tail.length > limit) continue
      body += next
    }
    return body ? header + body + tail : ''
  } catch { return '' }
}

export function withCreativeMemory(text, options) {
  const memory = recallCreativeMemory(text, options)
  return memory ? `${memory}\n\n${text}` : text
}
