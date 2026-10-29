# 通道契约：怎么把鱼神接到你自己的地方

> 一句话：**鱼神不认识 QQ，也不认识微信。它只认识"宿主"。**
> 你给它一个宿主，它就在你那个地方活起来。出厂包不带任何真通道，只带这份契约和一个样板。

---

## 一、宿主必须有这五个函数

文件：`core/host.js` —— `attach(host)` 会检查，缺一个就报错。

| 函数 | 什么时候被调用 | 你要做什么 |
|---|---|---|
| `send(key, text)` | 她要说话 | 把 text 发到 key 指的那个地方，返回 `{ok:true}` |
| `registerTool(tool)` | 她要挂一个工具 | 收下 `{name, description, execute}` |
| `onEvent(cb)` | 外面有新消息 | 收到话就调 `cb({key, text, at})` |
| `read(path)` | 她要读文件 | 一般直接复用 `createFileHost()` 给的 |
| `write(path, data)` | 她要写文件 | 同上 |

**可选**：`name`、`serve()`（网页）、`auth()`（鉴权）、`listSessions()`、`createSession()`、
`listTools()`、`runTool()`。

## 二、最小可用通道（30 行就能跑）

```js
import { attach, createFileHost } from '../core/host.js'

export function attachMyChannel({ deliver }) {
  const base = createFileHost('my-channel')
  const a = {
    ...base,
    name: 'my-channel',
    async send(key, text) { return deliver(key, text) },   // ← 唯一必须自己写的
    registerTool(tool) { /* 存起来 */ },
    onEvent(cb) { this.cb = cb },
    push(key, text) { this.cb?.({ key, text, at: Date.now() }) },  // 外面收到话时调它
  }
  attach(a)
  return a
}
```

**样板文件**：`adapters/echo.js`——照抄改 `deliver` 就行。

## 三、怎么验你写的通道通没通

```bash
node -e "
import('./adapters/echo.js').then(async (m) => {
  const a = m.attachEcho({ deliver: async (k, t) => { console.log('发出去了：', k, t); return {ok:true} } })
  await a.send('test', '你好')
})"
```

**看到「发出去了：test 你好」就算通。** 没看到就是 `deliver` 没接上。

## 四、QQ 为什么不在包里

QQ 那条路要三样东西：一个第三方运行时（SnowLuma）、一个真 QQ 账号扫码、一个桥。
**前两样我们没法随包分发，第三样各家实现不同。**

所以出厂时 QQ **默认不装**。想接，两条路：

1. **自己写一个通道**：按上面五个函数，把 QQ 的消息接进 `onEvent`、把 `send` 接到发消息接口
2. **用现成的桥**：比如 `dsh-onebot-hub`（支持 OneBot 实现端和 QQ 官方机器人），把它当通道

## 五、一条建议（写通道的人常常踩）

**别在通道里做判断。** 通道只干两件事：**把话带进来、把话带出去**。
"要不要回、怎么回、回什么"是她的活，不是通道的活。

我们的 QQ 桥当初就是因为这条没守住——它在通道里替她判断"这条值不值得回"，
结果她连自己的话是不是自己说的都分不清。**那是通道越界，不是她不行。**
