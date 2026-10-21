---
name: playbook-playwright
description: 为 Playbook 桌面播放器创作、维护与验证业务脚本和 Profile，整理演示需求、调整讲解效果，并与原生 Playwright TC 双向复用或转换。配合用户自己的智能体使用。
---

# Playbook 创作与维护

帮助用户把“希望怎样演示”变成可验证的 Playbook 业务资产。用户自己的智能体负责创作、维护、效果调整、Book/Section 编排和 TC 转换；桌面应用负责项目浏览、搜索、播放、暂停继续、停止重播与运行反馈。Playwright 继续执行原生操作和断言。业务脚本、Profile 与清单留在业务仓库，不把客户脚本、凭据或证据写入产品仓库。

## 开始时

先识别用户是在创作、维护/调整、转换还是修复，读取与本次目标有关的已有脚本、页面、测试及环境。不要假设必须先有 TC，也不要把用户已说清的要求变成固定访谈。

读取 [契约](references/contract.md)，按实际工作只读取对应指引：

- 从需求或手工操作生成脚本、需要补齐意图时，读 [需求引导与创作](references/authoring.md)。
- 管理脚本、修改讲解/效果、编排或根据反馈修复时，读 [维护与呈现调整](references/maintenance.md)。
- TC 转脚本时，读 [TC → Playbook](references/tc-to-playbook.md)；转回测试时，读 [Playbook → TC](references/playbook-to-tc.md)。共享模式为默认，用户要求脱离 Playbook 时才独立导出。

已有项目契约与本 Skill 不一致时识别差异，按实际 SDK 与播放器支持范围适配，不悄悄改写版本。沿实际 import 查阅 fixture、helpers、配置与 setup/teardown，不能只转换测试正文。

当前安装页 Skill 版本为 **0.4.0**，适配客户端 v0.2；清单、脚本与 Profile 的 `schemaVersion` 仍为 `1`，SDK 包版本另行核对。`@playbook/core` 提供 `definePlaybook`、`defineProfile` 与 `runPlaybook`；桌面打包器解析应用自带 SDK，不要求业务仓库从公共 npm 安装。独立类型检查或 TC 运行则需要实际可解析的本地 SDK/依赖，不能凭包名自动安装未知包。

安装页可安装到 Codex 的用户级 `~/.agents/skills/playbook-playwright` 或所选业务工作区的 `.agents/skills/playbook-playwright`，以及 Claude Code 对应的 `~/.claude/skills/playbook-playwright` 或 `.claude/skills/playbook-playwright`。项目安装使用选定工作区，不自动改上级仓库；已有安装先预览状态，按安装页的确认与备份机制更新，软链接由用户自行管理。

交付可由桌面直接添加的项目：根目录 `.playbook.json`，清单引用的 `.playbook.ts` 与 `.profile.ts`，以及实际所需的业务 helpers。界面统一使用“项目”，工作区是契约中同一目录的技术称呼，不建立另一份资料库。项目内按 Book → Section → 脚本组织；Book/Section 只保存引用和顺序，不复制动作。顶层默认导出和步骤元数据必须是静态 literal，业务动态行为保留在原生 callbacks 中。不要生成未受支持的动作 JSON、编辑器或自动转换 CLI。

## 语义边界

- 保留 Locator、动作顺序、事件等待、断言预期、账号角色、mock/fixture、数据准备和清理的实际语义。保留原测试，除非用户授权替换；共享迁移可新增 TC 适配入口供对照。
- 讲解、蒙层与阅读时间属于演示元数据，不能代替业务断言或用固定等待修补缺失的结果条件。不要把 `fill`、键盘事件、上传、API 写入等改成“看起来差不多”的操作。
- 区分 real / fixture / mock，声明业务副作用与重播条件；元数据不是安全拦截器，`read-only` 必须由实际路径和运行证据支撑。
- 不把测试专用账号、临时权限、绕过登录、路由 mock 或测试数据库准备默认移植到客户现场。可以忠实保留为模拟演示并标识来源；需要真实服务时另外实现并验证 Profile。
- 测试生命周期仍由 Playwright Test 管理，演示登录、角色、数据准备和释放由业务 `defineProfile` 提供。`prepare({ page, workspaceDir, parameters })` 返回 `{ context, release? }`；配置相对 `workspaceDir` 解析，准备部分失败自行清理自身 hooks。不要在共享流程中调用 `test()`、`test.use()`、`test.beforeEach()` 或隐式依赖 TestInfo。
- 动态分支、复杂闭包、自定义 matcher、数据库 fixture 或多页面协作无法直接映射时保留原 helper 依赖并说明适配要求。只阻塞确实依赖缺失信息的部分，不用空函数或 TODO 冒充可运行转换。
- 本 Skill 不授予执行客户数据写入或生产清理的权限。优先在已有隔离测试环境验证；原用例本就包含的写入也要确认运行目标与当前授权一致。

## 交付与验证

按任务交付目标脚本和适用的 TC/环境适配入口；涉及 TC 转换时，按 [报告规范](references/conversion-report.md) 记录对应关系和验证结果。能从原代码确认的内容自行确定，不要求用户重复提供。

普通创作和小范围调整可直接说明需求、文件、实际验证与缺口，不强制另建 PRD 或转换报告。涉及 TC 转换时使用上述报告规范；同步清单中的脚本、Profile、标签和 Book/Section 引用。按 Book 或 Section 播放时，所有脚本使用所选同一 Profile，每个脚本单独 prepare/release，不能依赖上一脚本的页面或内存上下文。

进度和播放控制由客户端原生悬浮条提供，约 3 秒无鼠标/键盘活动后隐藏，活动后显现。默认系统快捷键为 `CommandOrControl+Alt+P`，用于播放/暂停；注册失败会提示。脚本只描述开场、箭头、蒙层、光圈等页面引导，不向业务页面注入进度条、快捷键 hook 或另一套控制 UI。这些客户端行为不是单脚本呈现参数。

分别核对业务项目的类型检查、桌面静态检查和实际播放。应用参数 `--check-workspace <工作区绝对路径>` 只检查静态元数据、引用与编译打包，输出明确标记 `typecheck: not-run`、`browser: not-run`；不能据此声称类型、登录、业务断言或视觉回放通过。具备已授权的隔离环境时运行实际入口；TC 转换还应对照原用例与转换后入口，可行时用刻意失败的预期确认断言仍生效。

若生成负向用例副本，将它放在正向测试收集目录之外或明确排除；核对实际收集项，避免把预期失败副本混入正向通过结论。

收尾区分：已保留、已适配、需要补齐、实际通过、尚未验证。只有编译通过时不能声称业务等价或客户演示可用。输出具体路径、执行结果和最小剩余动作。
