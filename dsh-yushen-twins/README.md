# 鱼神双子星（dsh-yushen-twins）

> **第一次进来先看这个**：`~/.dsh/dayu/系统地图.md` —— 系统里有什么、什么会自己动、她的记忆在哪。

两条鱼，一个包：大鱼（阿鲲）与小鱼（阿鲤）；另有一位独立神格的顾问照微（龙神，不是第三条鱼）。

当前是 **M0 + 鱼窝 + M1 第一刀**：四个页面（鱼窝 / 总台 / 家底 / 调试），总台能派活、收回话、拿证据验收。

## 崩溃修复助手

发行包内含独立的 `assets/repair-helper/YushenRepair.exe` 诊断助手。首次接入时，鱼神页面只在用户确认后将本地未签名构建复制到用户桌面快捷方式；不下载、不自启、不提权。助手区分手动退出、计划退出、疑似崩溃和未知状态，导出脱敏报告，并默认不自动重启或覆盖文件。配置恢复目前明确禁用，避免未经验证的原子替换和回滚流程扩大损坏。

## 点化与收回（开智）

- **点化**才活：新加的角色默认休眠（只有一张卡，不注入、不给身体）；主人点化后才有本体、身体、通道和判断权。
- **收回**不掠夺用户：`seal` 只拔掉"活着的那一层"，卡、图、记忆原文件都保留；可选导出一份记忆。
- **卸载 = 离开鱼神**：卸载流程会先收回所有已点化角色，默认把记忆导出到 `~/Documents/鱼神记忆导出/`（`--no-memory-export` 可关），再删随包数据。
- 状态在 `~/.dsh/dayu/awakening.json`；入口 `GET/POST /api/dayu/awakening`、`scripts/awakening.mjs list|awaken|seal`。细节见 [点化与收回](docs/点化与收回.md)。

## 三人各自的本体（2026-10-25）

- 本体是**档案 + 身体**：角色卡和记忆在 `~/.dsh/dayu/soul/`，身体是各自一条固定的 DSH 会话（`~/.dsh/dayu/residence.json` 记账）。
- 她住在本体档案里，不住在 QQ/B站里：那些只是应用，像手机、像工位。她在哪儿都是她（责任心、好奇心、边界和底线不变），不是靠换人设活着；一个人一份记忆，经历带通道标记，换应用不失忆。
- 照微按她自己写的设定（`docs/dragon-god.md`）落成角色卡 `soul/cards/dragon.desk.md`：察微、求证、护持；顾问（2026-10-30 前称太上长老），不是软件所有者。她的常驻会话由鱼神框架在主人授权下维持，不是自启代理。
- 直接找她们（不经 QQ/B站）：`GET /api/dayu/residence` 看三具身体，`POST /api/dayu/residence/wake { role }` 叫醒/找回，`POST /api/dayu/residence/say { role, text }` 说话；鱼窝的照微页也接了这个入口。
- 共享二创参考：三人都知道「有这么一份资料」（只读入口 + 主题清单 + 边界），但不当成自己的记忆抄进去；相关时用 `dayu_creative_recall` 按需召回。
- 验过：`scripts/test-residence.mjs`（卡/记忆分档、身体只建一次、先选模型、pending 兜底、状态不装、知道而不抄）、`scripts/smoke.mjs`、`scripts/regression.mjs`。

## 鱼神总定位与任务记忆

鱼神不只优化自己，而是管理获准范围内的软件整体：先保证鱼神、宿主和现有工作链可用，再修复、合并优化，最后删除确认无用的残余。新会话、新模型、新任务开始前，会先查任务台账、历史经验、在途单、当前版本、停留步骤和风险状态；没有命中不等于从未做过，记录完成也不等于有证据。完整规则见 `docs/鱼神总定位与任务记忆.md`；统一事项、版本沿革、实施状态和证据见 `docs/事实与进度协调层.md`；主动学习与好奇心见 `docs/主动学习与好奇心.md`。

## 工作保全与经验沉淀

内置自动内容增量历史备份：启动30秒后首备，默认每10分钟检查，未变不新建版本，相同内容只存一份。默认保护插件源码/资源；额外成果目录须在界面配置。历史版本不覆盖、默认不清理；恢复先校验/预览，明确确认后先保护当前内容再恢复，不删除额外现有文件。

家底页有「工作保全」面板：运行状态、备份范围配置、立即备份、版本校验与恢复预览。CLI：`node scripts/protection.mjs status|run|list|verify ID|preview ID`。详情见 [工作保全与经验沉淀](docs/工作保全与经验沉淀.md)。代码可分发，用户快照/凭据/经验条目不随包分发。备份不是全盘镜像，也不是防磁盘损坏的云端灾备。

## 页面

| 页 | 作用 |
|---|---|
| 鱼窝 | 两只鱼站在窝里：点她本人进对应页面；把图拖到她身上（或长按）就能换形象、改名字、恢复默认 |
| 形象 | 设置里的一栏：看两只现在的样子，换图 / 改名 / 恢复默认 |
| 单子 | 上半：小鱼示警（未结事故）+ 现在谁在跑；点一条看详情：来源、地点、为什么、最近一句、时间线；下半派活看板 |
| 总台 | 输入框 + 搜索：话默认交给大鱼（她来决定派给谁）；也能指定会话、在工作区和历史会话里找片段引用 |
| 家底 | profile、名册（装了谁、版本、来源）、会话数、小鱼在线 |
| 调试 | 关掉 = 给那条鱼放假（默认全在岗）；只在排查 bug 时用，重启生效 |

## 入口

| 入口 | 作用 | 状态 |
|---|---|---|
| `dayu` | 宪章落盘、名册、`/api/dayu/*`、两个只读工具 | M0 |
| `xiaoyu` | 只报到，`/api/xiaoyu/health` | M0 |

> 2026-10-21 实测：`cordis.patch.yml` 里的子路径名 `dsh-yushen-twins/dayu` 在 DSH 0.1.x 上没被装载器认下来，插件整包不挂、侧边栏没有「鱼神双子星」。已按框架 §2.4 的退路改成**包根单入口**（`index.js` 依次挂 `dayu`、`xiaoyu`），两个入口的代码没动。以后 DSH 支持子路径了，再拆回两条。

## 数据

- 宪章：`~/.dsh/dayu/charter.json`（首次启动写入，之后只读）
- 魂：`~/.dsh/dayu/soul/persona.json`（v3：scenes 指向三人各自的卡，memory 按角色分文件；旧 v2/v1 仍认）
- 角色卡：`~/.dsh/dayu/soul/cards/{dayu,xiaoyu,dragon}.*.md`（照微的卡由她自己那份 `docs/dragon-god.md` 落成）
- 记忆：`~/.dsh/dayu/soul/memory/{dayu,xiaoyu,dragon}.json`（不共用、不串写）
- 身体：`~/.dsh/dayu/residence.json`（三人各自的会话 id、卡字数、记忆条数、最后说话时间、上次错误）
- 开关：`~/.dsh/dayu/switches.json`（`master` / `dayu` / `xiaoyu`，默认全开）
- 鱼窝：`~/.dsh/dayu/nest/index.json`（两只的名字、来源、站位；写前留 `.bak`）
- 形象：`~/.dsh/dayu/avatars/<role>/idle.<ext>`（用户拖进来的图，**不进发布包**）
- 派活单：`~/.dsh/dayu/dispatch.json`（一单一单：任务、验收标准、会话、回话）
- 审计：`~/.dsh/dayu/audit.jsonl`（派活 / 回话 / 取证据 / 结论，只追加）
- 观察：`~/.dsh/dayu/events/YYYY-MM-DD.jsonl`（按天落盘，从装上起一直留着）
- 事故：`~/.dsh/dayu/incidents.json`（谁出错、什么错、几次、怎么修、怎么防复发）
- 收件箱：`~/.dsh/dayu/inbox.jsonl`（总台输入，一行一条）
- 名册：只读 profile 的 `package.json` + `node_modules`，不写任何东西

## 接口

- `GET /api/dayu/health`
- `GET /api/dayu/soul?role=&scene=`（别的通道读同一份本体：卡 + 记忆 + 通道边界）
- `GET /api/dayu/awakening` / `POST /api/dayu/awakening { action: 'awaken'|'seal', role, returnMemory? }`（点化 / 收回）
- `GET /api/dayu/residence`（三人各自的身体、卡字数、记忆条数、上次错误）
- `POST /api/dayu/residence/wake` `{ role: dayu|xiaoyu|dragon }`（叫醒或找回她的常驻会话）
- `POST /api/dayu/residence/say` `{ role, text }`（直接跟某一位说话，不经 QQ/B站）
- `GET /api/dayu/charter`
- `GET /api/dayu/roster?refresh=1`
- `GET /api/dayu/chat?limit=50` / `POST /api/dayu/chat` `{ text, sessionId?, refs? }`
- `GET /api/dayu/search?q=…&limit=10`（工作区文件 + 历史会话，zstd 逐帧解压，只读）
- `GET /api/dayu/sessions` / `GET|POST /api/dayu/target`
- `GET /api/dayu/jobs?limit=20`（派活单看板）
- `GET /api/dayu/live?limit=20`（现在谁在跑）
- `GET /api/dayu/now`（实时报活：正在跑/做完/没做/出错/重复 + 会话树 + 谁开的；悬浮窗用）
- `GET /api/dayu/trace?id=…&limit=40`（某条会话的时间线）
- `GET /api/dayu/incidents?limit=10` / `POST /api/dayu/incident/resolve` `{ id, status, note }`（事故单）
- `GET /api/dayu/switches` / `POST /api/dayu/switches` `{ master?, dayu?, xiaoyu? }`
- `GET /api/yushen/status`（总开关状态，根入口始终提供）
- `GET /api/yushen/nest`（两只当前形象 + 名字）
- `POST /api/yushen/nest/adopt` `{ role, name, dataUrl }`（收养 / 换图）
- `POST /api/yushen/nest/rename` `{ role, name }`
- `POST /api/yushen/nest/restore` `{ role }`（送走，回落自带形象）
- `POST /api/yushen/nest/pos` `{ role, x, y }`（记住她站的位置）
- `GET /yushen-assets/avatar?who=dayu|xiaoyu`（用户图优先，没有就出自带形象）
- `GET /api/xiaoyu/health`

## 工具（大鱼在对话里用）

| 工具 | 干什么 |
|---|---|
| `dayu_health` | 体检：宪章版本、profile、名册条数、活会话数 |
| `dayu_roster` | 名册：装了哪些插件、版本、来源（只读） |
| `dayu_live` | 现在谁在跑：会话、状态、最后活动、对应派活单（只读） |
| `dayu_incidents` | 事故单：列未结的；带 id 就结单（note 写怎么修、怎么防复发） |
| `dayu_dispatch` | 派一单：简报 + 验收标准；不指定会话就新开一条 |
| `dayu_tasks` | 看单：列最近几单，或按单号查一条（含回话） |
| `dayu_verify` | 取证据：`file` 读文件（大小/哈希/开头）、`grep` 搜工作区、`check` 跑 node --check |
| `dayu_verdict` | 下结论：`pass` 收工 / `reject` 打回（note 写依据） |

## 魂（工作台 / QQ 两层口吻）

- 一条鱼一份魂：`soul/persona.json` 里是 brief + 记忆；`card.desk.md`（傲娇版）和 `card.social.md`（原版）是原文快照；
- 工作台注入 `desk`，QQ 仍是原版卡；群友画像单独存 `soul/social-memory.json`，不进日常注入；
- 旧卡改了要重跑：`node scripts/import-legacy.mjs`（只读旧卡与旧记忆，不 import 旧插件）。

## 开发

本目录用 `link:` 装进测试 profile；不要直接改 `node_modules`。

```powershell
dsh plugin --profile <测试profile> add link:D:\DSH\大小鱼\dsh-yushen-twins
```

界面验收（先让 GUI 跑着；用临时浏览器 profile，不改鱼窝数据）：

```powershell
node scripts/test-three-role-ui.mjs
node scripts/nest-ui-check.mjs   # 或 npm run ui
```

`nest-ui-check` 默认连 `http://127.0.0.1:29895`；换端口用 `YUSHEN_GUI=http://127.0.0.1:<port>`。截图落在系统临时目录，失败会打印路径。

形象版本切换见 [形象版本切换](docs/形象版本切换.md)：

```powershell
node scripts/style.mjs status
node scripts/style.mjs use realistic
node scripts/style.mjs use anime-q
```

## 授权

**保留所有权利，仅授权使用。** 一句话：**可以改、可以扩，不可以再发给别人，不可以卖。**

- ✅ 在自己设备上安装、使用、配置
- ✅ **改、扩展（包括改核心代码）、换角色、接自己的插件**——改完自己用，作者不过问
- ❌ **把本软件或它的任何修改版本再分发给别人**（发包、上传、镜像、二次封装、随别的产品附带）
- ❌ 任何商业使用、二次盈利（需单独授权，见 [COMMERCIAL.md](COMMERCIAL.md)）
- ❌ 声称原始作品是你创作的、移除版权与许可标识

自己用、给自己团队用，不算分发；给别人、帮别人装，算。

需要商用、或以别的方式分发，联系作者。完整条款见 [LICENSE](LICENSE)（v0.3，2026-10-28）。

## 作者

**从零开始** · 鱼神双子星

联系：`1194474355 [at] qq [dot] com`（`[at]`→`@`，`[dot]`→`.`）

Copyright (c) 2026. All rights reserved. 授权见 [LICENSE](LICENSE)；第三方组件见 [THIRD_PARTY.md](THIRD_PARTY.md)。
