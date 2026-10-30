# 备份到 E 盘

> 快照防手滑，备份防天灾。E 盘是同一台电脑的另一块盘：能防单盘坏，不防整机丢/被加密。

## 备份什么

- `~/.dsh/dayu/soul`（角色卡与记忆）
- `journal`（对话与事件）、`story`（故事）、`ideas`（点子）、`solutions`（经验）
- `characters.json`、`awakening.json`、`ranks.json`、`freetime.json`
- 插件源码 `D:\DSH\大小鱼\dsh-yushen-twins`（排除 `node_modules`、`.git`、`dist`、日志）

## 怎么跑

- **自动**：插件每小时看一次，距上次超过 24 小时就跑一份；DSH 没开就等下次开（最多晚一天）。
- **手动**：
  ```powershell
  $env:ELECTRON_RUN_AS_NODE='1'
  & 'C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe' `
    'D:\DSH\大小鱼\dsh-yushen-twins\scripts\backup-e.mjs' --target=E:\鱼神备份 --keep=14
  ```
- 目录：`E:\鱼神备份\<日期_时间>\`，里面是数据 + `extra/dsh-yushen-twins` + `manifest.json`（文件数/字节/来源）。

## 清理

只留最近 **14 份**（约两周），更老的自动删。`--keep=30` 可调。

## 恢复

1. 找一份 `E:\鱼神备份\<时间>\manifest.json`，确认时间；
2. 把 `dayu\` 下对应目录拷回 `~/.dsh/dayu/`；
3. 插件源码从 `extra\dsh-yushen-twins` 拷回原位；
4. 再跑 `scripts/smoke.mjs` 和 `regression.mjs` 验证。

## 边界

- 同一台电脑的另一块盘：防 C 盘坏，不防整机丢失、被盗、勒索加密。
- 真正的异地备份要再拷到移动硬盘/另一台机器，并离线保存。
- 备份里有记忆和对话，**不要打包发布、不要放同步网盘**。
- 系统计划任务被拒绝（Access denied），所以用插件里的定时循环；DSH 不运行时不会跑。
