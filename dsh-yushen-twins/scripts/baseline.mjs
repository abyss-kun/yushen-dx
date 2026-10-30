// 基线检查：把“鱼神插件该有什么”变成可查的清单。
// 缺什么直接报出来；不靠人记，也不靠老板提醒。
// 运行：node scripts/baseline.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WS = path.resolve(ROOT, '..')
let pass = 0
let fail = 0
const missing = []

function check(name, fn) {
  try { fn(); pass += 1; console.log(`✓ ${name}`) }
  catch (e) { fail += 1; missing.push(name); console.error(`✗ ${name} — ${e?.message || e}`) }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const has = (rel, needle) => { if (!read(rel).includes(needle)) throw new Error(`${rel} 里没有「${needle}」`) }
const file = (rel) => { if (!fs.existsSync(path.join(ROOT, rel))) throw new Error(`缺 ${rel}`) }

// 一、能起来
check('入口可加载 + apply', () => { file('index.js'); has('index.js', 'export async function apply') })
check('两条鱼动态加载', () => has('index.js', "await import('./dayu/index.js')"))
check('启动标记 boot.json', () => has('index.js', 'boot.json'))
check('客户端入口存在', () => { file('client.js'); has('client.js', 'slot') })

// 二、能活
check('魂/宪章/白纸', () => { file('lib/seed.js'); file('kernel/charter.default.json'); file('blank/persona.blank.json') })
check('账本/派活/事故/成长', () => { for (const f of ['lib/growth.js', 'lib/incidents.js', 'core/jobs.js', 'core/dispatch.js']) file(f) })
check('就职写回人格', () => has('lib/onboard.js', 'persona.json'))
check('老板设置进开场', () => has('dayu/index.js', 'ownerBlock'))

// 三、能自救
check('崩溃留痕', () => { file('lib/crash.js'); has('index.js', 'guard(') })
check('重启 + 重启后验证', () => { has('index.js', 'restart.ps1'); has('index.js', 'restart-attempt.json') })
check('自省', () => { file('lib/selfcheck.js'); has('dayu/index.js', 'runSelfCheckOnce') })
check('自写补丁 + 回滚', () => { file('lib/patch.js'); has('lib/patch.js', 'rolled-back') })

// 四、能证明
check('冒烟', () => { file('scripts/smoke.mjs'); has('scripts/smoke.mjs', 'regression') })
check('回归清单', () => file('scripts/regression.mjs'))
check('设定基线', () => file('scripts/verify-settings.mjs'))
check('真机验收', () => file('scripts/live-check.mjs'))
check('基线清单文档', () => { if (!fs.existsSync(path.join(WS, '基线清单.md')) && !fs.existsSync(path.join(ROOT, 'docs', '基线清单.md'))) throw new Error('缺 基线清单.md') })

// 五、能交付
check('README', () => file('README.md'))
check('权属三件', () => { for (const f of ['LICENSE', 'NOTICE', 'THIRD_PARTY.md']) file(f) })
check('CHANGELOG', () => file('CHANGELOG.md'))
check('手册在', () => {
  const inPkg = path.join(ROOT, 'docs', '员工手册.md')
  const inWs = path.join(WS, '员工手册.md')
  if (!fs.existsSync(inPkg) && !fs.existsSync(inWs)) throw new Error('缺 员工手册')
  const hand = path.join(WS, '交接手册.md')
  if (!fs.existsSync(hand)) throw new Error('缺 交接手册')
})
check('搬家包', () => { file('lib/migrate.js'); has('lib/migrate.js', 'checksum') })

// 六、守规矩
check('鉴权', () => { file('lib/auth.js'); has('lib/auth.js', 'timingSafeEqual') })
check('能力表真拦', () => { file('lib/authz.js'); has('lib/authz.js', 'requireCap') })

console.log(`\n基线：通过 ${pass}，失败 ${fail}`)
if (fail) {
  console.error(`缺 ${fail} 项：${missing.join('、')}`)
  process.exit(1)
}
