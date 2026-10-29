<p align="center"><img src="assets/playbook-mark.svg" width="88" alt="Playbook：书本与播放三角"></p>
<h1 align="center">Playbook</h1>
<p align="center"><strong>the show must go on</strong></p>
<p align="center"><a href="https://github.com/jakara/playbook/releases/latest">下载</a> · <a href="install.md">安装指引</a> · <a href="#快速开始">快速开始</a> · <a href="skills/playbook-wright/SKILL.md">Skill</a> · <a href="integrations/dsh/README.md">DSH 插件</a> · <a href="docs/architecture.md">技术架构</a></p>

Playbook 是一个软件演示播放器，用于客户验收、培训和流程讲解。它按预设脚本操作真实页面，配合开场介绍、箭头提示、蒙层和语音，演示功能如何使用、操作后有什么结果。流程可以自动播放，也可以停下来让观众亲自操作。

你用自己的智能体和 `playbook-wright` Skill 编写、调整演示，Playbook 负责浏览、搜索和播放。脚本保存在业务项目中，按 Book、Section 组织，可以播放单个流程，也可以顺序播放整节、整本。Skill 提供创作、维护和 Playwright 测试用例双向转换指引。

## 下载与安装

目前提供 macOS Apple Silicon（M 系列芯片）安装包。

| 方式 | 入口 |
|---|---|
| 磁盘映像 | [Playbook-macos-arm64.dmg](https://github.com/jakara/playbook/releases/latest/download/Playbook-macos-arm64.dmg) |
| 压缩包 | [Playbook-macos-arm64.zip](https://github.com/jakara/playbook/releases/latest/download/Playbook-macos-arm64.zip) |
| 发布文件与校验值 | [GitHub Releases](https://github.com/jakara/playbook/releases/latest) |
| 让智能体安装 | [install.md](install.md) |

可以把下面这句话交给你的智能体：

> 请读取 https://raw.githubusercontent.com/jakara/playbook/main/install.md ，为我的 Codex 安装 Playbook 和用户级 Skill；先检查现有安装，复用兼容应用，核验官方发布文件，并在完成后说明如何调用。

使用 Claude Code 或安装到指定项目时，在请求中写明框架和项目绝对路径。[安装指引](install.md)包含版本固定、SHA-256 校验、应用复用和已有 Skill 的备份步骤。

应用目前未签名、未公证，macOS 可能提示无法验证开发者。请核对下载来源和校验值，按系统界面处理。尚未提供 Intel Mac、Windows 或 Linux 安装包。

## 快速开始

1. 安装并打开 Playbook。发布包自带运行环境，不需要另装 Node.js 或 npm。
2. 播放首页的「Playbook 使用教程」。教程在内置浏览器中运行，使用独立练习数据；讲到 Skill 安装时会交还操作权，你可以安装，也可以继续或等待跳过。
3. 安装 Skill 后，在智能体中重新加载或开启新会话，调用 `$playbook-wright`。旧调用名 `$playbook-playwright` 也可用。
4. 在客户端点击「添加项目」，选择包含 `.playbook.json` 的文件夹，打开 Book 并播放。自己的项目可参考[入门样例](examples/starter/.playbook.json)和 [SDK 类型](src/index.ts)。

例如：

> 使用 $playbook-wright，为当前项目编写一个演示登录和查询结果的流程，包含开场、操作提示和结果检查。

业务服务、登录和数据准备由项目的 Profile 提供。内置浏览器无需另装 Chrome；外部浏览器模式需要本机 Google Chrome。

## 功能

| 功能 | 说明 |
|---|---|
| 项目与章节 | 项目文件夹 → Book → Section → 脚本，支持搜索和批量播放 |
| 页面引导 | 开场、章节介绍、箭头、蒙层、柔边光圈、演示光标，配合 Playwright 操作和断言 |
| 自动播放与手动操作 | 讲解后交还页面，支持倒计时或等待继续；操作时重置计时，文件选择和安装期间冻结 |
| 语音与打码 | 客户端语音讲解开关，默认使用 macOS 系统 TTS 朗读说明，也支持工作区录音；按选择器遮盖、模糊指定区域 |
| 播放控制 | 内置浏览器控制栏、外部 Chrome 悬浮条、全局播放/暂停快捷键 |
| 页面批注 | 暂停后选择页面元素并填写批注；可从图标或运行记录复制上下文给智能体，也可删除批注并同步移除页面图标 |
| PPTX 导出 | 回放流程并截图，嵌入语音、按讲解换页，讲稿写入演讲者备注 |
| 演示与测试复用 | 保留原生 Playwright 动作与断言，通过 Skill 适配测试用例和演示脚本 |
| 运行记录与恢复 | 保存执行快照及执行、清理错误；Profile 可声明幂等恢复入口 |

默认全局快捷键为 `⌘⌥P`。外部播放栏可以拖动、收起，空闲后隐藏，输入时显现。快捷键注册失败会在客户端提示。

浏览和搜索不改写业务文件。项目可以移出，Book 可以经确认删除；普通 Book 删除会备份并修改清单，保留脚本、Profile 和运行记录。内置项目的移出、删除状态保存在本机。脚本内容和效果调整由智能体完成。

## 项目文件

```text
business-project/
  .playbook.json
  demos/
    flows/*.playbook.ts
    profiles/*.profile.ts
    audio/                     # 可选本地录音
```

清单保存 Book、Section 和播放顺序，脚本保存动作、断言、讲稿与呈现参数，Profile 负责环境准备和资源释放。业务演示文件保留在业务仓库。

- [入门样例](examples/starter/.playbook.json) / [SDK 类型与执行入口](src/index.ts)
- [Skill 创作与维护指引](skills/playbook-wright/SKILL.md)
- [技术架构](docs/architecture.md) / [使用指南](docs/usage.md) / [检查与排错](docs/verification.md)

需要突出多行正文时，可为步骤设置文字聚光。下面的提示文字需替换为实际页面内容：

```ts
{
  id: 'read-result', title: '查看结果', explain: '这里展示操作完成后的提示。',
  target: ({ page }) => page.getByText('操作已完成。', { exact: true }),
  presentation: { spotlight: 'text', side: 'bottom', holdMs: 6500, afterMs: 6000 },
  run: async () => {},
  verify: async ({ page }) => {
    if (!(await page.getByText('操作已完成。', { exact: true }).isVisible()))
      throw new Error('提示未出现');
  },
}
```

设置 `spotlight: 'text'` 后，播放器逐行高亮目标中的可见文字，在滚动和重新排版时更新位置，并尝试让提示框避开正文。`target` 仍须是唯一 Locator，业务操作和断言不变。默认的 `element` 模式保留元素光圈，无目标步骤显示中央说明。长段落只高亮视口内的文字，需要在脚本中安排滚动。

## 开发

应用基于 Electron、React、TypeScript、Playwright 和 Driver.js。开发需要 Node.js 和 npm；外部浏览器及相关测试需要 Google Chrome。

```sh
npm ci
npm start
```

首次启动或打包时会下载锁定版本的 Electron 运行环境，也可以运行 `npm run electron:install` 单独安装。

```sh
npm run desktop:build  # 构建客户端
npm run check          # 核心、类型、样例与正反向检查
npm run desktop:check  # 桌面自动检查
npm run desktop:smoke  # 已构建客户端 + 隔离临时项目
npm run package:mac    # macOS Apple Silicon 分发包
```

图标源文件为 [assets/playbook-mark.svg](assets/playbook-mark.svg)，修改后用 `npm run icons` 生成应用图标，需要本机 Chrome 和 macOS 图标工具。

`@playbook/core` 是仓库内 SDK 包名，尚未发布到 npm。桌面打包器使用应用自带 SDK，业务项目的其他依赖、服务和账号由项目提供。发布流程见[发布维护](docs/releasing.md)。

## 使用说明

播放会执行项目中的本地代码，请核对脚本来源、目标环境和操作影响。运行器用于隔离故障，不隔离恶意脚本。

停止播放后，应用会取消执行、独立清理并保存回执。清理能否释放业务资源取决于 Profile；强杀无法保证回调执行。自动恢复需要 Profile 事先声明精确资源句柄和幂等入口，旧 Profile 或版本不匹配时需人工核对，详见[技术架构](docs/architecture.md)。

手动步骤在继续或超时后仍要检查操作结果。含手动步骤的流程导出 PPTX 时，需要另备已授权的纯自动版本。测试用例与演示之间的转换，也需要适配登录、数据、断言、清理和浏览器能力。

打码只改变观看效果，DOM 和 API 原值仍存在，模糊效果也可能被辨认。需要保护的数据应先在业务侧脱敏。

内置浏览器以单个主页面为主，会拦截网页弹窗；多窗口、Chrome 扩展等流程需要外部模式并单独验证。PPTX 导出会重新执行流程，输出的是截图课件，控件不可单独编辑；声音和换页计时应在实际使用的演示软件中检查。失败或停止导出会保留旧目标文件。

客户端没有内置模型账户，脚本创作由你选择的智能体完成。环境要求和常见问题见[检查与排错](docs/verification.md)。

## 许可

[MIT](LICENSE)
