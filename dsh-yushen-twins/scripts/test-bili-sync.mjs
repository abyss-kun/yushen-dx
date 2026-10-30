// 刷B站人设同步：只写它自己的人设字段；用户自己写的人设不覆盖；每次都留备份。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-bili-'))
process.env.DSH_HOME = HOME
const SOUL = path.join(HOME, 'dayu', 'soul')
fs.mkdirSync(path.join(SOUL, 'cards'), { recursive: true })
fs.mkdirSync(path.join(SOUL, 'memory'), { recursive: true })
fs.writeFileSync(path.join(HOME, 'dayu', 'characters.json'), JSON.stringify({
  version: 1,
  characters: [{ id: 'xiaoyu', name: '小鱼', alias: '阿鲤', title: '小鱼·管家', cards: { desk: 'cards/xiaoyu.desk.md' }, memory: 'memory/xiaoyu.json' }],
}), 'utf8')
fs.writeFileSync(path.join(SOUL, 'cards', 'xiaoyu.desk.md'), '# 小鱼\n我是阿鲤。\n', 'utf8')
fs.writeFileSync(path.join(SOUL, 'memory', 'xiaoyu.json'), JSON.stringify({ version: 1, summary: '在刷B站', habits: ['会多问一句'], dynamics: [] }), 'utf8')

const bili = await import('../lib/bili-sync.js')
const CONFIG = path.join(HOME, 'bili-duty', 'config.json')

// 1) 没装刷B站：不动
assert.equal(bili.syncBiliPersona({ configPath: CONFIG }).ok, false)

// 2) 空人设：写进去，带标记和备份
fs.mkdirSync(path.dirname(CONFIG), { recursive: true })
fs.writeFileSync(CONFIG, JSON.stringify({ perDay: 5, personaPrompt: '' }), 'utf8')
const first = bili.syncBiliPersona({ role: 'xiaoyu', configPath: CONFIG })
assert.equal(first.ok, true)
assert.equal(first.changed, true)
assert.ok(fs.existsSync(first.backup), '写之前要留备份')
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
assert.ok(cfg.personaPrompt.startsWith(bili.MARK))
assert.match(cfg.personaPrompt, /我是阿鲤/)
assert.doesNotMatch(cfg.personaPrompt, /在刷B站/, '无受众标记的旧记忆不得随同步披露')
assert.match(cfg.personaPrompt, /当前通道：B站/)
assert.equal(cfg.perDay, 5, '别的设置不能动')

// 3) 再跑一次：不重复写
const second = bili.syncBiliPersona({ role: 'xiaoyu', configPath: CONFIG })
assert.equal(second.changed, false)
assert.equal(second.ok, true)

// 4) 用户自己写的人设：默认不覆盖；--force 才覆盖
fs.writeFileSync(CONFIG, JSON.stringify({ personaPrompt: '我自己写的人设' }), 'utf8')
const refused = bili.syncBiliPersona({ role: 'xiaoyu', configPath: CONFIG })
assert.equal(refused.ok, false)
assert.match(refused.reason, /不覆盖/)
assert.equal(JSON.parse(fs.readFileSync(CONFIG, 'utf8')).personaPrompt, '我自己写的人设')
const forced = bili.syncBiliPersona({ role: 'xiaoyu', configPath: CONFIG, force: true })
assert.equal(forced.changed, true)
assert.ok(JSON.parse(fs.readFileSync(CONFIG, 'utf8')).personaPrompt.startsWith(bili.MARK))

// 5) dry-run 不写
fs.writeFileSync(CONFIG, JSON.stringify({ personaPrompt: '' }), 'utf8')
const dry = bili.syncBiliPersona({ role: 'xiaoyu', configPath: CONFIG, dryRun: true })
assert.equal(dry.changed, false)
assert.equal(JSON.parse(fs.readFileSync(CONFIG, 'utf8')).personaPrompt, '')

fs.rmSync(HOME, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, backup: true, noOverwrite: true, dryRun: true }))
