# 鱼神独立离线修复助手（本地未签名版）

独立 C# WinForms / .NET Framework 程序，不需要 Node、DSH、外部包或网络。

**能做什么**：读本机生命周期证据，判断「活着 / 疑似崩溃 / 手动退出 / 自动退出 / 认不出」，跑九项崩溃经验检查，按检查结果算出**可执行的动作**（不可用的写明原因），给出固定建议；动作都要用户当场确认。
**不能做什么**：不联网、不自启、不提权、不静默下载、不读聊天/账本/凭据内容、不自动安装依赖、不自动执行任何修复。

## 使用流程（先给结果，同意再修）

```
打开 exe ──► 自动诊断（只读）──► 结论 + 建议 + 动作清单
                                    │
                          能用的按钮才可点（不可用写明原因）
                                    │
                              点了还要再确认一次
                                    │
                              执行 → 写审计 → 重新诊断
```

默认**绝不自动修**：这些动作会改缓存、改凭据名、覆盖配置文件，坏状态叠坏状态比不修更糟（2026-10-24 那次就是这么滚大的）。

## 构建和测试

在项目根执行（注意：PowerShell 5.1 读无 BOM 的 .ps1 会按 ANSI 解析，`test.ps1` 刻意保持纯 ASCII）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\repair-helper\build.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\repair-helper\test.ps1
.\assets\repair-helper\YushenRepair.exe --self-test
.\assets\repair-helper\YushenRepair.exe --diagnose
```

编译固定用 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`；构建只写 `assets/repair-helper/`，遇 reparse point 拒绝；旧 EXE 覆盖前保留带 UTC 时间戳和随机后缀的 history 副本及 SHA256，候选 EXE 也留作构建审计。`SHA256SUMS.txt` 提供成品与源码/构建脚本摘要，哈希不等于代码签名或可信来源。

## 诊断分类

| 分类 | 含义 |
| --- | --- |
| `alive` | 进程在，可执行路径一致，启动时间对得上（容差见下） |
| `running-unverified` | 有进程占着这个 PID，但路径或启动时间对不上（PID 复用、权限读不到、记录缺字段） |
| `crash-suspected` | 有启动记录、无退出标记、进程已消失、最后观测 ≥60 秒 |
| `manual` / `automatic` | 有明确退出标记且时间线一致 |
| `unknown` | 证据不足或时间线冲突，不推断 |

**启动时间容差**：`active.json` 里的 `processStartedAt` 是插件启动后回填的，实测比进程真实启动晚约 2 秒。阈值改为 5000ms（若记录带 `processStartedAtPrecisionMs`，用 `max(5000, 精度×2+1000)`）。旧版 1000ms 会让「明明活着」被判成 `unknown`。

## 崩溃经验检查（只读，看存在性/语法，不读正文）

| 检查 | 取值 | 对应过去踩过的坑 |
| --- | --- | --- |
| `profileJson` / `bundles` | ok / broken / missing / too-large / blocked-link，加 bundles 条数 | profile 的 package.json 语法坏了，DSH 起不来 |
| `bridgeDeps` | present / missing / absent | 桥接 `node_modules` 被整目录清空（2026-10-21） |
| `stopFlag` | present / absent | 残留 STOP.flag，桥接下次一启动就退出 |
| `bridgeLock` | yes（僵尸）/ no（活进程）/ absent / unknown | 僵尸 lock 挡住下次启动 |
| `authCrash` | suspected / **stale** / other-signature / no-logs / unknown | `Web authentication failed` 死循环（坏凭据 + 坏 Cookie） |
| `shellCache` / `shellLockfile` | present / missing / absent | 壳的 `Network`、`Session Storage`、`lockfile` |
| `virtualDisplay` | none / **oray** / virtual / unknown | OrayIdd 虚拟显示器让 Electron 渲染进程随机崩 |

**灯效服务不查了**：那是某台机器上的外设服务，不是修复项；写进通用工具，别人的机器上只会多一条无关噪音。崩溃时改用通用建议排除"与 DSH 无关的进程/驱动"。

## 崩溃取证（为什么崩）

分类为 `crash-suspected` 时，工具会做一轮取证，再给结论：

| 取证来源 | 拿什么 |
| --- | --- |
| 壳崩溃日志（最近 10 条，≤2MB/条） | 命中的错误行（最多 6 条，路径已替换成 `<path>`） |
| Windows 应用日志（最近 7 天） | `DeepSeek Harness` 的错误事件：错误模块名、异常代码 |
| 环境 | 磁盘可用 GB、GPU 缓存文件数、显示适配器类型 |

输出 `causes`：每条形如 `{cause, evidence, confidence: high/medium/low, action}`。匹配不上就明说"没匹配到已知原因"，并附上日志里读到的错误行——**不编根因**。

**`authCrash: stale` 是关键判断**：最新崩溃日志的时间早于当前进程启动时间 → 那次之后没再崩过，不要拿旧日志冒充「现在还在崩」，也不要重复重置登录。

`advice` 是固定文本表，把过去几次崩因的处置写进去：认证死循环、OrayIdd 渲染崩溃、灯效噪音、问号串（发送端编码）、投递成功不回（busy/空回合）、关了 DSH 仍提示在运行（看门狗把自身算进去）。**建议不是发现故障，也不自动执行。**

完整背景见 [故障档案](<../docs/故障档案.md>)。

## 白名单修复动作

| 动作 | 前置条件 | 失败时 |
| --- | --- | --- |
| 清残留 STOP.flag | 文件存在；lock 里的 PID 已不存在（或没有 lock） | 拒绝，文件不动 |
| 清僵尸 bridge.lock | 文件存在且能在里面读出 PID，且该 PID 已不存在 | 拒绝，文件不动 |
| **重置登录状态** | 宿主**完全退出**；存在壳缓存/凭据/lockfile 中至少一项 | 拒绝；备份阶段任何一步失败就整体放弃 |
| 从备份恢复 package.json | 宿主**完全退出**；目标存在且 JSON 语法坏；备份由用户用文件对话框选择、能解析、且含 `dsh.profile.bundles` | 拒绝，或写完校验不过自动回滚 |

## 修不了的项：缺口闭环

`--fix`（或界面上的「修复」）跑完会把**修不了的项**写进 `$DSH_HOME/dayu/repair/gaps.jsonl`：
`{id, status: open, cause, evidence, whyNotFixed, at}`。只追加，不删。

等主人用别的手段把机器修好、DSH 再起来之后，插件启动时跑 `lib/repair-loop.js`：

1. 调助手 `--diagnose`（只读）拿回当前 findings；
2. 台账里还 open、但证据已消失的 → 追加 `resolved`；
3. 仍然 open 的 → 写 `capability-requests.jsonl`，说明下一版要补什么能力才能自修。

证据脚本：[test-gaps.ps1](<test-gaps.ps1>)，流程 `open → 外部修好 → resolved` 全跑一遍，并打印台账原文。

「重置登录状态」的顺序固定为**先全部备份、再动手**：把 `Network`、`Session Storage`、`.credentials.yaml` 复制到 `$DSH_HOME/dayu/repair/backups/<UTC 时间戳>-auth/`，复制成功后才删缓存目录、删 `lockfile`、把凭据改名为 `.bak-<时间戳>`。之后启动 DSH 要重新登录一次。

恢复 profile 的顺序：把原件复制到 `backups/<UTC 时间戳>/package.json` 并写 `.sha256` → 覆盖 → 重新解析验证 → 不通过就用刚才的副本回滚。每个动作都往 `$DSH_HOME/dayu/repair/actions.jsonl` 追加一行审计。

## CLI

```text
--self-test                                          纯函数分类自检
--diagnose                                           stdout 输出单一 JSON（含 plan）
--plan                                               只输出结论 + 动作可用性，一个文件都不动
--fix-safe                                           清 STOP.flag + 僵尸 lock（前置条件不过就拒绝）
--reset-auth --confirm                               重置登录状态（宿主在跑会拒绝）
--restore-profile <backup.json> --confirm            恢复 profile 的 package.json（宿主在跑会拒绝）
```

CLI 参数运行不弹窗。程序是 console subsystem，确保命令行诊断可重定向；从资源管理器启动 GUI 时可能带一个控制台窗口，这是显式取舍。

## 读取边界

- 读：`$DSH_HOME/dayu/repair/state.json`、`$DSH_HOME/dayu/boot.json`、存在时的 `$DSH_HOME/dayu/repair/active.json`、`$DSH_HOME/profiles/desktop/package.json`（只判 JSON 语法和 bundles 条数）、桥接 `state/STOP.flag` 与 `state/bridge.lock`（只看存在性，lock 只取 PID 判存活）。
- 读（2026-10-25 新增，对应故障档案）：`%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*-host.log` 的**最新一条**（≤2 MiB，只匹配 `Web authentication failed` 签名）、同目录 `Network` / `Session Storage` 的存在性与 `lockfile` 的存在性；注册表两组只读键——显示适配器 `Class\{4d36e968-...}` 的 `DriverDesc`（判虚拟显示器）、`Services\LightingService` 的 `Start`。
- 不读：账本、聊天、凭据内容、任意 diagnostic 文件、备份内容、日志其余正文。
- 每个 JSON 文件上限 1 MiB；JSON 深度 32；会话数 4096；崩溃日志上限 2 MiB；拒绝链接路径、不递归遍历。
- 报告只含固定枚举、固定建议、时间戳、计数和布尔值：不含路径、PID、launchId、驱动路径、任意 reason/message 或异常原文。
- 导出不允许写入 `DSH_HOME` 内、网络路径或链接路径。

## 会话与附件体检（Node，不在 exe 里）

`scripts/session-doctor.mjs`：只读，查「未走到 turn/end 的会话」「发出没回的工具调用」「悬空的附件引用」。

会话文件是 `session.v4.jsonl.zstd`，**一个文件里是多帧 zstd 首尾相接**；.NET Framework 没有 zstd，所以这条用 Node 24 的 `zstdDecompressSync` 按帧切着解，解不开的帧单独计数。用法见 [故障档案](../docs/故障档案.md) 第五节。

## 测试豁免（仅测试）

`YUSHEN_REPAIR_TEST_HOST_DOWN=1` 只用来在「宿主在跑」的机器上验证恢复/重置路径。它必须同时满足 `DSH_HOME` 已被指到**非真实家目录**才生效；未设 `DSH_HOME` 或指向真实 `~/.dsh` 时完全无效。

## 验证

2026-10-25 系统 csc 编译通过；`--self-test` 通过；离线集成测试 **23/23**：

- 五类分类（含 2.5 秒启动时间偏差仍判 `alive`，这是旧版误报 `unknown` 的回归）
- 九项检查（含新增：认证崩溃签名、日志早于本轮启动时判 `stale`、壳缓存/锁、虚拟显示器、灯效服务）
- 四个动作的成功路径与拒绝路径（桥接活着时一个文件都不动、目标健康时拒绝、备份不是 profile 时拒绝、宿主在跑时拒绝；重置登录先备份后动手）
- 隐私：诊断输出不含 fixture 路径、哨兵、PID、可执行路径

测试只创建随机临时 fixture，不读真实 `DSH_HOME`。

**人工 GUI 验收**（2026-10-26 00:20 / 00:45 主人实际操作）：

- 打开停在引导页不自动扫描 → 点「开始诊断」→ 分类 `alive`、命中 1 条只报告（OrayIdd）、4 个动作全部 skipped 并写明原因；
- 「修复」按钮呈**灰色 + “没有需要修的项目”**，点击无动作 —— 主人确认这是期望行为（有可修项才亮，健康机不该让人误点）；
- 输出与 CLI 同逻辑一致。

已知操作约束：**重编译前必须先关窗口**，否则 exe 被占用、构建会失败（`Copy-Item` IOException）。

**桌面安装实跑**（2026-10-26 00:52）：`installRepairHelper({confirm:"INSTALL LOCAL UNSIGNED HELPER", desktop:true})`

```
helperInfo: available=true  sha256=aa5a7ad8…  size=50688
install:    installed=true  verified=true
落地：%LOCALAPPDATA%\Yushen\RepairHelper\aa5a7ad8…\YushenRepair.exe（50,688 字节）
快捷方式：桌面\鱼神修复助手.lnk → 指向上面这个 exe（已读回 Target/WorkDir 确认）
从安装目录启动：窗口正常、--diagnose exit=0、分类 alive
```

**发行包同步**（2026-10-26 00:54）：`dist\dsh-yushen-twins\assets\repair-helper\YushenRepair.exe` 哈希与 `assets` 完全一致；包内只剩 1 个 exe（32 个旧构建候选和 history 已归档到 `D:\DSH\大小鱼\archive\repair-helper-builds-20261026`）；`docs/故障档案.md` 已随包。

## 安装与升级（自动化）

**存档副本**：`D:\DSH\tools\yushen-repair\`（exe + 说明.txt + 源码 + 故障档案），给主人直接双击用；它不会自动更新，发新版后要重新拷一份。

| 场景 | 行为 |
| --- | --- |
| 从没装过 | 面板点「安装」才装（首装仍要用户确认） |
| 已装旧版 | 插件启动时 `autoUpgradeIfInstalled()` 自动装新版；桌面快捷方式**自动改指向新版本**（旧 lnk 备份成 `.lnk.bak-<时间戳>`）；旧哈希目录移到 `RepairHelper\.old\` |
| 已是最新 | 不动文件，只把快捷方式指向修回来 |
| 桌面有别人的同名 lnk | 拒绝覆盖（只认指向 `RepairHelper\<sha>\YushenRepair.exe` 的） |

手动跑：`node scripts\upgrade-helper.mjs`。离线测试：`node scripts\test-repair-helper-upgrade.mjs`（4/4，覆盖升级、幂等、拒绝覆盖别人的 lnk、未装过不动作）。

## 遗留 / 复发条件

- 未做代码签名；分发信任仍靠 SHA256 + 人工核对。
- GUI 按钮没有在真实坏件上逐个点过，验证走的是同逻辑 CLI。
- 修复范围只到「文件/配置」层：依赖被整体删（只能报 `bridgeDeps=missing`）、盘坏、权限被改、杀软隔离 exe，只能报告不能修。
- 禁用虚拟显示器、禁用灯效服务都要管理员权限，工具**只诊断并给命令**，不执行 `pnputil` / `Set-Service`。
- 不判断崩溃根因，只给「疑似」和固定建议；`crash-suspected` 不等于已经知道为什么崩。
