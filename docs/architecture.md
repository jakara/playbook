# Playbook 技术架构

日期：2026-10-21。客户端 v0.1，脚本 `schemaVersion: 1`，随包 Skill 当前为 0.3.0。本文依据当前实现说明能力与边界；实际验收结果见 [verification.md](verification.md)。

## 进程与职责

```mermaid
flowchart LR
  Agent[用户自己的智能体 + Playbook Skill] -->|创作与维护| Assets[业务仓库：清单、脚本、Profile]
  Assets -->|静态只读发现| Main[Electron 主进程]
  UI[React 资料库与播放界面] <-->|受限 preload IPC| Main
  Main -->|构建本轮快照| Cache[应用用户数据目录]
  Main <-->|命令与状态| Runner[utilityProcess 运行器]
  Cache --> Runner
  Runner --> PW[Playwright 原生动作与断言]
  PW --> Chrome[独立 Google Chrome]
  Runner --> Guide[Driver.js + 本地呈现层]
  Guide --> Chrome
  Main -->|明确选择后写入| Installer[Skill 安装器]
  Bundle[随包 Skill] --> Installer
  Installer --> AgentDir[选定框架 Skill 目录]
  AgentDir --> Agent
```

| 模块 | 当前职责 | 写入边界 |
|---|---|---|
| 用户智能体 + Skill | 需求引导、脚本创建/维护、讲解与效果调整、组合演示、测试转换和修复 | 用户的创作环境维护业务资产 |
| `ui/` | 资料库、搜索、详情、已有环境选择、播放控制、记录与安装页 | 无业务文件写入 API |
| `desktop/preload.cjs` | 有限的 `window.playbook` 方法与完整状态订阅 | 不暴露任意文件系统、`ipcRenderer` 或代码执行接口 |
| `desktop/main.mjs` | 项目登记、重新发现、选择校验、构建调度、运行器生命周期、记录与剪贴板 | 应用设置、备份、记录、缓存与显式 Skill 安装 |
| `desktop/library.mjs` | 路径校验、静态 TS 元数据、清单引用、环境选择和 esbuild 快照 | 构建产物写应用缓存 |
| `desktop/runner.mjs` | 快照加载、Chrome、Profile、步骤调度、暂停/停止和事件 | 业务动作由可信脚本执行；管理自身临时资源 |
| `desktop/presentation/` | 开场/章节、Driver.js 提示、蒙层、光圈、演示光标和浏览器内控制 | 本轮页面注入 |
| `desktop/skill-installer.mjs` | 预览、版本/摘要识别、备份、替换核验与失败恢复 | 选定的本 Skill 目录及应用备份 |
| `src/index.ts` | 类型契约、`definePlaybook`、`defineProfile` 和测试复用参考执行器 | 业务准备与资源仍由调用者负责 |

主窗口关闭 Node 集成，启用 `contextIsolation` 和 `sandbox`。业务页面只在独立 Chrome，不加载 Electron preload。运行器是独立 Node 进程，但脚本与 Profile 仍是可信本机代码；独立进程不是恶意代码权限沙箱。

## 创作、发现与反馈

业务文件是创作端和播放端的接口。智能体维护清单、TypeScript 脚本与 Profile；客户端没有编辑器、编排面板、聊天或模型账户，也不直接调用智能体。

资料库按名称、摘要、清单标签和角色搜索，按项目、脚本/演示筛选。详情展示说明、步骤、数据类别、数据影响与重播要求；可选择已有 Profile、显示源文件位置或复制修改上下文。

反馈通过剪贴板交接，包含工作区、脚本/流程引用、运行状态、构建摘要和错误；用户自行粘贴给智能体。应用不自动发送任务消息或上传业务内容。

## 工作区发现契约

当前项目根目录须有 `.playbook.json`：

```json
{
  "schemaVersion": 1,
  "title": "业务演示项目",
  "profiles": [
    { "id": "training", "title": "培训环境", "file": "demos/profiles/training.profile.ts", "dataMode": "real", "parameters": {} }
  ],
  "scripts": [
    { "file": "demos/flows/course.playbook.ts", "profile": "training", "tags": ["教师", "课程"] }
  ],
  "demos": [
    { "id": "course-training", "title": "课程使用培训", "summary": "查看课程与预览任务", "scripts": ["course.preview"], "profile": "training" }
  ]
}
```

演示引用的脚本 ID 来自 TypeScript 默认导出。这是格式说明，不是产品提供的真实业务环境；可运行合成样例见 `examples/starter/`。

发现过程会规范化项目根目录，要求资产为根目录内的可读文件，拒绝绝对或解析后越界的资产引用，并校验版本、重复标识及脚本/环境/演示引用。

元数据由 TypeScript AST 静态读取，不 import 业务模块。当前支持默认导出的 literal 对象，或 `definePlaybook({ ... })` 的 literal 参数，允许 `as`/`satisfies` 包装；不解析变量引用、spread 和任意计算出的元数据。动作与断言仍是原生函数。

无效脚本保留为不可播放条目；工作区与演示引用错误明确显示，不自动修复源码。当前没有“保留上一份完整有效索引”的缓存策略。

客户端约每 1.4 秒重新发现一次。清单、脚本、Profile 与有界遍历的本地 import 内容参与项目 token；这不是全文件系统监听，也未覆盖任意动态读取资产或全部依赖锁变化。标签来自 `scripts[].tags`。Profile 参数不传 Renderer；私密值应由业务侧私有文件或既有凭据机制提供。

## 构建快照与检查入口

点击播放后，主进程重新发现、校验条目和环境数据类别，再由 esbuild 将脚本与 Profile 构建为本轮 `flow.mjs`。`@playbook/core` 指向产品内置核心，Playwright 来自产品依赖，其余依赖按工作区解析；首版不自动安装业务依赖。

产物写应用用户数据目录的本轮缓存。`snapshotHash` 来自构建代码与参数；构建后重新检查项目 token，期间变化则拒绝启动。本轮执行已构建快照，并保存步骤信息用于运行展示；来源变化只影响下一轮。

快照固定构建代码，不隔离业务服务、网络、运行时读取文件等外部状态，也未对整个项目依赖目录做可复现归档。

`--check-workspace <directory>` 走同一发现、选择与构建路径，输出 JSON 和退出码，不启动业务浏览器，不执行 Profile/步骤。结果明确含 `typecheck: "not-run"`、`browser: "not-run"`，不能当作类型或业务验收。

## 演示与测试入口

桌面入口：选择脚本/组合与已有 Profile → 构建快照 → `utilityProcess` 加载 → 本机 Chrome → 每脚本准备上下文 → 引导、动作、断言 → 释放资源 → 记录结果。

测试入口继续使用原项目 Playwright Test 的 fixture、配置、报告和 teardown，通过 `runPlaybook`/`test.step` 复用同一流程，或由 Skill 导出独立 TC。

桌面运行器使用 Playwright Library，不继承任意 TC 的 runner 生命周期。任意 `.spec.ts` 不能直接作为演示模块 import；转换须映射 fixture、认证、准备、事件等待、断言和清理。未映射依赖须列为缺口，不承诺任意 TC 自动转换。

## Profile 与数据边界

Profile 默认导出 `defineProfile({ ... })`，提供 `schemaVersion`、`id`、`title`、`dataMode`、`roles` 和 `prepare({ page, workspaceDir, parameters })`。成功返回 `{ context, release? }`，`context.page` 必须是运行器提供的页面。Profile 负责业务地址、登录、角色、前置数据与自身资源，部分准备失败的内部清理也须自行保证。

运行器校验脚本 schema、数据类别和所需角色。`reset-required` 要求 Profile 声明 `resetBeforeRun: true`；实际重置仍由 Profile 实现并验证，声明本身不会重置数据。`single-run` 在开始执行前持久化执行占用，避免直接重播已可能产生作用的流程；后续须先核对数据并完善恢复策略。

组合演示按清单脚本 ID 串行运行，每个脚本重新创建页面并 prepare/release，不隐式共享前一个脚本的内存上下文。JSON 保存引用和顺序，动作与断言保留在 TypeScript。

## 播放控制与呈现

Renderer 调用 `play({ workspaceId, entryId, kind, profileId })` 与 `control('pause' | 'resume' | 'stop')`。主进程按当前 runId 接收事件；`getState` 与 `onState` 提供完整状态。运行历史持久保存，界面只展示最近 100 条。

```mermaid
stateDiagram-v2
  [*] --> preparing
  preparing --> playing
  preparing --> failed
  preparing --> stopping
  playing --> pausing
  pausing --> paused
  paused --> playing
  playing --> stopping
  pausing --> stopping
  paused --> stopping
  playing --> completed
  playing --> failed
  pausing --> failed
  paused --> failed
  stopping --> stopped
  stopping --> failed
```

步骤顺序：校验目标唯一且可见 → 滚动定位 → 说明与阅读停留 → 光标移动与点击反馈 → 移除遮挡操作的呈现 → 原生 `run` → 原生 `verify` → 更新结果。无目标步骤使用居中说明；新文档重新注入引导。Driver.js 与呈现资源从应用本地读取，不依赖 CDN。

当前支持脚本级光圈半径、蒙层透明度、光标移动时间、默认停留和开场时间，以及步骤级章节、方向、停留与操作后间隔；核心契约校验参数范围。

暂停在说明计时、光标移动和步骤边界检查。进行中的业务动作先进入“正在暂停”，待边界后暂停，不撤回已发出的请求。停止中断后续调度并关闭本次 Chrome，主进程超时回收；已完成的业务写入不会自动回滚。终态可在客户端或浏览器结束页重播，仍经过数据策略校验。

成功、失败和停止均尝试 release。完成/失败页面可留在独立 Chrome 供查看，下一轮或退出时回收；停止会关闭本次浏览器。当前引导范围为单个主页面，跨窗口、frame、上传下载及系统对话框需单独适配验收。

## 内置 Skill 安装

随包来源为 `skills/playbook-playwright/`。当前目标：

| 框架 | 个人目标 | 项目目标 |
|---|---|---|
| Codex | `~/.agents/skills/playbook-playwright` | `<project>/.agents/skills/playbook-playwright` |
| Claude Code | `~/.claude/skills/playbook-playwright` | `<project>/.claude/skills/playbook-playwright` |

用户先选框架/范围/项目，预览目标目录、版本、文件数和状态，明确点击才写入。内置样例不能作项目目标；首版不支持任意自定义路径或自动批量安装。

| 状态 | 行为 |
|---|---|
| `new` | 明确点击安装 |
| `installed` | 同版本且摘要一致，禁止重复安装 |
| `update` | 点击“备份并更新 Skill”后备份与替换 |
| `modified` / `conflict` | 须勾选“先备份再替换已有内容” |
| `symlink` | 保留原链接，不安装 |

安装器快照并哈希校验来源与目标，拒绝软链接、越界和不支持的文件类型；目标变化则停止。已有内容在应用 `backups/skills/` 完整备份并核验，附恢复说明，再替换与核验；失败尝试恢复。客户端尚无一键恢复页面。

仅处理所选 Skill 子目录，不改全局规则、hooks、模型设置或凭据；额外文件按安装规则尽量保留，同名冲突原件留在备份。文件安装成功不表示智能体已加载，当前未探测加载状态。

## 本地数据与分发

用户数据目录保存 `settings.json`、`runs.json`、`cache/`、`backups/`。项目登记修改前复制核验设置备份，再原子写入。历史运行持久化；重启不会自动恢复未完成业务动作。`PLAYBOOK_USER_DATA` 可为开发/验收指定隔离目录。

记录含步骤、进度、环境、时间、摘要与错误。脚本 stdout/stderr 不转发；错误做敏感字段遮盖和长度限制，不能保证任意业务文本完全脱敏。截图/视觉检查目前由验收环境开关启用，尚无用户 trace、视频或脱敏导出流程。

`desktop:build` 构建核心、主进程、运行器、preload 与 Vite 界面；`package:mac` 当前生成 macOS arm64 `.app` 和 ZIP。运行环境与依赖随应用交付，无需外置 Node。Chrome 使用本机版本，不捆绑 Chromium，不连接日常 Chrome，也不要求其远程调试端口。

## 后续路线与限制

只读库、静态发现、快照、独立运行器、单页引导、组合演示、控制、反馈和两个框架 Skill 安装已有实现；通过范围以验收记录为准。

当前实测范围为 macOS Apple Silicon，未完成 Intel、Windows、Linux 或干净机器验收。当前包无签名、公证与自动更新。

后续仍需按真实目标推进：业务仓库 Profile 与写入/恢复策略集成；发现与依赖变化覆盖；升级兼容和可检查导出；多页面/frame/系统交互引导；干净机器、签名公证与跨平台；更多框架适配和加载验证。是否捆绑浏览器、trace/视频、连接已有浏览器均属后续能力，不计入首版。
