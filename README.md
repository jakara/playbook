# Playbook

用自己的智能体配合 Playbook Skill，把需求、手工操作流程或已有 Playwright TC 整理成可讲解、可操作、可验证的演示，再继续复用于自动化测试。

**v0.3 增加柔边光圈、页面区域打码与同步语音讲解。** 项目仍是本地文件夹，左侧只展示“项目文件夹 → Book”两层树。首先展示 Book 列表，选中后右侧展示详情，Section 用 Tab 组织，脚本在对应 Tab 下平铺。智能体负责创作、维护、讲解调整和编排；Electron 客户端负责只读项目浏览、搜索、详情、环境选择、播放控制、运行反馈，以及按明确选择安装随包 Skill。应用内没有脚本编辑器、聊天窗口或模型账户。

演示在独立 Google Chrome 中运行，不是嵌入客户端的 WebView。Playwright 执行原生动作和断言，Driver.js 与本地呈现层提供开场、章节、箭头提示、蒙层、光圈和演示光标。播放进度和控制属于客户端的原生透明置顶悬浮条，不注入业务页面。

## 当前交付

| 内容 | v0.3 功能 |
|---|---|
| 只读项目 | 添加/移除项目登记，读取 `.playbook.json`，浏览 Book、Section 和脚本，按名称、摘要、标签、角色搜索 |
| 容器与脚本详情 | 展示内容、顺序、步骤、数据环境、操作影响和重播要求；选择已有 Profile |
| 播放器 | 独立 Chrome、引导呈现、原生动作与结果检查、暂停、继续、停止、从头再播 |
| 柔边与打码 | 光圈渐变柔边可调；按 CSS 选择器覆盖或模糊页面区域，跟随滚动和页面更新，不拦截原生交互 |
| 同步语音 | 默认关闭；macOS 本地文字朗读，或播放工作区内录音；讲解与最短停留都完成后再操作，随暂停/继续/停止同步 |
| 分层播放 | Book 与 Section 各有“播放全部”，按清单数组顺序串行执行；每个脚本独立准备与释放页面上下文 |
| 全局播放控制 | 原生悬浮条可拖动、可最小化，约 3 秒无输入自动隐藏，鼠标或键盘活动后显现；恢复播放时置前受控 Chrome；默认 `CommandOrControl+Alt+P`（Mac 为 `⌘⌥P`）播放/暂停，注册失败提示 |
| 运行反馈 | 当前步骤、进度、成功/失败/停止记录；复制修改或错误上下文给自己的智能体 |
| 文件变化 | 定期重新发现资产；本轮执行已构建快照，源文件变化提示下一轮生效 |
| Skill 安装 | 随包 `playbook-playwright`，支持 Codex / Claude Code 的个人或指定项目目标；预览、安装、更新、冲突保护和备份核验 |
| 样例与测试复用 | `examples/starter` 是客户端入门样例；`examples/catalog` 保留原始 TC、共享流程 TC 与独立导出 TC |

功能实现与验收结论分开记录。具体检查范围、结果和证据见 [验收记录](docs/verification.md)。

**业务演示资产归属业务仓库。** 艺工现有样例保留在艺工仓库的 `demos/guided-replay`，没有复制进产品。产品内置的是无账号的合成教学页面，不是艺工业务验收证据。

## 启动、构建与打包

源码开发需要 Node.js、npm 和本机 Google Chrome。在仓库根目录执行：

```sh
npm ci
npm start
```

`npm start` 先构建核心契约、Electron 主进程/运行器和 React 界面，再启动桌面应用。初次打开会展示内置入门项目，可直接播放样例或添加自己的业务项目。

只构建、不启动：

```sh
npm run desktop:build
```

核心代码输出到 `dist/`，桌面入口、运行器与界面输出到 `build/`。

在 macOS 上构建 Apple Silicon 应用和 ZIP：

```sh
npm run package:mac
```

输出位于 `release/`，应用目录为 `release/mac-arm64/Playbook.app`。当前包未启用签名、公证或自动更新。打包后的应用携带运行所需的 Node 环境和产品依赖，不要求用户另装 Node 或启动 Node 服务；**仍需要本机 Google Chrome**，以及业务 Profile 所需的服务、账号和外部条件。

## 接入自己的项目

让自己的智能体使用 [Playbook Skill](skills/playbook-playwright/SKILL.md)，先从 [完整能力索引](skills/playbook-playwright/references/capabilities.md) 了解功能，按当前 [契约](skills/playbook-playwright/references/contract.md) 维护工作区。参考布局：

```text
business-project/
  .playbook.json                 # 项目、Book/Section 顺序、脚本与环境引用
  demos/flows/*.playbook.ts      # 业务动作、断言、讲解与呈现参数
  demos/profiles/*.profile.ts    # 环境准备、角色与资源释放
  demos/audio/*                 # 可选的本地讲解录音
```

实际清单见 [入门样例](examples/starter/.playbook.json)。Book 使用 `sections` 数组，Section 的 `scripts` 数组引用已注册流程 ID。两级“播放全部”都按数组顺序执行，使用所选同一 Profile；各脚本独立 prepare/release，不共享上一脚本的页面和内存。旧 `demos` 清单兼容归一为 Book 和 Section，应用不改写源文件。

脚本须使用可静态读取的默认导出，例如 `export default definePlaybook({ ... })`；名称、要求和步骤说明等元数据直接写在 literal 对象中。浏览项目只解析元数据，不为显示标题执行脚本。“项目”和技术接口中的 workspace 指同一目录，没有另一份可编辑资料库。

先检查工作区发现、引用和构建是否可用：

```sh
npm run desktop:build
./node_modules/.bin/electron . --check-workspace "/absolute/path/to/business-project"
```

打包后的应用也可检查，无需外置 Node：

```sh
"/absolute/path/to/Playbook.app/Contents/MacOS/Playbook" --check-workspace "/absolute/path/to/business-project"
```

命令输出 JSON，成功退出码 `0`，失败为 `1`。它检查静态元数据、文件引用、脚本与 Profile 选择，以及能否生成运行 bundle；不打开业务 Chrome、不执行 Profile 或步骤，也不进行 TypeScript 完整类型检查。类型、业务动作和断言仍需各自验证。检查产物写应用用户数据目录，不写回业务源文件。

随后在“项目”点击“添加项目”，选择包含 `.playbook.json` 的目录。**点击播放会构建并执行该项目中的可信本地 TypeScript。** 客户端对业务资产只读，并不代表业务操作只读；脚本可以按声明写入业务数据。独立运行器用于生命周期与故障隔离，不是限制本地脚本权限的沙箱。

播放中可使用原生悬浮条或 `⌘⌥P` 暂停/继续；继续时先恢复并置前本轮 Chrome。拖动播放栏的文字或空白区域可调整位置，右侧“−”收成小条，点击“↗”展开；位置和收起状态在本次应用会话中保留。无运行任务时，快捷键播放主界面当前选择；终态可从头重播，仍受脚本重播条件限制。悬浮条按系统空闲时间和鼠标坐标判断活动，不记录按键内容，也无需额外全局键盘 hook 依赖。快捷键可能与系统或其他应用冲突，注册失败会在客户端明确显示。

## 柔边、打码与语音

这些设置由自己的智能体维护在 `.playbook.ts`，客户端仍只读播放。放在流程的顶层 literal 对象中，例如：

```ts
presentation: { spotlightFeather: 32 }, // 0–100 px，默认 24
redactions: [
  { selector: '[data-demo="logo"]', mode: 'cover', label: '品牌已遮盖', padding: 4 },
  { selector: '[data-demo="customer-name"]', mode: 'cover' },
],
narration: { enabled: true, voice: 'Tingting', rate: 185 },
```

打码默认使用不透明覆盖，也可指定 `mode: 'blur'` 与 `blurPx`。选择器需匹配实际页面，遮盖随滚动、重渲染、弹窗和同一主页面导航重新定位。它只改变观看效果，**原值仍在 DOM/API 中，不能替代业务安全脱敏**；blur 也不保证内容不可辨识。演示数据、讲稿和录音本身须适合目标观众。

语音默认关闭。启用后，开场读 title 与 summary，每步读 explain；可用流程 `narration.opening` 和单步 `narration` 设置 `{ text: '讲稿' }`、`{ audio: 'demos/audio/search.mp3' }` 或 `false`。文字与录音二选一；单步对象可独立启用。录音支持工作区内相对路径的 wav/mp3/m4a/ogg，单文件最多 20 MB，并随本轮快照冻结。

macOS 通过本地 `say` 生成 WAV，默认中文声线 Tingting、语速 185 words/min，无需云账户；所选声线须在本机可用。其他平台暂使用本地录音。当前讲解与最短停留均完成后再操作；暂停、继续、停止同步控制语音，无法生成或播放会明确失败。TC 复用和独立导出忽略柔边、打码与语音元数据，保留业务动作和断言。

## 安装 Skill 与创作

进入“Skill 安装”，选择框架、个人或指定项目范围，核对目标目录、版本与已有内容后点击安装。指定项目须为用户自己的项目，内置样例不作安装目标。

更新会先备份；发现修改或冲突时，须明确勾选“先备份再替换已有内容”。符号链接目标不写入，同版本且校验一致时不重复安装。安装器不修改全局规则、hooks、模型设置或凭据；文件安装成功不等于目标智能体已加载，仍需在该智能体中确认。

请求示例：

> 使用 `$playbook-playwright`，为首次使用的老师设计一段课程查找和任务预览演示，补齐必要信息并生成可验证的 Playbook script。

> 使用 `$playbook-playwright`，把任务预览多停留四秒，提示改到下方；保留原业务动作与断言。

> 使用 `$playbook-playwright`，将光圈边缘变柔和，遮盖页面 logo 和客户姓名，并用本地中文语音同步讲解；保持现有业务操作和断言。

> 使用 `$playbook-playwright`，将指定 Playwright TC 转为演示流程，保留原断言、fixture 和数据边界，列出未映射依赖与验证结果。

> 使用 `$playbook-playwright`，把指定 Playbook 脚本导出为独立 Playwright TC，保留准备、断言和清理逻辑。

客户端只复制上下文到剪贴板，不自动发给智能体或上传外部模型。TC 转换是 Skill 辅助的提取、适配与验证，不承诺任意测试文件一键全自动转换。

## 检查命令

```sh
npm run check
npm run desktop:check
npm run desktop:smoke
```

- `check`：核心类型、转换样例、执行语义与正反向浏览器检查。
- `desktop:check`：桌面发现/选择/构建、播放控制时序、原生控制窗位置及 Skill 安装器自动检查。
- `node scripts/presentation-smoke.mjs`：用隔离页面和真实 Chrome 检查柔边、动态打码、中文朗读/录音及暂停继续、停止和音频错误；需要 macOS 本机语音。
- `desktop:smoke`：用当前已构建的 Electron、隔离临时工作区和应用数据做端到端检查；先执行 `desktop:build`，需要本机 Chrome。它是合成样例验收，不替代真实业务集成。

## 当前限制与后续路线

当前开发及实测覆盖范围为 macOS Apple Silicon，具体通过项以验收记录为准。尚未完成 Intel、Windows、Linux 或干净机器验收；分发包尚无签名、公证与自动更新。

首版依赖本机 Chrome，使用独立临时浏览器上下文，不连接日常浏览器会话。当前引导以单个主页面为范围；跨窗口、复杂 frame、上传下载与系统对话框仍需专门适配和验收。

静态发现要求默认导出的 literal 元数据，运行器不自动安装业务依赖。登录、数据重置与资源清理由业务 Profile 提供并验证。暂停和停止在运行边界生效，已发出的操作不会自动回滚。

后续兼容性、发布加固和未实现能力见 [产品方案](docs/product-plan.md) 与 [技术架构](docs/architecture.md)。`@playbook/core` 当前是本仓库本地包名，尚未发布到 npm。
