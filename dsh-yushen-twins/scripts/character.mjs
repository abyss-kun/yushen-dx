// 角色名册的老板入口：看有谁、加一个、绝不动已有文件。
// 用法：
//   ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/character.mjs list
//   ... scripts/character.mjs add aria "阿丽亚" --title="阿丽亚·常驻" --card=D:\path\card.md
//   ... scripts/character.mjs where
import fs from 'node:fs'
import path from 'node:path'
import { listCharacters, addCharacter, SOUL_DIR, MANIFEST } from '../lib/characters.js'
import { soulStatus } from '../lib/soul.js'

const [action, ...rest] = process.argv.slice(2)

function flag(name) {
  const hit = rest.find((x) => x.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}

if (action === 'list' || !action) {
  const rows = listCharacters()
  console.log(`角色目录：${SOUL_DIR}`)
  console.log(`名册文件：${fs.existsSync(MANIFEST) ? MANIFEST : '（没有，按 persona.json / 出厂名单）'}`)
  for (const c of rows) {
    const s = soulStatus(c.id)
    console.log(`- ${c.id} · ${c.name}${c.alias ? `（${c.alias}）` : ''} · 会话标题「${c.title}」· 卡 ${s.card.chars} 字 · 记忆 ${s.habits}+${s.dynamics} 条${c.builtin ? ' · 出厂' : ''}`)
  }
  process.exit(0)
}

if (action === 'where') {
  console.log(JSON.stringify({ soulDir: SOUL_DIR, manifest: MANIFEST, exists: fs.existsSync(MANIFEST) }, null, 2))
  process.exit(0)
}

if (action === 'add') {
  const [id, name] = rest.filter((x) => !x.startsWith('--'))
  const cardFile = flag('card')
  let card = ''
  if (cardFile) {
    card = fs.readFileSync(cardFile, 'utf8') // 读不到就报错，不静默
  }
  try {
    const c = addCharacter({ id, name, alias: flag('alias'), title: flag('title'), card, cwd: flag('cwd') })
    console.log(`已加：${c.id} · ${c.name} · 会话标题「${c.title}」`)
    console.log(`卡：${path.relative(SOUL_DIR, c.cards.desk)}`)
    console.log('下一步：把卡写完整（她是谁、在意什么、能做什么、不能做什么、底线），再在工作台叫醒她。')
  } catch (error) {
    console.error(`没加成：${error?.message || error}`)
    process.exitCode = 1
  }
  process.exit(process.exitCode || 0)
}

console.error('用法：list | add <id> <name> [--title=… --alias=… --card=… --cwd=…] | where')
process.exitCode = 1
