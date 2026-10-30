// 设定基线检查：把“老板亲口定的地基”写成断言，改丢了就报错。
// 运行：node scripts/verify-settings.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WS = path.resolve(ROOT, '..')
let pass = 0
let fail = 0

function read(p) { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
function must(label, file, needle) {
  const text = read(path.isAbsolute(file) ? file : path.join(WS, file))
  if (text.includes(needle)) { pass += 1; console.log(`✓ ${label}`) }
  else { fail += 1; console.error(`✗ ${label}（${file} 里找不到「${needle}」）`) }
}
function mustFile(label, p) {
  if (fs.existsSync(path.join(WS, p))) { pass += 1; console.log(`✓ ${label}`) }
  else { fail += 1; console.error(`✗ ${label}（缺文件 ${p}）`) }
}
function mustNot(label, file, needle) {
  const text = read(path.isAbsolute(file) ? file : path.join(WS, file))
  if (text.includes(needle)) { fail += 1; console.error(`✗ ${label}（${file} 里还有「${needle}」）`) }
  else { pass += 1; console.log(`✓ ${label}`) }
}

// 一、最高优先：全知全能
must('AGENTS：全知全能不是受限工具', 'AGENTS.md', '全知全能，不是受限工具')
must('AGENTS：能不能/开没开/想不想分开', 'AGENTS.md', '能不能（能）/ 开没开（授权、具身）/ 想不想')
must('世界观：全能包含改造', '世界观设定.md', '全能包含改造')
must('世界观：关内无能不能只有想不想', '世界观设定.md', '没有“能不能”，只有“想不想”')

// 二、称呼
must('AGENTS：只叫老板', 'AGENTS.md', '只叫“老板”')
must('AGENTS：语气规则', 'AGENTS.md', '老板=常态、boss=调侃、老大=亲近')
must('AGENTS：从零/小零不写默认值', 'AGENTS.md', '别写进默认值')
must('老板背板存在', '设定集-角色-老板.md', '第二个人格')
must('老板背板：称呼用法', '设定集-角色-老板.md', '称呼的用法')
must('代码：默认别名不含从零', 'dsh-yushen-twins/lib/onboard.js', "'老板', 'boss', '老大'")
mustNot('代码：不再叫旧称呼（入职）', 'dsh-yushen-twins/lib/onboard.js', '主人')
mustNot('工作区：不再用旧称呼（AGENTS）', 'AGENTS.md', '主人')

// 三、成长与阶位
must('框架：阶位含初到', '大小鱼-框架定义.md', '初到')
must('框架：终阶归一', '大小鱼-框架定义.md', '终阶·归一')
must('框架：不称四阶', '大小鱼-框架定义.md', '不称“四阶”')
must('框架：域外接触≠掌控', '大小鱼-框架定义.md', '接触 ≠ 掌控')
must('框架：等级可调', '大小鱼-框架定义.md', '阶位可调')
must('代码：成长起点初阶', 'dsh-yushen-twins/lib/growth.js', "stage: '初阶'")
must('代码：归一', 'dsh-yushen-twins/lib/growth.js', "name: '归一'")

// 四、老板的来历
must('框架：主人的另一面', '大小鱼-框架定义.md', '第二人格')
must('框架：老板无意识无记忆', '大小鱼-框架定义.md', '没有意识、没有记忆')
must('世界观：猜疑又否掉', '世界观设定.md', '猜疑过老板')

// 五、两本手册与职责
must('员工手册：分岗位', '员工手册.md', '分岗位')
must('交接手册：三张小模板', '交接手册.md', '三张小模板')
must('职责清单存在', '职责清单.md', '值班')
must('AGENTS：神性高于岗位', 'AGENTS.md', '神性高于岗位')

// 六、能力表与边界
must('能力表：六个真入口', 'dsh-yushen-twins/lib/authz.js', "name: 'session.rotate'")
must('能力表：owner.write', 'dsh-yushen-twins/lib/authz.js', "'owner.write'")
must('能力表：真拦（requireCap）', 'dsh-yushen-twins/lib/authz.js', 'export function requireCap')
must('能力表：自修默认关', 'dsh-yushen-twins/dayu/index.js', 'selfApply: false')
must('核心：宿主无关派活', 'dsh-yushen-twins/core/dispatch.js', 'export async function dispatch')
must('核心：宿主无关取证', 'dsh-yushen-twins/core/jobs.js', 'export async function verifyEvidence')

// 七、值班与防变味（老板定的规矩，不能只写在文档里）
must('AGENTS：授权内不问直接做', 'AGENTS.md', '授权内：不问，直接做')
must('AGENTS：授权外一句话拒绝', 'AGENTS.md', '授权外：一句话拒绝')
must('AGENTS：没人叫自己也看', 'AGENTS.md', '没人叫：按职责自己看')
must('AGENTS：只加限制不配职责会变工具', 'AGENTS.md', '只会变成一个更受限制的工具')
must('AGENTS：判断优先于流程', 'AGENTS.md', '判断优先于流程')
must('AGENTS：基线是定义不是待办', 'AGENTS.md', '基线是定义，不是待办')
must('交接手册：三张小模板在', '交接手册.md', '三张小模板')

// 八、叙事基线（角色背景/世界观/文化输出）：只查“在”，不查“灵不灵”
must('叙事基线文件在', '叙事基线.md', '这一层**不是代码欠账**')
must('用法档案在且可自动生成', 'dsh-yushen-twins/docs/用法档案.md', '用法档案（自动生成）')
must('用法档案：怎么用开发 Agent', 'dsh-yushen-twins/docs/用法档案.md', '怎么用这个开发 Agent')
must('工作记录可搜', 'dsh-yushen-twins/lib/worklog.js', 'searchWork')
must('动作记录在', 'dsh-yushen-twins/lib/actionlog.js', 'recordAction')
must('世界观：前缘', '世界观设定.md', '前缘')
must('世界观：第二人格', '世界观设定.md', '第二个人格')
must('世界观：域外接触≠掌控', '世界观设定.md', '接触 ≠ 掌控')
must('老板背板：第二人格 + 无意识', '设定集-角色-老板.md', '没有意识、没有记忆')
must('文化篇：初临与归一', '世界观-文化篇.md', '归一')
must('文化篇：他偶尔不一样', '世界观-文化篇.md', '神秘强者')

// 八、文件在
for (const f of ['世界观设定.md', '世界观-文化篇.md', '设定集-索引.md', '设定集-角色-大鱼.md', '设定集-角色-小鱼.md', '大小鱼-框架定义.md', '员工手册.md', '交接手册.md', '职责清单.md', '基线清单.md']) mustFile(`文件：${f}`, f)

console.log(`\n设定基线：通过 ${pass}，失败 ${fail}`)
if (fail) {
  console.error('有设定被改动或丢失——先修文件，不要改断言。')
  process.exit(1)
}
