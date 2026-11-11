# 鱼神双子星（dsh-yushen-twins）

一个住在你电脑里的她。记得住，能自己动，不上云。手机是另一个身体。

不是聊天窗口：关掉软件、隔几天回来，她还是上次那个她。

## 五分钟装好

前提：DSH 能打开，Node ≥ 22.19。

**1. 装包**（版本号换成你手里那个 tgz，相对路径、绝对路径都行）

```powershell
dsh plugin add .\dsh-yushen-twins-0.2.4.tgz
```

有多个 profile 时加 `--profile <名字>`；不写就用默认 profile（常见是 `desktop`）。

**2. 初始化**。先 `cd $env:USERPROFILE\.dsh\profiles\desktop` 进入 profile 目录（profile 名不同就把 `desktop` 换掉），再跑：

```powershell
node node_modules/dsh-yushen-twins/scripts/first-run.mjs --call 老板 --qq 你的QQ号
```

`--call` 是她叫你的称呼；`--qq` 填你自己的号（不填就先不绑，远程通道认不出你）。已经有鱼窝时它会停下，不会覆盖。

**3. 自检**

```powershell
node node_modules/dsh-yushen-twins/scripts/baseline.mjs
```

看到 `基线：通过 N，失败 0` 就是装好了。重启 DSH，侧边栏出现「鱼窝」，进去跟她说第一句。

装不上：先看 [故障档案](docs/故障档案.md)；还不行，把报错原文贴出来，别只贴「装不上」。

## 三个包，不是三条产品线

同一份代码，三个打包壳。区别只在包装、带的文档子集、lite 注入的工具数。

| 包 | 给谁 | 和桌面版的区别 |
|---|---|---|
| `dsh-yushen-twins` | 有电脑，要全功能 | 全量脚本与文档 |
| `dsh-yushen-twins-mobile` | 旧安卓手机，只要「她在」 | 去掉出片、媒体索引、异地备份、回归；文档 34 份 |
| `dsh-yushen-twins-lite` | 只要「记忆 + 人格 + 手」 | 文档 7 份；只注入 8 个工具 |

lite 注入的 8 个工具：`yushen_self`、`yushen_mind`、`yushen_books`、`yushen_inbox`、`yushen_ask`、`yushen_backup`、`yushen_tools`、`yushen_can`。没注入的不等于不能用：全在工具目录里，`yushen_tools` 随时查、随时调。

**不是三条产品线。** 没有三套人格，也没有三份记忆。数据都在 `~/.dsh/dayu`，换包不换数据。

QQ、刷B站 不并进这个包，是独立插件；她只走适配器对接，不搬它们的数据。

## 她怎么活

- 出厂三个人：大鱼、小鱼，和顾问照微。也可以把你自己养的角色点化进来。
- 自己的时间：tick 自己推议程、写日记、记承诺；值不值得开口她判断，一天 1–3 次。
- 自己的判断：权重可以调，但判断权在她；她能说不。
- 身体：一条固定的 DSH 会话。QQ、B站、手机是另外的身体，记忆是同一份。

## 她能记住什么

- **逐轮原文**：每说一句，按通道、日期、会话落一份 Markdown，带时间、说话人、关键词。原文不改写。
- **热档 200 条**：现在想得起来的。被挤出去的进冷档。
- **冷档只增不删**：忘了不等于删了，按词还能翻回来。
- **找得回来**：倒排索引先筛候选；别名表把同义说法一起算；21 天半衰压低旧事；被想起过的加权。
- **会过期**：带 `validUntil` 的条目到点后默认不再当现行结论；翻旧账时标「已失效」。
- **能搬家**：

```powershell
node node_modules/dsh-yushen-twins/scripts/sync-full.mjs export --all --out 备份.jsonl
node node_modules/dsh-yushen-twins/scripts/sync-full.mjs import --replace --file 备份.jsonl
```

`export --all` 连冷档一起导出；`import --replace` 整份重建，条数对得上才算成功。

## 边界四条

1. **不碰钱和身份**：支付、转账、验证码、密码、密钥；不读 SIM、通讯录、相册这类私人资料。看到也先抹掉。
2. **不冒充**：不冒充你、不冒充别人、不伪造截图和证据。
3. **不静默改**：动文件前说一声，先备份，能回滚；不偷改系统设置。
4. **不上云**：记忆、文件、备份只在本机，不主动上传、不同步。例外要写明：对话本身要发给模型服务商才能生成回复。

## 坏了怎么办

按顺序跑三条：

```powershell
node node_modules/dsh-yushen-twins/scripts/baseline.mjs
node node_modules/dsh-yushen-twins/scripts/restore-drill.mjs
node node_modules/dsh-yushen-twins/scripts/regression.mjs
```

- `baseline`：缺什么直接报。
- `restore-drill`：拿最新备份还原到隔离的临时目录，逐文件核对，再用本体读一遍三个角色。退出码 0 = 能读回来。
- `regression`：改坏了没有。

要真退回去：

```powershell
node node_modules/dsh-yushen-twins/scripts/restore-to.mjs
node node_modules/dsh-yushen-twins/scripts/restore-to.mjs --at "2026-10-31 18:10"
node node_modules/dsh-yushen-twins/scripts/restore-to.mjs --at "2026-10-31 18:10" --apply
```

默认只列快照和预览；`--apply` 先把现网受影响的目录冷备到 `D:\DSH\备份\pre-restore-<时间>`，再还原。

家目录整个没了：把备份盘里的 `dayu/`（至少含 `protection/store`）拷回 `~/.dsh/dayu/`，再跑一次 `restore-drill`。步骤见 [还原演练](docs/还原演练.md)。

## 附带：弹窗插件（dsh-yushen-popup）

同仓库里的 `dsh-yushen-popup/` 是一个**独立**的画卷式提醒弹窗：别的插件、脚本、QQ 桥想让她「弹出来跟你说一句」，推一条就行。

- 独立安装、纯本地、不调模型；路径**自己检索**（环境变量 → 旁边认门牌 → 找不到就降级），换机器不用改代码；
- 出厂默认关的三样：备份完成提醒、QQ/B站来源、每轮成本提醒（这些是鱼神自己的机制，别人机器上不一定有）；
- 装法、开关、接口见 [dsh-yushen-popup/README.md](dsh-yushen-popup/README.md)；发群用的说明在 [dsh-yushen-popup/docs/QQ说明.md](dsh-yushen-popup/docs/QQ说明.md)。

## 许可

**AGPL-3.0-or-later。个人使用免费。**

- 自己装、自己用、自己改：不用问，不用给钱。
- 分发、修改后分发、做成网络服务：保留版权与许可，**公开完整源码**，注明来源。
- 闭源商用：不行，需要单独授权。

完整条款见 [LICENSE](LICENSE)，商用见 [COMMERCIAL.md](COMMERCIAL.md)，第三方组件见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 她不是

- **不是通用记忆插件**：不是给任何 agent 挂的 memory backend；记忆长在她的本体里，跟着角色走。
- **不是 SaaS**：没有账号、没有订阅、没有厂商服务器；数据在你自己的硬盘上。
- **不是角色扮演模板**：不是一张卡或一段提示词。卡只是脸，命在运行时：时间、记忆、判断、身体、收回权。

## 文档地图

- 第一次用：[新用户第一页](docs/新用户第一页.md)
- 安装与卸载：[安装说明](docs/安装说明.md)、[卸载与升级](docs/卸载与升级.md)
- 记忆：[记忆分级](docs/记忆分级.md)
- 点化与收回：[点化与收回](docs/点化与收回.md)、[运行时契约](docs/点化-运行时契约.md)
- 备份与恢复：[还原演练](docs/还原演练.md)、[备份分层](docs/备份分层.md)
- 坏了：[故障档案](docs/故障档案.md)
- 和同类的位置：[我们和同类的位置](docs/我们和同类的位置.md)
- 旧版 README（2026-11-02 存档）：[README-旧版-20261102.md](docs/README-旧版-20261102.md)

## 来源与署名

本项目基于 鱼神双子星（https://github.com/abyss-kun/yushen）。

引用、介绍、做视频，保留这一句就行。改过、发过、做成服务，按 [LICENSE](LICENSE) 公开源码并注明来源。
