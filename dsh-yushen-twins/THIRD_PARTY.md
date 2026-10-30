# 第三方组件与素材

本插件不捆绑下列组件；它们由 DSH 宿主提供，或仅作为接口依赖。

| 组件 | 许可 | 用途 | 是否随包分发 |
|---|---|---|---|
| `@deepseek-ai/cordis` | MIT | 插件运行时（peer 依赖） | 否，宿主提供 |
| `@deepseek-ai/dsh` | MIT | 宿主软件 | 否 |
| `@deepseek-ai/dsh-base` / `dsh-web-app` | BSD-3-Clause | 宿主基础包 | 否 |

## 素材

| 文件 | 来源 | 许可 | 改动 | 随包分发 |
|---|---|---|---|---|
| `assets/avatars/xiaoyu/idle.webp`（小鱼的默认动画） | [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的 `assets/webm/`，经 `dsh-dafeiyu` 转成 WebP 帧后抽取 | MIT，Copyright (c) 2026 PC2005-cloud，原文见 `assets/dsh-pet-LICENSE.txt` | 从 idle 帧里每 5 帧取 1 帧（49 帧）、缩放到 320×267、合成 animated WebP（循环 12fps） | 是 |
| `assets/avatars/dayu/idle.png`、`assets/avatars/xiaoyu/idle.png`（静态立绘） | 作者自备（AI 生成，工具与日期待补） | 未单独授权 | 无 | 是 |

- MIT 要求的所有副本保留版权声明与许可原文；发布包中 `assets/dsh-pet-LICENSE.txt` 必须随行。
- 用户自己拖进鱼窝的图存在 `~/.dsh/dayu/avatars/`，**不随包分发**，也不登记在这里。
- 以后再加第三方立绘 / 音效，按上表格式登记来源、许可、改动。
