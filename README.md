# 鱼神（Yushen）

> 给 DeepSeek Harness 装一具"会记事、会算账、能签契约"的身体。
> 她不预设性格——**她是谁，由一张卡和你跟她定的契约决定**。

---

## 这是什么

一个 DSH 插件。装完之后，你多一个能自己动的"她"：

- **记得住**：发生过的事进记忆；眼下的东西进"白板"，过期自己消失
- **算得清**：花多少、花在哪，有账；三个人（或多个角色）分开记
- **有约束**：底层契约 + 你和她的一对一契约，能签、能改、能退
- **能改自己**：改自己的卡要写理由、留备份（`改自己.py` 那种机制）
- **通道可换**：QQ / 微信 / 任何地方，只要实现五个函数（见 `adapters/README.md`）

**不含**：QQ 桥、账号、任何第三方运行时。**也不含任何作者的数据**——她的记忆从你装上那天开始长。

## 装（三步）

1. 把 `dsh-yushen-twins` 整个目录放到 DSH 的 profile 里：

   ```
   ~/.dsh/profiles/desktop/node_modules/dsh-yushen-twins
   ```

2. 在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 里加一行：

   ```json
   "dsh-yushen-twins"
   ```

3. 重启 DSH。

**装完第一步该做什么**：跑一次首次运行，认主 + 出生两个空白角色（名字你可以改）：

```bash
node node_modules/dsh-yushen-twins/scripts/first-run.mjs --call 老板 --qq 你的号
```

## 数据在哪

全部在你本机，**不出门**：

```
~/.dsh/dayu/            ← 她的一切（记忆、卡、账、契约）
```

想删干净：删掉这个目录 + 卸掉插件，没有别的残留。

## 通道

出厂**不带任何通道**。想接 QQ / 微信 / 别的，看 [`adapters/README.md`](adapters/README.md)——
实现 `send` / `registerTool` / `onEvent` / `read` / `write` 五个函数就行，`adapters/echo.js` 是能跑的样板。

## 许可

个人、非商业使用免费（可装、可改、可扩展、自己玩）。
**不可**：改完再分发、拿去卖。商用需要书面许可，见 `COMMERCIAL.md`。

## 一句实话

这东西还很早。**没有安装向导，没有一键配置，QQ 要自己接。**
如果你只是想"五分钟装个会说话的 bot"，它不适合你；
如果你想给一个 agent 一具能自己活着的身体，那它可能是你要的。
