---
name: playbook-wright
description: 为 Playbook 桌面播放器创作、维护与验证业务脚本和 Profile，整理演示需求，配置内置播放、自动讲解与用户实操交接、语音和打码，并与原生 Playwright TC 双向复用或转换。配合用户自己的智能体使用。
---

# playbook-wright · Playbook 创作与维护

帮助用户把“希望怎样演示”变成可验证的 Playbook 业务资产。用户自己的智能体负责创作、维护、效果调整、Book/Section 编排和 TC 转换；桌面应用负责项目浏览、搜索、播放、暂停继续、停止重播、PPTX 导出与运行反馈。Playwright 继续执行原生操作和断言。业务脚本、Profile 与清单留在业务仓库，不把客户脚本、凭据或证据写入产品仓库。

主调用名为 `$playbook-wright`；旧 `$playbook-playwright` 通过同级兼容 Skill 读取本文件，执行同一套指引。

## 开始时

先按 [应用检测与安装](references/installation.md) 检查本地 Playbook：运行本 Skill 的 `scripts/install.sh --ensure-app`，已有兼容版本则复用，缺少时从官方 GitHub Release 校验后安装。安装不消耗模型 API。当前仅提供 macOS arm64 安装包；云端或不支持的平台无法直接检查用户电脑，应明确说明并提供用户端安装指引，不能把云端安装当作本机安装成功。

先识别用户是在创作、维护/调整、转换还是修复，读取与本次目标有关的已有脚本、页面、测试及环境。不要假设必须先有 TC，也不要把用户已说清的要求变成固定访谈。

先读 [可用功能与选择方式](references/capabilities.md)，了解当前能力并按用户目标选组合：

- 项目文件夹与 Book、Section Tab、单脚本及两级批量播放。
- 开场、章节、箭头、蒙层、光标、点击效果、渐变柔边与前后停留。
- 页面区域遮盖/模糊、本机语音与本地录音、同步播放控制。
- 可选内置浏览器，以及讲解后交还操作权、倒计时或手动继续的混合演示，见 [内置播放与手动操作](references/interaction.md)。
- 客户端原生悬浮条的显隐、拖动、收起/展开、全局快捷键与恢复 Chrome。
- 暂停后选择页面元素添加批注、显示页面图标，并复制含页面、元素及 Playbook 步骤上下文的提示词，见 [页面批注与复制格式](references/annotations.md)。
- 只读浏览、搜索与从磁盘刷新、项目移出、经确认的 Book 清单删除（保留脚本与备份）、执行快照、运行反馈、TC 双向转换和 Skill 安装更新。
- 停止、关窗/退出协调、独立清理预算、持久化回执与 Profile 可选崩溃恢复。
- Book/Section/脚本回放导出 PPTX：页面截图、内嵌语音、按讲解换页与演讲者备注，见 [PPTX 导出](references/pptx-export.md)。

创作或修改资产时读取 [契约](references/contract.md)；其余按实际工作只读取对应指引：

- 从需求或手工操作生成脚本、需要补齐意图时，读 [需求引导与创作](references/authoring.md)。
- 管理脚本、修改讲解/效果、编排或根据反馈修复时，读 [维护与呈现调整](references/maintenance.md)。
- 收到 `playbook.annotation.v1` 批注时，读 [页面批注与复制格式](references/annotations.md)，核对当前代码和页面后修复。
- 创建/修改 Profile、处理停止/关窗/崩溃、迁移资源清理时，读 [生命周期与恢复](references/lifecycle.md)，保留既有资源归属与清理策略。
- 需要留在应用中播放、邀请观众实操或真实安装 Skill 时，读 [内置播放与手动操作](references/interaction.md)；手动步骤的 run 不由桌面自动执行，不能将等待结束当成业务完成。
- TC 转脚本时，读 [TC → Playbook](references/tc-to-playbook.md)；转回测试时，读 [Playbook → TC](references/playbook-to-tc.md)。共享模式为默认，用户要求脱离 Playbook 时才独立导出。

已有项目契约与本 Skill 不一致时识别差异，按实际 SDK 与播放器支持范围适配，不悄悄改写版本。沿实际 import 查阅 fixture、helpers、配置与 setup/teardown，不能只转换测试正文。

当前安装页 Skill 版本为 **0.11.0**，适配客户端 v0.6 及以上；页面批注需要 v0.8.0。清单、脚本与 Profile 的 `schemaVersion` 仍为 `1`，SDK 包版本另行核对。旧脚本可继续使用；内置浏览器与手动交接需要 v0.6 播放器。`@playbook/core` 提供 `definePlaybook`、`defineProfile` 与 `runPlaybook`；桌面打包器解析应用自带 SDK，不要求业务仓库从公共 npm 安装。独立类型检查或 TC 运行则需要实际可解析的本地 SDK/依赖，不能凭包名自动安装未知包。

安装页可安装到 Codex 的用户级 `~/.agents/skills/playbook-wright` 或所选项目目录下的 `.agents/skills/playbook-wright`，以及 Claude Code 对应的 `~/.claude/skills/playbook-wright` 或 `.claude/skills/playbook-wright`。项目安装由用户在系统文件夹选择器中指定智能体打开的项目目录，不要求先登记到 Playbook 或存在 `.playbook.json`；目标追加框架固定的 Skill 子目录，不自动猜测或改为上级仓库。已有安装先预览状态，按安装页的确认与备份机制更新，软链接由用户自行管理。安装器同时写入主 Skill 与同级 `playbook-playwright` 兼容入口，逐一预览并保护两者的本地修改；更新旧安装先备份。若第二个入口失败，已完成的主入口保留，显示未完成并可重试；不宣称跨两个目录原子替换。安装成功只代表两个入口的文件核验通过，需在目标智能体重新加载或开启新会话，确认调用当前版本。

交付可由桌面直接添加的项目：根目录 `.playbook.json`，清单引用的 `.playbook.ts` 与 `.profile.ts`，以及实际所需的业务 helpers。界面统一使用“项目”，工作区是契约中同一目录的技术称呼，不建立另一份资料库。清单按 Book → Section → 脚本组织；界面左侧仅“项目文件夹 → Book”两层，打开 Book 后右侧用 Section Tab 平铺脚本。Book/Section 只保存引用和顺序，不复制动作。顶层默认导出和步骤元数据必须是静态 literal，业务动态行为保留在原生 callbacks 中。不要生成未受支持的动作 JSON、编辑器或自动转换 CLI。

## 语义边界

- 保留 Locator、动作顺序、事件等待、断言预期、账号角色、mock/fixture、数据准备和清理的实际语义。保留原测试，除非用户授权替换；共享迁移可新增 TC 适配入口供对照。
- 手动交接 interaction 先讲解再归还操作权，桌面不执行该步 run；继续/超时后 verify 仍需有效检查。runPlaybook 继续用 run 作为 TC 自动适配，无法安全自动化时显式 skip，不把未做任务报成成功。含 manual 的资产不能直接导出 PPTX。
- 讲解、蒙层与阅读时间属于演示元数据，不能代替业务断言或用固定等待修补缺失的结果条件。不要把 `fill`、键盘事件、上传、API 写入等改成“看起来差不多”的操作。
- 光圈柔边、流程级打码与语音由脚本元数据描述。按实际需求选本地朗读或工作区录音；不把敏感值抄进讲稿。打码只改变观看效果，DOM/API 数据仍存在，不能替代业务脱敏。TC 复用/导出忽略这些纯呈现字段，不将遮盖实现迁入测试。
- 区分 real / fixture / mock，声明业务副作用与重播条件；元数据不是安全拦截器，`read-only` 必须由实际路径和运行证据支撑。
- 不把测试专用账号、临时权限、绕过登录、路由 mock 或测试数据库准备默认移植到客户现场。可以忠实保留为模拟演示并标识来源；需要真实服务时另外实现并验证 Profile。
- 测试生命周期仍由 Playwright Test 管理，演示登录、角色、数据准备和释放由业务 `defineProfile` 提供。`prepare({ page, workspaceDir, parameters })` 返回 `{ context, release? }` 的旧接口继续有效；v0.5 可选接收执行 signal、runId/flowId 与提前 registerCleanup，登记须 await 后再创建资源。清理独立于执行取消，恢复仅接受 Profile 声明的精确非敏感句柄和幂等入口；不能扫描清理或改变旧 run 策略。配置相对 `workspaceDir` 解析。不要在共享流程中调用 `test()`、`test.use()`、`test.beforeEach()` 或隐式依赖 TestInfo。
- 动态分支、复杂闭包、自定义 matcher、数据库 fixture 或多页面协作无法直接映射时保留原 helper 依赖并说明适配要求。只阻塞确实依赖缺失信息的部分，不用空函数或 TODO 冒充可运行转换。
- 本 Skill 不授予执行客户数据写入或生产清理的权限。优先在已有隔离测试环境验证；原用例本就包含的写入也要确认运行目标与当前授权一致。

## 交付与验证

按任务交付目标脚本和适用的 TC/环境适配入口；涉及 TC 转换时，按 [报告规范](references/conversion-report.md) 记录对应关系和验证结果。能从原代码确认的内容自行确定，不要求用户重复提供。

普通创作和小范围调整可直接说明需求、文件、实际验证与缺口，不强制另建 PRD 或转换报告。涉及 TC 转换时使用上述报告规范；同步清单中的脚本、Profile、标签和 Book/Section 引用。按 Book 或 Section 播放时，所有脚本使用所选同一 Profile，每个脚本单独 prepare/release，不能依赖上一脚本的页面或内存上下文；前段释放未确认成功时不启动后段。

进度和播放控制由客户端提供：内置浏览器显示窗口顶部控制栏，页面可返回项目后再次打开；独立浏览器使用原生悬浮条，约 3 秒无鼠标/键盘活动后隐藏，活动后显现。默认系统快捷键为 `CommandOrControl+Alt+P`，用于播放/暂停；注册失败会提示。脚本描述开场、箭头、蒙层、柔边光圈、打码和语音，不向业务页面注入进度条、快捷键 hook 或另一套控制 UI。语音随暂停/继续/停止同步；播放栏可拖动、收成小条并展开，继续时恢复并请求置前当前受控页面。这些客户端控制不是单脚本呈现参数，细节见能力索引。

分别核对业务项目的类型检查、桌面静态检查和实际播放。应用参数 `--check-workspace <工作区绝对路径>` 只检查静态元数据、引用与编译打包，输出明确标记 `typecheck: not-run`、`browser: not-run`；不能据此声称类型、登录、业务断言或视觉回放通过。具备已授权的隔离环境时运行实际入口；TC 转换还应对照原用例与转换后入口，可行时用刻意失败的预期确认断言仍生效。

若生成负向用例副本，将它放在正向测试收集目录之外或明确排除；核对实际收集项，避免把预期失败副本混入正向通过结论。

收尾区分：已保留、已适配、需要补齐、实际通过、尚未验证。只有编译通过时不能声称业务等价或客户演示可用。输出具体路径、执行结果和最小剩余动作。

客户端 v0.7.1 支持可选的文字聚光：在有唯一 Locator `target` 的步骤中写 `presentation: { spotlight: 'text' }`。播放器读取该元素内真实可见文字的 `Range`，逐行突出当前视口内的文字并避让弹窗；业务 `run` 和 `verify` 仍按原 Locator 语义执行。省略此字段或使用 `element` 保持原有元素聚光；无目标的中央说明、图片和整页目标继续使用原模式。隐藏、空白或歧义目标会拒绝或隐藏聚光，不会保留上一步位置。完整参数见[契约](references/contract.md)和 SDK 类型。
