<p align="center"><img src="assets/playbook-mark.svg" width="88" alt="Playbook：书本与播放三角"></p>
<h1 align="center">Playbook</h1>
<p align="center"><strong>the show must go on</strong></p>
<p align="center">让软件自己演示，把讲解与操作编成一本可播放的手册。</p>
<p align="center"><a href="https://github.com/jakara/playbook/releases/latest">下载</a> · <a href="install.md">安装指引</a> · <a href="#快速开始">快速开始</a> · <a href="skills/playbook-wright/SKILL.md">基础接入 Skill</a> · <a href="docs/architecture.md">技术架构</a></p>

Playbook 是面向软件演示、客户培训和流程讲解的桌面播放器。它真正操作页面：展示开场、指向组件、解释功能，再完成操作与结果检查。演示可以自动播放，也可以在合适的位置停下来，让观众亲自试一试。

**用你自己的智能体创作，用 Playbook 播放。** 客户端与 SDK 公开源码，业务脚本留在自己的项目里。客户端负责浏览、搜索和播放，无需再配置一套模型账户，也没有内置聊天或脚本编辑器。

公开的 `playbook-wright` 是 **community-bootstrap 基础版**，只提供安装与项目接入引导，不包含专业创作、维护和测试转换工作流。专业 Skill 计划通过 WorkBuddy 市场另行分发，目前尚未上架；公开仓库和下载包不会提供专业版。

书本代表可组织的操作手册，播放三角代表可执行的演示。项目文件夹里放 Book，Book 由 Section 和脚本组成；可以播放单个流程，也可以按顺序播放整节、整本。

## 下载与安装

当前交付平台为 **macOS Apple Silicon（M 系列芯片）**。

| 方式 | 入口 |
|---|---|
| 磁盘映像 | [Playbook-macos-arm64.dmg](https://github.com/jakara/playbook/releases/latest/download/Playbook-macos-arm64.dmg) |
| 压缩包 | [Playbook-macos-arm64.zip](https://github.com/jakara/playbook/releases/latest/download/Playbook-macos-arm64.zip) |
| 全部发布资产与校验值 | [GitHub Releases](https://github.com/jakara/playbook/releases/latest) |
| 让智能体完成安装 | [install.md](install.md) |

可以把下面这句话交给你的智能体：

> 请读取 https://raw.githubusercontent.com/jakara/playbook/main/install.md ，为我的 Codex 安装 Playbook 和用户级基础接入 Skill；先检查现有安装，复用兼容应用，核验官方发布文件，并在完成后说明如何调用。

需要 Claude Code 或指定项目安装时，在请求中写明框架和项目绝对路径。[安装指引](install.md)包含固定发布版本、SHA-256 校验、应用复用、两个 Skill 入口和冲突保护的完整步骤。具体资产以正式发布的 Release 为准。

分发包目前**未签名、未公证**，macOS 可能提示无法验证开发者。请从官方仓库下载、核对校验值，并按系统提供的界面处理；安装指引不会关闭 Gatekeeper 或清除隔离属性。尚未交付 Intel Mac、Windows 或 Linux 安装包。

## 快速开始

1. 安装并打开 Playbook。发布包自带运行环境，使用客户端不需要安装 Node.js、npm 或启动本地 Node 服务。
2. 播放首页的 **Playbook 使用教程**。教程默认留在内置浏览器中；大部分步骤使用独立练习数据，在 Skill 安装环节会明确交还操作权，你可以真实安装，也可以继续或等待跳过。
3. 按需安装基础接入 Skill，在智能体中重新加载或开启新会话，调用 `$playbook-wright`。旧调用名 `$playbook-playwright` 仍可用；这两个公开入口均为基础版。
4. 从公开的 [入门样例](examples/starter/.playbook.json) 和 [SDK 类型](src/index.ts) 接入自己的项目。在客户端“添加项目”，选择包含 `.playbook.json` 的文件夹，打开 Book 并播放。专业作者工作流由单独分发的专业 Skill 提供。

例如：

> 使用 $playbook-wright，检查 Playbook 是否安装，并帮助我确认当前项目的接入条件。

业务服务、登录和数据准备由项目自己的 Profile 提供。先在适合演示的环境验证，再用于客户场景。内置浏览器无需另装 Chrome；外部浏览器模式需要本机 Google Chrome。

需要突出宽段落或多行正文时，可在单步启用 v0.7.1 的文字聚光：

```ts
{
  id: 'read-result', title: '阅读结果', explain: '阅读真实提示。',
  target: ({ page }) => page.getByText('生成服务尚未配置，可继续手工编写；已有内容已保留。', { exact: true }),
  presentation: { spotlight: 'text', side: 'bottom', holdMs: 6500, afterMs: 6000 },
  run: async () => {},
  verify: async ({ page }) => {
    if (!(await page.getByText('生成服务尚未配置，可继续手工编写；已有内容已保留。', { exact: true }).isVisible()))
      throw new Error('提示未出现');
  },
}
```

`text` 只改变呈现几何；可见文字按 `Range` 逐行突出，滚动和重排后更新，弹窗尝试避让当前文字。`target` 仍须是唯一 Locator，业务操作和断言不变。默认 `element` 维持原有光圈、图片和整页呈现；无目标步骤继续用中央说明。超出视口的段落只突出当前可见行，需在脚本中安排正常阅读滚动。

## 能做什么

| 能力 | 使用方式 |
|---|---|
| 可播放的手册 | 项目 → Book → Section → 脚本；搜索、详情、整节与整本顺序播放 |
| 引导与自动操作 | 开场、章节、箭头、蒙层、柔边光圈、演示光标；原生 Playwright 操作和断言 |
| 自动讲解 + 真人实操 | 讲解后交还页面，限时或等待明确继续；操作时重置计时，文件选择和安装期间冻结 |
| 同步语音与打码 | macOS 本机 TTS 或工作区录音；按选择器覆盖或模糊指定区域 |
| 内置或外部播放 | 内置浏览器顶部控制栏；外部 Chrome 配原生悬浮条；全局播放/暂停快捷键 |
| PPTX 课件 | 回放自动流程，以截图构建幻灯片，嵌入语音、按讲解换页，讲稿写入演讲者备注 |
| 演示与测试复用 | SDK 保留原生 Playwright 动作与断言，支持测试入口复用；专业 Skill 提供作者侧适配工作流 |
| 反馈与恢复 | 执行快照、运行记录、分别记录执行/清理错误；可选 Profile 幂等恢复入口 |

默认全局快捷键为 **⌘⌥P**。外部播放栏可以拖动、收起，空闲后隐藏，输入时显现。快捷键注册失败会在客户端提示。

浏览和搜索不改写业务文件。项目可以移出，Book 可以经确认删除；普通 Book 删除会备份并修改清单，保留脚本、Profile 和运行记录。内置项目的移出/删除状态单独保存在本机。脚本内容和效果调整仍交给智能体完成。

## 你的项目仍属于你

```text
business-project/
  .playbook.json
  demos/
    flows/*.playbook.ts
    profiles/*.profile.ts
    audio/                     # 可选本地录音
```

清单保存 Book、Section 和顺序，脚本保存动作、断言、讲稿与呈现参数，Profile 负责环境准备和资源释放。业务演示资产留在业务仓库；产品内置合成教程和样例不作为业务验收证据。

- [入门样例](examples/starter/.playbook.json) / [SDK 类型与执行入口](src/index.ts)
- [技术架构与公开契约](docs/architecture.md) / [产品方案](docs/product-plan.md)
- [基础安装与接入引导](skills/playbook-wright/SKILL.md) / [验证记录](docs/verification.md)

## 开发

开发环境需要 Node.js、npm；外部浏览器及相关测试需要 Google Chrome。应用基于 Electron、React、TypeScript、Playwright 和 Driver.js。

```sh
npm ci
npm start
```

首次启动或打包时会按锁定版本下载 Electron 运行环境；Electron 45 的 npm 包不再靠安装后脚本完成下载。`npm run electron:install` 可单独补齐环境，应用打包显式使用 `--publish never`，发布由校验后的工作流完成。

```sh
npm run desktop:build  # 构建客户端
npm run check          # 核心、类型、样例与正反向检查
npm run desktop:check # 桌面自动检查
npm run desktop:smoke # 已构建客户端 + 隔离临时项目
npm run package:mac   # macOS Apple Silicon 分发包
```

品牌源文件为 [assets/playbook-mark.svg](assets/playbook-mark.svg)，修改后用 `npm run icons` 生成应用图标。此步使用本机 Chrome 和 macOS 图标工具。

`@playbook/core` 是仓库内 SDK 包名，尚未发布到 npm；桌面打包器使用应用自带 SDK。项目自身的其他依赖、服务和账号仍由项目提供。发布资产与版本管理见 [发布维护](docs/releasing.md)。

## 使用边界

- **播放会执行可信本地代码。** 运行器是故障隔离进程，不是恶意脚本沙箱。只播放你信任、已核对目标环境和操作影响的项目。
- **停止不等于回滚。** 应用取消执行，再独立清理并保存回执。强杀无法保证回调执行；恢复需要 Profile 事先声明精确句柄与幂等入口，旧 Profile 或版本不匹配时需人工核对。见 [技术架构](docs/architecture.md)。
- **手动等待不等于业务成功。** 继续或超时后仍需实际 verify。含手动步骤的流程不能直接导出 PPTX，需另备已授权的纯自动版本。
- **打码是呈现效果。** DOM/API 原值仍存在，模糊也不保证不可辨认，不能替代业务脱敏。
- **浏览器能力需核对。** 内置模式以单个主页面为主，会拦截网页弹窗；多窗口、Chrome 扩展等特殊流程应选择外部模式并单独适配验证。
- **PPTX 会重新执行流程。** 它不是连续录屏，控件不可单独编辑。声音和计时应在实际使用的演示软件中验收；失败或停止不覆盖旧目标。见 [技术架构](docs/architecture.md)。
- **转换需要适配。** TC 的 fixture、登录、数据、断言、清理和复杂浏览器能力须逐项映射，不能把任意测试文件直接当演示播放。

客户端没有模型账户，不自动把业务内容发送给外部智能体。使用你自己的智能体产生的模型费用由该环境决定。当前平台与通过项以 [验证记录](docs/verification.md) 为准；实现细节见 [技术架构](docs/architecture.md)，产品取舍见 [产品方案](docs/product-plan.md)。

## 许可

客户端与 SDK 由 **jakara** 以 MIT 许可发布，见 [LICENSE](LICENSE) 和 [许可范围](LICENSE_SCOPE.md)。公开基础接入引导的适用范围同样以许可范围说明为准。

专业 Skill 不纳入上述 MIT 许可，不进入公开源码和分发包，后续通过 WorkBuddy 市场单独分发；目前尚未上架，没有购买链接。

已有公开 Git 历史保留。本次 MIT 授权不对历史专业 Skill 内容重新授予许可，也不表示已经收回或抹除过去公开的内容。
