# 桌面 v0.2.1 验证记录

日期：2026-10-21，macOS Apple Silicon。范围：文件夹/Book 两层导航、Book 列表与详情切换、Section Tab、播放栏拖动与收起、恢复播放时激活受控浏览器。

## 本轮结果

- `npm run check`：类型与样例检查、38 项单元检查、3 份 TC 的 Chrome 正向及负向断言回归通过。
- `npm run desktop:check`：35 项通过，新增快速连续切换、准备期暂停/停止、浏览器恢复时序、较新暂停覆盖继续，以及播放栏位置/收起状态保持检查。
- 最终开发构建与应用包：各 24 项端到端检查通过，页面错误均为 0。包含两层树、列表优先、返回列表、Section Tab/键盘切换、关联搜索、原生栏收起/展开与位置保持。证据：`artifacts/v021-desktop-smoke-1792577662610/` 与 `artifacts/v021-packaged-smoke-1792577742055/`。安装包检查的应用 PATH 不含外部 Node/npm。
- 真实 Chrome 检查：确认本轮窗口实际处于 minimized，暂停后恢复至 normal，再继续完成 2 步，运行器正常退出。证据：`artifacts/v021-resume-smoke-1792577329037/`。

最终 0.2.1 应用包另完成艺工实际本地 Book 的 12/12 步（节奏 0.2），12 个目标箭头与光圈同步，末步及 Profile 释放均核对课程摘要不变、业务写入 0。使用本地模拟统一身份与既有受控测试身份，不代表学校 SSO 或采购终验。证据：`artifacts/v021-yigong-book/`。

桌面检查仍包含按顺序执行 Book 的 7 步和 Section 的 5 步、断言失败停止、快照冻结、single-run 保护、业务源文件摘要不变及 Skill 安装备份。新布局下搜索 Section 名称或脚本摘要也应返回所属 Book。业务脚本、清单与 Skill 契约没有变更。

## 反馈、轮次与实际限制

用户对 v0.2 的实体键盘反馈为部分正常，随后明确：继续时未把浏览器带回前台，播放栏无法移动或最小化。本轮已增加恢复最小化窗口并调用 `page.bringToFront()`、系统拖动区域、收成小条及保持位置；准备期与快速连续控制也保留最后一次请求。

真实 Chrome 首轮检查保留于 `artifacts/v021-resume-smoke-1792577293750/`：启动为 maximized 时直接请求 minimized 未生效，未进入恢复检查。第二轮将合成检查先显式恢复 normal，再最小化，取得上述通过；没有改写首轮证据，也没有绕过系统锁屏。

本轮原生 UI 工具报告 Mac 已锁屏，不能实际切换其他应用确认系统前台焦点或用实体鼠标拖动。自动检查在真实原生窗口上通过程序设置位置验证不跳回，通过按钮验证收起/展开，并模拟系统空闲和指针信号验证显隐；这些不替代实体输入。真实 Chrome 检查证明最小化状态恢复与继续执行，**跨应用置前和实体拖拽仍需解锁后复验**。

前版记录与限制保留如下，不以新一轮有限检查覆盖原结论。

---

# 桌面 v0.2 验证记录

日期：2026-10-21，macOS Apple Silicon。用户范围：项目 → Book → Section → 脚本、两级播放全部、原生自动显隐控制条与全局快捷键。

## 已验证

| 检查 | 实际结果 |
|---|---|
| `npm run check` | 类型检查、32 项单元检查、3 份 TC 的 Chrome 正向与负向断言回归通过 |
| `npm run desktop:check` | 29 项通过（含7个层级非法引用/重复子场景） |
| 开发版 `npm run desktop:smoke` | 18 项通过，页面错误0 |
| 最终 `.app` 的同组检查 | 18 项通过，应用PATH不含外部Node/npm |
| Book / Section 实际批量播放 | Book按2个Section执行overview→catalog，7步；独立Section执行catalog，5步；opening捕获顺序与实际完成数吻合 |
| 原生控制窗口 | 独立BrowserWindow与preload；暂停继续、停止、终态隐藏通过；受控浏览器DOM无`#ygd-toolbar` |
| 自动显隐 | 在真实原生窗口上模拟powerMonitor/screen信号验证：活动显示、3秒空闲隐藏、活动再显示；未把模拟活动当作实体输入证明 |
| 全局快捷键 | `CommandOrControl+Alt+P`注册成功，并通过真实globalShortcut注册表查询；详见未验证项 |
| 艺工实际Book | 最终应用包中12/12通过（加速0.2），课程摘要未改变，业务写入0 |
| Skill 0.4.0 | 随包安装、修改冲突与备份恢复核验通过；文档引用与Skill validator通过 |

18项检查保留原来的断言失败停步、只读源文件SHA256、启动版本冻结、single-run跨历史保护和Skill安装备份。新清单仍保留在艺工业务仓库，产品只包含合成样例。

## 轮次与限制

首轮双窗口验收误将隐藏控制窗口识别为主窗口，未找到项目页。修正验收窗口识别并明确原生窗口标题后取得上述18项通过。原始失败证据保留在`artifacts/v02-desktop-smoke-1792575182304/`；通过记录为`artifacts/v02-desktop-smoke-1792575258112/`及`artifacts/v02-packaged-smoke-1792575367516/`。艺工新Book证据在`artifacts/v02-yigong-book/`，详细业务截图另存业务仓库被忽略的证据目录。

系统热键已注册，但两轮通过当前UI自动化发送组合键未取得播放触发证据：首轮超时，第二轮复核注册和选择后仍未触发，随后关闭隔离会话。记录保留于`artifacts/v02-native-system-input/`及`artifacts/v02-native-system-input-round2/`，不列为通过。**实体键盘的全局播放/暂停及真实鼠标键盘活动显隐仍待人工确认。**

尚未新增其他操作系统、Intel Mac、多显示器全屏、干净机器、签名或公证验收。前一版历史结果保留如下，不改写。

---

# 桌面 v0.1 验证记录

日期：2026-10-21。范围为 macOS Apple Silicon 本机、Electron 45.0.0、Playwright 1.58.2、已安装的 Google Chrome。开发宿主 Node.js 26；桌面播放在 Electron utilityProcess 内执行。

## 开发版已执行

| 检查 | 结果与边界 |
|---|---|
| `npm run desktop:build` | SDK、主进程、运行器、preload 和 React UI 构建通过 |
| `npm run check` | 类型检查、20 项单元检查、原始 TC / 共享 Playbook TC / 独立导出 TC 的 3 项 Chrome 检查及负向断言检查通过 |
| `npm run desktop:check`（修正后） | 17/17 通过，含外部工作区快照加载原生 Playwright expect 回归 |
| `npm run desktop:smoke`（修正后） | 13 项端到端检查通过，页面错误 0；见下文 |
| 内置 `--check-workspace`（艺工目录） | 静态元数据、引用和 bundle 通过；明确返回 typecheck/browser `not-run` |
| 艺工真实本地工作区 | 12/12 步桌面回放完成；业务写入 0，课程完整对象摘要在末步与 Profile 释放时保持一致 |

13 项桌面端到端检查为：工作区发现、搜索、暂停、启动版本冻结、完整 5 步回放、箭头/光圈/原生 dialog 层级、停止与重播、7 步组合演示、业务断言失败停在第 3 步、超过显示历史范围的 single-run 保护、业务源文件前后逐文件 SHA256 不变、Skill 首次安装、本地修改 Skill 经明确替换后可核验备份。

合成检查使用隔离临时目录及无网络、无账号页面。Skill 只安装进临时业务目录，未修改实际用户的 Codex/Claude Code Skill。安装成功代表文件落盘并核验，不代表目标智能体已重新加载。业务示例保留在艺工仓库，产品内置样例为合成课程工作台。

艺工检查连接既有本地业务服务，走本地模拟统一身份和既有受控教师身份，回放节奏为正常时间的 0.2 倍。随后从最终 `Playbook.app` 以正常节奏再次完整通过 12 步，12 个目标箭头与光圈同步、dialog 层级均通过，末步及释放时再次核对写入 0 与课程摘要一致。它不是正式学校 SSO、采购终验或客户现场证明。业务暂停/重播操作未在该工作区另行逐项复验；这些控制已在合成工作区验证。

## 已发现与修复

保留各轮本机原始证据，不把早期失败改写为通过：

- round1：验收脚本未规范 `/var` 与 `/private/var` 路径；修正规范路径，并按规范工作区 ID 去重。
- round2：快照将 Playwright CommonJS 入口当作 ESM 导入，导致准备失败；改用原生 ESM 入口，增加外部目录实际 import 回归。
- round3：鼠标坐标传参形状不一致，导致光圈坐标无效；修正后用真实页面校验光标与蒙层孔洞坐标相等。
- round4：测试对安装页重复标签定位不唯一；精确定位后继续通过。
- round5：已有 12 项通过；独立审查发现运行页面步骤受源文件更新影响，以及 single-run 会随 100 条历史截断失效。保存运行步骤快照，保留全部执行记录（UI 只展示近 100 条），在启动前持久化执行标记，并新增检查；最终 13 项通过。

本机证据位于被忽略的 `artifacts/desktop-smoke-round1` 至 `round5`、`artifacts/desktop-smoke/`、`artifacts/yigong-desktop/`，不上传登录信息或临时项目路径。Electron 原生二进制下载遇到网络问题后，从官方发布下载并核验 npm 包内的 SHA256 后安装，未修改 Electron 依赖源码。

## 安装包验证

`npm run package:mac` 已生成 `release/mac-arm64/Playbook.app` 和 `release/Playbook-0.1.0-arm64-mac.zip`。随后直接使用包内可执行文件运行同一组桌面端到端检查，最终版 **13/13 通过**、页面错误 0；Skill 安装与备份使用随包最终 Skill 0.3.0。

包内检查时将应用 PATH 限制为 `/usr/bin:/bin:/usr/sbin:/sbin`，不含本机 Node/npm 安装路径；脚本编译、Chrome 播放及安装仍通过。这证明本机包内运行无需外部 Node/npm，不代表已在干净机器验收。证据为被忽略的 `artifacts/packaged-smoke/`，初版包检查另存 `artifacts/packaged-smoke-initial/`。

最终应用包还以正常节奏完成艺工真实本地 12 步回放（`artifacts/yigong-packaged/`，详细业务证据另存艺工 `demos/guided-replay/artifacts/playbook-packaged/`）。应用携带依赖，浏览器仍使用已安装的 Chrome。未配置签名、公证或自动更新；不把可直接启动等同于通过 Gatekeeper 分发或其他机器兼容性验收。

## 实际限制

尚未验证干净机器、Intel Mac、Windows/Linux、正式学校身份、客户环境数据恢复、多页面/frame 演示。当前没有应用签名、公证或自动更新。播放可信的本地 TypeScript，会执行其 Profile 与业务代码；客户端的只读资产管理和声明的 `read-only` 不构成脚本安全沙箱。普通播放不自动截图；本轮截图仅由明确的验收环境开关生成。

---

# 早期契约与方案验证记录

日期：2026-10-21。范围为本仓库 v0.1 契约、转换示例与 Skill，不是 Electron 产品验收。

## 已执行

| 检查 | 实际结果 |
|---|---|
| `npm run build` | 通过，TypeScript 契约与参考执行器可编译 |
| `npm run check:examples` | 通过，原 TC、Playbook、共享 TC 与独立导出 TC 类型检查通过 |
| `npm run test:unit` | 3 项通过：动作与断言顺序、失败阻止后续步骤、重复步骤 ID 拒绝 |
| `npm run test:examples` | 本机 Chrome 中 3 项通过：原 TC、共享流程 TC、独立导出 TC |
| `npm run test:negative` | 通过：将 fixture 标题改为 Changed task 后，3 个 TC 均因原有 Poster brief 业务预期而失败 |
| Skill `quick_validate.py` | 通过，命名、frontmatter 与脚手架完整性符合检查 |

浏览器检查在无网络、无账号的合成课程页执行。开发机 Node.js 26，Playwright 1.58.2；这不是 Node LTS、其他操作系统或 Electron 内置 Node 环境的兼容性验证。

负向检查的本机证据位于被忽略的 `artifacts/negative-verification.json`。安装包、桌面进程、Driver.js 呈现、客户登录和真实服务均不在这些合成检查的证明范围内。

## Skill 独立试转

另由独立智能体只读取 Skill 与一个含自定义 fixture 的工作坊 TC，在隔离目录生成 Playbook、共享 TC、独立 TC 及转换报告。原输入未改动；三个原生断言、两项动作及 fixture 准备/清理引用均保留，完整和独立范围的类型检查通过。

父进程复跑后，原始对照、共享入口、独立入口 **3/3 在 Chrome 通过**。把 fixture 的预期标题单独改为 Missing workshop 后，三种入口均在相应 `toBeVisible` 断言失败，负向检查通过。

验证过程中，首次浏览器启动受执行环境限制；首次本机复跑又因测试目录误收集负向副本而出现 3 通过/3 预期失败。两轮历史记录保留，排除证据目录后重新取得上述 3/3 正向结果，没有改宽业务断言。

试转发现并修正两处契约说明：独立导出允许继续引用业务 fixture；`safe` 的常规临时页面准备与 `reset-required` 的持久业务状态恢复作了明确区分。Skill 同时增加负向副本不应进入正向收集范围的说明。本机证据保存在被 Git 忽略的 `artifacts/skill-forward-verification/`，未将临时源码、trace 或机器路径推送远端。

## 关联业务样例

艺工业务仓库中的 `demos/guided-replay` 独立进行了真实本地平台检查：两次完整 12 步回放、暂停继续、结束重播、箭头与光圈同步、原生预览弹窗层级均通过；业务写入 0，既有课程摘要保持不变。

该业务样例已单独提交于艺工仓库，未复制到本产品仓库，也尚未迁移为 v0.1 Playbook 契约。此项证明现有独立演示样例可运行，不等于本仓库已经完成艺工集成或正式学校 SSO 验收。

## 尚未验证

Electron 管理界面与安装包尚未实施；utilityProcess 中的浏览器启动、打包资源解析、签名公证、无外部 Node 的干净机器运行、Windows/Linux、多标签页/frame、客户环境数据恢复及正式身份接入均待后续实施与验收。

## v0.2 AI 创作与只读客户端方案调整

本轮只调整方案、README 和 Skill 指引，未修改参考执行器、依赖、原转换示例或艺工业务资产。产品方案明确用户智能体负责创作/管理/效果调整，客户端负责只读发现、搜索与播放，并新增随包 Skill 安装设计。

已执行文档链接、变更范围、`git diff --check` 和 Skill `quick_validate.py` 检查，均通过。

独立智能体只读取合成页面和 SDK，未读取现成 TC/Playbook，根据完整的培训需求生成四步脚本，再按第二条需求调整预览说明、提示方向与停留元数据。调整前后 run/verify/target 和 ID 一致，预览 holdMs 从 3000 增加到 7000，side 从 right 改为 bottom。完整类型检查通过。

父进程审阅发现试作把观众“教师”混入执行角色声明，已保留原产物并修正为无需登录的 roles: []，同时澄清 Skill 的观众/身份区分。维护指引也明确区分点击前讲解和结果打开后的阅读停留，不能把元数据变化直接宣称为视觉效果已生效。

修正后，调整前/后两个入口在本机 Chrome **2/2 通过**；各自四个步骤完成、目标唯一可见，未发起网络请求。将合成页面标题改为 Changed task 后，两个入口均因 Poster brief 的原断言失败，证明错误结果仍会阻断流程。首次受限环境的浏览器启动失败单独保留，没有改写历史结论。

本机证据位于被 Git 忽略的 `artifacts/ai-authoring-verification/`。本次没有验证真实的 3 秒/7 秒呈现、箭头或蒙层渲染：参考执行器不实现这些能力。多轮真实需求访谈、客户端只读行为、文件监听、Skill 打包/安装/更新/加载和具体框架适配仍待对应实现后验证；本轮没有安装到任何本机智能体框架。
