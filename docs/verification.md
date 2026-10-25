# README 与完整 Skill 开源 · v0.7.1 / Skill 0.10.1

日期：2026-10-25。按新的分发决定，客户端、SDK、完整 Skill、文档与图标统一 MIT，亦覆盖作者拥有版权的历史完整 Skill；旧版本记录保留，当前许可范围见 `LICENSE_SCOPE.md`。

- README 改为用途、安装、播放、项目文件和开发说明，保留 slogan，删除商业分层、图标寓意和重复宣传。按 no-ai-slop 的 `eval.md` 逐项复核；主 Agent 直接完成编辑与复核。
- 完整 Skill 的创作、维护、呈现、生命周期、PPTX 与 TC 双向转换资料恢复至公开 `skills/`，共18个源文件、11份参考资料。`.private/` 只保留本地历史快照，不参与打包。
- 全量 `npm run check`：196项检查，195通过、1平台跳过、0失败；3个示例 TC 通过，original/shared/standalone 三种入口均拒绝刻意修改的业务预期。日志 `artifacts/release-0.7.1/local-check.log`。两个 Skill validator 通过，README 与 Skill 的52个本地引用均存在。
- 隔离安装/发布测试50/50通过，覆盖0.7.0基础包与旧完整 Skill 的备份升级、本地修改/软链接保护、完整参考资料打包，以及本地快照和历史产物排除。
- 实际0.7.1打包客户端中，点击指定项目、选择临时目录并安装两个入口；核对18个文件摘要、11份参考资料和0.10.1版本。证据 `artifacts/release-0.7.1/desktop-verification-final.json`。文件选择器返回值由fixture提供，未声称实体选择器或当前Codex会话加载已验证；未修改用户真实框架配置或业务数据。
- 新 DMG/ZIP 已构建。远端CI和发布后下载结果以实际Actions/Release及本地独立证据为准，本节不预写远端成功。本轮未新增付费模型调用。

# 自动构建与开源分发 · v0.7.0 / 基础 Skill 0.10.0

日期：2026-10-24。本节记录本地验证；GitHub 构建/发布结果以对应 Actions 和 Release 为准。

- 客户端、SDK 和 community-bootstrap 基础引导使用 MIT。完整专业 Skill 已逐文件复制、校验到本机 `.private/skills/`，未加入版本管理。公开两个调用名只提供安装与接入，不能取得专业版。旧公开 Git 历史保留，许可范围见 `LICENSE_SCOPE.md`。
- 完整 `npm run check`：193 项自动检查，192 通过、1 平台跳过、0 失败；3 个示例 TC 通过，original/shared/standalone 三种入口都能拒绝刻意修改的业务预期。最终本地日志位于 `artifacts/release-0.7.0/local-check.log`。
- 安装 fixture：旧兼容应用复用并执行下载的独立 CLI、首次安装、幂等重跑、完整/专业版本保护、明确替换与备份、本地修改/软链接保护、固定 tag、错误摘要和不安全 tar 拒绝；并发目标占用时保持用户目录且不嵌套写入应用。测试不写真实智能体配置。
- 发布 fixture：新系列保留旧系列，同系列补丁先完整上传、核验、发布再删除较低补丁 Release；Git tags、draft 和 prerelease 保留。创建、上传、校验、发布或 tag 校验失败不会删除旧版；同版本普通推送不移动发布 tag。
- 实际打包 Electron 客户端混合验证 **10/10**：内置浏览器、手动交接、倒计时、暂停/继续、停止与 release、Book 共享上下文、PPTX 手动流程拒绝、外部兼容、正常退出和强杀后的精确缓存恢复。证据 `artifacts/hybrid-1792849619452/result.json`。只使用隔离 fixture，未操作业务数据；未声称实体快捷键或原生选择器已被人操作验证。
- 教程浏览器回放 **23/23**：同一 renderer 的更新教程及断言通过，证据 `artifacts/tutorial-browser-1792849701351/result.json`。此项不代替旁白时间、实体键盘或 native Electron 验收。
- 最终 DMG 和 ZIP 已构建；只读挂载 DMG 核验应用版本、Bundle ID、图标及5个公开基础引导文件；不存在 `.private` 或专业 references，见 `artifacts/release-0.7.0/dmg-verification.json`。安装包尚未完成 Apple 签名/公证。

上述本地证据与私有 Skill 不上传公开仓库；本轮没有新增付费模型 API 调用。

# 所有项目与 Book 可删除 · v0.6.3 / Skill 0.9.2

日期：2026-10-24。按用户要求取消内置教程和入门样例的不可删除限制，侧栏项目移出、Book 列表及详情删除均启用。所有条目使用同一入口和可取消确认框。此前版本的“内置保护”仅为历史行为，不再适用于当前版本。

- 内置项目移出和 Book 删除保存为本机设置中的稳定标识；刷新、重启或应用安装目录变化不会自动恢复。随包清单、脚本和 Profile 保留，避免写入已打包应用。普通业务 Book 仍先备份并修改业务清单。运行记录、资源归属及清理策略保持原语义。
- 本机设置写入前保留并核验备份，包括此前尚无 settings.json 时的初始状态。旧 schemaVersion 1 设置不需要迁移，新字段可选。明确重新添加内置项目可以恢复项目登记，已经删除的 Book 继续保持删除。
- 删除确认说明内置条目的本机保存方式，随包 Skill 0.9.2 同步全部可删除与恢复边界。播放或待核对清理的状态约束继续适用，不通过删除跳过清理。

验证：最终完整检查 **163 通过、1 项平台条件跳过**，SDK/样例类型检查、3 个 TC 及三种入口负向预期验证通过；新增测试覆盖删除状态跨安装目录与旧设置兼容。

实际打包 Electron 验证 **7/7**：[结果](../artifacts/builtin-removal-1792843197879/result.json)。覆盖内置入口启用、取消无写入、Book 删除与初始设置备份逐字核验、项目移出后重启、明确重新添加且不恢复已删 Book、详情删除教程、两项目全部移出、真实应用目录复制后删除状态仍保留。原始随包清单前后逐字一致，没有启动演示 Profile 或业务动作。验证使用隔离用户数据，目录选择器返回受控，不声称实体选择器操作验收。

普通项目管理回归 **10/10**：[结果](../artifacts/library-management-1792843196136/result.json)。保留普通 Book 清单备份、冲突保护、播放与清理约束、项目重启/重加及磁盘刷新行为。两入口 Skill validator、38 个引用及源码/应用/ZIP 校验见 [包核验](../artifacts/removal-2026-10-24/package-verification.json)。

交付：[Playbook.app](../release/mac-arm64/Playbook.app)、[macOS arm64 ZIP](../release/Playbook-0.6.3-arm64-mac.zip)。没有改动用户真实配置或艺工数据，零新增付费模型调用，未提交或推送。本轮没有重跑完整教程或办公软件放映，以下历史记录保留原样。

---

# 统一书本与播放图标 · v0.6.2

日期：2026-10-24。应用图标改为绿色圆角底的翻开书本，右页嵌入播放三角。侧栏品牌、Book 列表、空态、内置播放器标题及全局播放栏使用同一个图形源 `assets/playbook-mark.svg`，不改脚本接口或业务流程。随包 Skill 保持 0.9.1。

新增 `npm run icons`，使用本机 Chrome 和 macOS sips/iconutil 从矢量源生成 1024px PNG 与十种尺寸的 ICNS。打包配置指向该 ICNS，不再使用默认 Electron 图标；应用内由共用组件读取同一矢量图形。图形制作未调用生成式模型或云服务。

- 最终 `npm run check`：**162 通过、1 项平台条件跳过**，SDK/样例类型检查、3 个 TC 和三入口负向预期验证通过。没有为低风险图标替换添加复述实现的单元测试。
- 最终打包应用实际启动、导航与图标显示通过，无页面错误。已查看主页、Book 详情、侧栏、播放栏与 16/32/64/128px 图形预览：[结果](../artifacts/icons-2026-10-24/final2/result.json)、[主页](../artifacts/icons-2026-10-24/final2/home.png)、[大小预览](../artifacts/icons-2026-10-24/final2/sizes.png)。
- 实际应用 Info.plist 指向 icon.icns，与源文件字节一致；系统 iconutil/sips 成功解码十种表示：[原生资源核验](../artifacts/icons-2026-10-24/native-icon-check.json)。源码/应用/ZIP 及 SHA-256 核对见 [包核验](../artifacts/icons-2026-10-24/package-verification.json)。
- 早期辅助探针调用 Electron getFileIcon 时进程出现 SIGTRAP；后续一次附加 Dock 设置的启动也未在预算内得到窗口，已保留两轮失败结果与日志。最终移除额外 Dock 设置，使用应用包原生图标，重新打包并完成上述真实应用验证。未将图标查询探针、Finder 缓存或 Dock 实体交互记为通过；没有修改系统图标缓存。早期失败在同目录 result.json 和 final/result.json，最终通过在 final2/result.json。
- 本轮为图形与打包变更，没有重跑全部业务生命周期或完整教程；此前记录保留。没有操作艺工真实业务数据或用户应用配置，未提交、未推送。

交付：[Playbook.app](../release/mac-arm64/Playbook.app)、[macOS arm64 ZIP](../release/Playbook-0.6.2-arm64-mac.zip)。以下历史记录保持原样。

---

# 项目移出、Book 删除与磁盘刷新 · v0.6.1 / Skill 0.9.1

日期：2026-10-24。在现有未提交修改上增量实现，没有回退版本、提交或推送；没有操作艺工真实业务文件、数据或本机真实应用配置。测试的设置、项目和运行记录均位于隔离临时目录。

- 左侧项目“移出”仅删除应用登记，项目目录、脚本、Profile、录音、运行记录保留；旧设置中通过软链接登记的项目也能正确移出。设置修改先备份并核验；重启不会自动加入已移出的项目，重新添加仍读磁盘。
- Book 列表与详情新增删除入口。可取消的确认框说明目标与影响，默认聚焦取消，支持 Esc 和 Tab 焦点循环。确认后先核验并备份原始清单字节，再移除目标 Book 与同 ID legacy demos，避免下次扫描重新出现；其他 Book、未知清单字段、脚本与 Profile 保留。备份路径可在成功提示中展开。清单在确认后有变化则拒绝覆盖，须刷新后重新确认；符号链接清单拒绝写入。
- 顶部“从磁盘刷新”立即重新读取清单、脚本和 Profile，等正在扫描的任务结束后重读，不被后台扫描忙碌状态跳过。有效详情保持原位；损坏清单显示读取错误，修复后可刷新恢复。播放中仍允许刷新，本轮使用既有快照并标记来源变化，不重启或替换本轮执行。
- 内置项目/Book 保持保护。播放、清理或启动处理中拒绝删除；项目有待核对的清理记录时拒绝删除 Book，保留原恢复依据与历史。客户端新增的是有限的清单删除入口，浏览/刷新/播放仍不写源文件，不扩展为脚本编辑器或通用文件删除器。随包 Skill 0.9.1 已同步能力与恢复边界，旧调用名保留。

实际验证：

- 最终 `npm run check` 通过：**162 项通过、1 项平台条件跳过**；SDK/样例类型检查通过，3 个 TC 与三种入口的刻意失败校验通过。新增测试覆盖精确备份与资产保留、旧 demos/shadow 兼容、重复删除、过期目标/无效目标、软链接与备份失败保护、显式刷新与后台扫描并发。
- 打包应用项目管理 **10/10**：[结果](../artifacts/library-management-1792840998041/result.json)。实际 Electron、IPC 与真实临时磁盘文件，覆盖确认取消、清单冲突、删除/备份、刷新保持详情、错误后恢复、待清理保护、播放中保护与来源变化、软链接登记的项目移出、配置备份、重启和重新添加不恢复已删 Book。页面自动操作由 Playwright 完成，添加目录选择器返回受控，没有声称原生选择器或实体快捷键验收。
- 新界面在真实 Chrome 的独立 UI fixture 验证 8 组，包括弹窗焦点、取消、后端错误与窄窗口；它是模拟 API 的界面验证，和上述真实应用/磁盘结果分开。
- 打包版混合播放回归 **10/10**：[结果](../artifacts/hybrid-1792840764642/result.json)。内置教程完整 **23/23**，单独 Skill 节真实安装两个入口到临时项目后 **7/7** 续播完成：[教程结果](../artifacts/tutorial-v06-1792840930639/result.json)。未把练习数据或 UI fixture 当作真实文件安装证据。
- 已查看打包版实际列表、删除确认框和备份提示截图。早期测试对含备份详情的提示全文、异步刷新返回时机、损坏清单后的项目显示名有错误假设，已修正测试并保留失败结果；没有把这些失败覆盖为通过。失败目录：`artifacts/library-management-1792840830507`, `artifacts/library-management-1792840763124`, `artifacts/library-management-1792840927363`。
- 两入口 Skill validator、引用、源码/打包文件及 ZIP 核验记录位于 [交付核验](../artifacts/library-2026-10-24/package-verification.json)。

交付：[Playbook.app](../release/mac-arm64/Playbook.app)、[macOS arm64 ZIP](../release/Playbook-0.6.1-arm64-mac.zip)。本轮未新增 WPS/PowerPoint 放映、跨平台或签名公证验收。此前验证与失败证据继续保留如下。

---

# 内置播放与实操交接 · v0.6.0 / Skill 0.9.0

日期：2026-10-24，macOS Apple Silicon。基于现有 main / b334b8876e4ead227121b958f305ca2523bec3e6 和已存在的 v0.5 修改继续开发，没有回退或覆盖业务修改。未改艺工业务资产、真实数据或既有清理策略，零新增付费模型调用，未提交或推送。

## 实现与兼容

- 新增真正的 Electron WebContentsView 内置浏览器，由原 Playwright 运行器连接并执行；普通业务页面无客户端 preload。教程默认在客户端播放，旧脚本默认外部 Chrome，可在播放前覆盖选择。Book/Section 批量共享 BrowserContext，各脚本仍独立 prepare/release。
- 内置播放的控制位于客户端顶部，返回项目只隐藏页面，不停止本轮；独立播放继续使用原生悬浮条。页面自身不注入播放控制。
- 步骤可选 interaction.manual：旁白完成后交还操作权，隐藏提示、蒙层和演示光标；默认真实等待十秒，可提前继续、暂停倒计时；真实输入重新计时，文件选择和安装期间冻结，结束后重新计时。timeoutMs 为 0 可无限等待，onTimeout 可 continue 或 fail。桌面不自动执行 manual 的 run，交接后执行 verify；停止不执行后续业务步骤。
- 持久记录 continued / timed-out / cancelled 与真实安装结果，等待结束不等于任务完成。TC 保留自动 run/verify，不伪造用户操作；旧单参回调、Profile、清单和 schemaVersion 1 兼容。
- 教程扩为 3 Section、23 步。“现在安装 Skill”由用户选择范围/目录并亲自点击后，调用同一真实安装器；自动教学步骤仍保留练习数据边界。仅内置教程、当前手动步骤、匹配页面和用户操作可调用这三个有限接口。普通页面、其他步骤及结束后的写入拒绝。
- Skill 0.9.0、SDK 类型、产品方案及架构已同步，保留旧调用名。含 manual 的流程导出 PPTX 时明确拒绝，需另外提供已授权的纯自动副本；普通自动流程导出保持兼容。
- 浏览器临时会话与客户端界面分区隔离。正常退出清理自有缓存，崩溃重启仅核验持久索引中的精确临时路径、所有权标记和原 PID，保留未知状态及警告，不扫描业务资源。

## 验证结果

自动化与原生桌面操作分开记录。下列集成使用实际打包 Electron、WebContentsView、worker、Playwright 和真实临时文件，文件选择器返回受控，不是内存 VM：

- 最终 npm run check：SDK 构建、样例类型检查通过；156 项中 **155 通过、1 条平台条件跳过**；原始/共享/独立 TC **3/3**，三类入口均拒绝被破坏的预期。[日志](../artifacts/hybrid-2026-10-24/playbook-v06-check-final.txt)。
- 内置与混合播放 **10/10**：十秒自然继续（实际 10082 ms）、提前继续与真实输入、严格 CSP、暂停冻结、停止与 release、强制超时失败、批量会话和逐脚本释放、PPTX 提前拒绝、外部兼容、正常退出和强杀重启精确缓存回收。[最终结果](../artifacts/hybrid-1792835434305/result.json)。
- 最终完整教程 **23/23**：真实本机中文 TTS、箭头、柔边光圈、三个 prepare/release，真实十秒超时后继续。再次单独播放 Skill 节，实际安装两个 Skill 到新建的临时项目，磁盘文件逐字核验，继续后 **7/7** 完成。文件选择延迟期间继续按钮禁用；未操作的首次回放没有安装记录。手动交接时蒙层和演示光标不可见。[结果](../artifacts/tutorial-v06-1792835434353/result.json)、[实操画面](../artifacts/tutorial-v06-1792835434353/manual-ready.png)、[真实安装后](../artifacts/tutorial-v06-1792835434353/real-installed.png)。
- 普通自动 PPTX 最终包回归 **11/11**：本机 TTS、音频/计时/备注、单脚本与 Book/Section、暂停继续、失败停止保护原目标。[结果](../artifacts/pptx-packaged-smoke-1792835433952/result.json)。未新增 WPS/PowerPoint 实际放映或人耳试听验收。
- 同轮生命周期 **31/31**，含 12/25 秒清理、失败/停止、关窗/Quit 协调及崩溃幂等恢复。[结果](../artifacts/lifecycle-packaged-smoke-1792834906877/result.json)。之后只修正交接时引导层隐藏、教程显示文件数及说明文字；清理核心未再修改，后续内置和 PPTX 集成已重验。
- 两入口 Skill validator 和 **38** 个本地引用通过。最终打包只追加已校对的 Skill 文字及 SDK 类型声明，运行文件与通过上述最终回放的文件摘要逐一相同；源码/应用/ZIP 核验、CRC 和 SHA-256 见 [交付包核验](../artifacts/hybrid-2026-10-24/package-verification.json)。

视觉复查发现的第一版手动交接残留灰色蒙层问题已通过实际 isVisible 回归复现，并修复为明确隐藏整个引导根层；自动讲解恢复时重新显示。早期失败结果与日志保留，不将较早仅检查 popover 关闭的通过当作该视觉缺陷通过。[复现日志](../artifacts/hybrid-2026-10-24/playbook-v06-overlay-regression.txt)。

## 桌面与交付边界

本轮尝试用独立 QA 应用副本执行原生鼠标验证；Computer Use 服务未返回初始应用状态，约 2679 秒后报告 timeoutReached，QA 等待交接也超时。[QA 日志](../artifacts/hybrid-2026-10-24/playbook-native-hybrid.txt)。因此本轮未新增原生文件选择器鼠标、实体全局热键或人耳试听的验收；不能将受控选择器返回及 Playwright 点击当作这些项目通过。窗口 capturePage 不包含子 WebContentsView，embedded-window.png 只记录外壳，内置页面另用其真实 renderer 截图核对，不将空白外壳图称作原生合成画面通过。既有 v0.5 六项原生生命周期记录继续保留在下方。

交付：[Playbook.app](../release/mac-arm64/Playbook.app)、[macOS arm64 ZIP](../release/Playbook-0.6.0-arm64-mac.zip)。未签名公证。内置模式当前拦截新弹窗，需多窗口、多个独立 BrowserContext、扩展或特定启动参数的 Profile 使用外部模式。强杀仍不能保证回调执行，业务恢复仍须精确句柄、归属核验和幂等入口，不能声称任意崩溃下业务资源都已自动清理。

以下历史记录与早期失败证据完整保留。

---

# 内置 Playbook 使用教程 · v0.5.0

日期：2026-10-24。首页默认加入“Playbook 内置教程”项目，首本 Book 为“Playbook 使用教程”。包含 **3 个 Section、3 个脚本、22 步**，可全本或单节播放；原教师培训样例保留。教程项目不可移除，也不能被当作 Skill 安装目标。

教程按普通 schemaVersion 1 的清单、Playbook 与 Profile 实现，资产在 [examples/tutorial](../examples/tutorial/.playbook.json)。Profile 通过页面请求拦截提供同一套已构建 React 界面，配套内存练习数据，持续显示独立练习提示。不读写真实项目、安装目录、用户运行记录或系统剪贴板，不启动本地服务器、不触发云模型。添加项目、播放状态与路径选择是明确标注的练习；教程中的原生悬浮条/系统快捷键等讲解不等于实际触发这些系统能力。Skill 安装仅预览，写入入口明确拒绝。外层教程本身仍由真实桌面播放器执行并独立记录结果。

- `npm run desktop:build`、`npm run check:examples` 和 `npm run package:mac` 通过。`desktop:check` **75 通过、1 项非 macOS 条件跳过**。新增 `node scripts/tutorial-smoke.mjs` 在真实 Chrome 中直接执行 **22/22** 动作和结果断言，另覆盖 Codex/Claude Code 目标路径与安装拒绝；无外部请求。证据：`artifacts/tutorial-browser-1792828314480/`。
- 最终打包版实际点击首页教程、打开 Section、全本自动播放 **22/22 完成**，三个脚本分别准备页面；Driver.js 箭头、柔边光圈和本机 TTS 已运行并采集画面。再次从单节入口播放，外层客户端暂停、继续、停止通过，停止时后续步骤未执行。内置移除保护、首页顺序、无实际项目新增通过。证据：[打包版结果](../artifacts/tutorial-packaged-1792828493025/result.json)。
- 已查看首页、章节提示、说明弹窗与 Skill 路径预览的实际截图。证据中的内存播放状态不冒充真实业务回放或真实 Skill 安装；语音结束事件不代表人耳试听。打包验证用真实 Electron/worker、headless Chrome、本地朗读与隔离配置，未新增实体系统快捷键或原生文件选择器验收。随包文件与 ZIP 校验见同目录 `package-verification.json`。
- 随包 Skill 能力索引与 README 已说明教程入口、内容和练习边界；主/兼容调用名不变。版本号仍取应用自身版本，slogan 保持 `the show must go on`。未改动业务项目数据，未提交或推送。

此前验证记录与失败证据保留如下。

---

# 桌面 v0.5.0 / Skill 0.8.0 · 停止、退出与崩溃清理

日期：2026-10-24，macOS Apple Silicon。开工核对 main / `b334b8876e4ead227121b958f305ca2523bec3e6`，版本 0.4.1，工作区无未提交修改；应用仓库及父目录无额外 AGENTS.md。没有回退版本，没有修改艺工业务代码、真实业务数据或其审计证据，没有新增付费模型调用，也没有提交或推送。

## 实现与兼容

- 旧 `prepare({ page, workspaceDir, parameters }) → { context, release? }`、无参数 release、脚本/Profile/清单 schemaVersion 1 保持兼容；Book/Section 仍共享 BrowserContext，每个脚本独立 prepare/release。前段清理未确认成功，不启动后段。
- 可选执行 signal、runId/flowId、提前登记 `await registerCleanup(callback, { id, recovery? })`。登记得到持久化确认后才能创建资源；同一函数对象登记并返回只执行一次，同 id 不同函数拒绝，LIFO、本轮不自动重试。先取得 release，再校验 context。prepare 部分失败也释放已登记责任。
- 执行停止宽限默认 30 秒；每组清理另有默认 60 秒预算，各可配置 1～300 秒。清理取得独立 signal，保留页面至清理结束，不沿用已取消的执行 signal，不再套用旧 8 秒或累计 16 秒终止逻辑。无响应或强制终止保留 failed / unknown，不能伪报 stopped / succeeded。
- 清理回执落盘后才确定终态；停止意图不会被晚到 completed 覆盖。执行错误、清理错误、晚到错误与回执分别脱敏保存。关窗、Quit 和渲染器异常协调停止、清理、保存后退出；关闭浏览器不先于 Profile 清理。
- 原子写入并同步运行账本，重启发现未完成责任。可选 Profile recovery 只接受精确、非敏感 JSON 句柄；核对 workspace、Profile、run/flow/scope、恢复版本和源码快照后，才允许用户点击恢复。恢复不调用 prepare、不重跑业务、不扫描资源、不序列化闭包。已确认成功的责任不再恢复；业务入口仍必须幂等。
- 旧 Profile 无恢复声明时可正常播放，崩溃后显示人工核对；旧 run 默认保留，应用不更改业务 cleanupPolicy。SDK 类型、两入口 Skill 和架构说明已同步。最小接入示例见 [生命周期契约](../skills/playbook-wright/references/lifecycle.md)，使用隔离本地文件说明精确句柄、归属核验与 retain/purge。

## 自动化验证

下列均与原生桌面操作分开记录。最终源代码检查通过后只更新本验证记录，没有再修改实现。

- `npm run check`：SDK 构建、样例类型检查通过；119 项中 **118 通过、1 项非 macOS 条件跳过**；原始/共享/独立 Playwright TC **3/3**，三种入口均拒绝刻意破坏的业务预期。最终 `npm run desktop:check`：76 项中 **75 通过、1 项条件跳过**。日志：[完整检查](../artifacts/cleanup-2026-10-24/playbook-final-check.txt)、[桌面检查](../artifacts/cleanup-2026-10-24/playbook-final-desktop-check.txt)。
- 最终安装包生命周期 **31/31**：真实 Electron 主进程、utility worker、真实 headless Chrome 和临时文件资源；控制/退出通过 IPC 或 Electron API，不能替代原生鼠标键盘验收。覆盖正常、旧 Profile、run/verify 失败、执行与清理双失败、prepare 部分失败、错误 context + 有效 release、旧 prepare 失败结果未知；prepare/旁白/等待/run/release 中停止；控制页面错误、迟到终态/清理错误保留、停止预算不可被重复登记续期；清理失败/超时、worker 阻塞、不响应取消、批量顺序、PPTX 停止保护旧目标、版本不匹配拒绝恢复、恢复启动失败退出 busy、worker/main 强杀重启及幂等恢复、Quit 等待清理。
- 合法长清理实测 **12071 ms / 25069 ms**，结束后才记录 stopped；重复登记的 1000 ms 停止宽限实测持久化结束时间 **1002 ms**，没有被续期。证据：[最终 31 项结果](../artifacts/lifecycle-packaged-smoke-1792822392650/result.json)。
- 最终包 PPTX **11/11**，覆盖 Book/Section/单脚本、暂停继续、截图与旁白采集顺序、真实本机中文 TTS、内嵌音频/备注/计时、动作与 release、失败或停止保留旧文件。文件选择器返回受控；未新增 PowerPoint/WPS 放映或人耳试听验收。证据：[PPTX 结果](../artifacts/pptx-packaged-smoke-1792822481194/result.json)。
- 0.5.0 候选包原桌面回归 **29/29**：布局、搜索、只读资产、Book/Section、暂停/重播、快照、全局控制注册、Skill 安装与备份。证据：`artifacts/v03-packaged-smoke-1792821416075/`。此后补充的错误脱敏、晚到回执与竞态修复由最终完整检查及 31/11 项回归覆盖，不将较早轮次伪称为最后源码版本。
- 两入口 Skill validator、30 个 Markdown 本地引用通过；最终应用/ZIP 与构建源码核对 27 个运行文件、13 个 Skill 文件，ZIP CRC 通过。包校验与 SHA-256：[package-verification.json](../artifacts/cleanup-2026-10-24/package-verification.json)。

## 真实 macOS 桌面验证

使用独立标识的 QA 应用副本、headed Chrome、可销毁本地文件和专用用户数据目录，不接触真实业务资源或用户应用配置。电脑控制执行原生按钮、红色关窗和 Cmd-Q；强杀仅针对已核对路径/PID 的 fixture 进程。没有把纯内存 VM、受控 IPC 或模拟按键回调当作这些操作的证据。

1. 原生停止：12 秒 release 期间点击停止，实测清理 **12132 ms**，页面仍可用、清理 signal 未预取消，完成后 stopped / succeeded。
2. 原生关窗：25 秒 release 期间关窗，窗口等待清理 **25096 ms**，保存 stopped / succeeded 后退出。
3. 原生 Cmd-Q：业务步骤执行中取消，未启动后续步骤，清理与回执成功后进程退出。
4. worker SIGKILL：界面显示 failed / unknown；点击恢复精确删除一次，原执行失败历史保留。
5. main SIGKILL：重启识别未完成清理，历史中点击恢复，精确删除一次，不重跑业务。
6. 纯旧接口、无恢复声明：main SIGKILL 后重启显示人工核对，没有恢复按钮或自动删除；对应临时文件有意保留为未清理证据。

六项记录与截图、AX 文本、运行账本、事件及 fixture 见 [原生桌面结果](../artifacts/cleanup-2026-10-24/native/result.json)。早期 QA 副本的 CFBundleName 修改导致 helper 查找失败，仅修复 QA 副本并保留日志，交付包不受影响。早期 stopped 摘要文字滞后截图保留，后来已修正文案；六项验证后 Mac 锁屏，**最后一次最新文案的界面复看未执行**，不计为通过。空闲 QA 进程已按核验 PID 关闭，未中断业务回调。

## 交付与边界

交付：`release/mac-arm64/Playbook.app`、`release/Playbook-0.5.0-arm64-mac.zip`。本次未升级艺工项目已安装的 Skill 或改接其 Profile；新恢复能力的最小接入示例已随产品 Skill 提供，旧接口继续可播放。

强杀无法保证 finally 或回调执行；资源操作已成功但回执尚未落盘的间隙仍可能再次调用恢复，因此精确资源句柄必须在创建前登记，业务恢复必须校验归属并幂等。缺少声明、版本不符、仍有活 worker、清理超时或结果未知时，应用保留人工核对状态，不能声称所有资源已删除。没有跨机器、Windows/Linux、签名公证或真实艺工数据验收。恢复句柄只接受非敏感结构，业务仍不得把凭据装入不透明字符串。

旧版 VM 缺陷复现、早期进程验证失败和历史证据全部保留；VM 仅作旧缺陷定位。较早 PID 时机与停止时间观测方式的问题有独立修复和最终重验，没有覆盖失败记录。以下历史验证记录完整保留。

---

# 桌面 v0.4.1 / Skill 0.7.1 · PPTX 放映同步修复

日期：2026-10-21，macOS Apple Silicon。用户反馈声音被换页截断、画面错位后，使用电脑控制在实际 WPS Office 放映中复现并修复。上一版文件结构、渲染与自动检查通过的记录保留在下方；该记录没有完成实际放映，不能视为声音与画面同步验收。

## 修复与证据

- 原文件中章节/结果仅停留 400～750 ms，3.328 秒旁白页面恰好 3.328 秒，没有启动和句尾余量。现读取完整 WAV 的实际长度，旁白增加 1000 ms 余量，与原基础时间、最短阅读时间取最大值，并向上取整到整秒。章节/结果至少 2 秒，其余至少 3 秒。
- 切换音效改为每页独立的 audioFile/p14:media 对象与原生自动播放时间线。以 WPS 中手动插入的音频为结构对照，实际界面确认“自动、当前页播放、放映时隐藏、不循环”；不是视频对象，也没有跨页到第 1 页的设置。
- 开场/步骤截图移到对应旁白开始前，静态截图的光圈临时定位到目标，再恢复真实光标；原动作、断言和释放仍只执行一次。实际放映又发现完成页被截在淡入的低透明度阶段，已在截图时固定引导层动画；最终完成页清晰可见。
- `npm run desktop:check` 最终 **55 通过、1 项仅适用非 macOS 的检查跳过**；PPTX 模块 5/5。回归检查先证实旧实现会写入 3328 ms 而非安全的 5000 ms，并覆盖音频长度提示错误、无效 WAV、取消与已有目标保留。
- 最终包导出检查 **11/11**，真实 Electron/Chrome、本机中文 TTS、录音、暂停/继续、单脚本静音、失败/停止不覆盖等通过；新增在旁白启动前采集与截图卡片完全不透明的实际检查。证据 `artifacts/pptx-packaged-smoke-1792596340925/`。淡入缺陷的失败证据保留在 `artifacts/pptx-smoke-1792596248884/`。原桌面回归 **29/29**，证据 `artifacts/v03-packaged-smoke-1792595919946/`；此后只修改导出静帧冻结及 Skill 文字，最终重新打包通过。
- 最终实际放映文件为 `artifacts/pptx-export-demo-0.4.1-fixed.pptx`。286 次电脑截图覆盖约 31 秒，按顺序识别 10 页，约 28.32 秒进入结束黑屏；3.328 秒旁白页名义 5 秒、观测约 4.71 秒，结果页观测约 2 秒。采样包含截图耗时，第一张从启动约 1.16 秒后取得，不用于声称第一页面完整停留。第 4/9 页图片相同，按实际单调顺序识别；最终未采到中途黑屏。上一轮有一次短暂黑色采集，原因未确定，原记录仍保留于 `/private/tmp/playbook-wps-final-0.4.1/`，不将其改写为从未发生。
- 最终文件 56 个 XML/关系部件全部解析、79 条内部关系全部指向存在文件；10 页形状 ID 唯一、备注齐全、3 段 WAV 嵌入、无旁白外部文件依赖。每页名义时长为 3/2/5/2/3/2/3/3/2/3 秒，总计 28 秒。最终课件摘要、逐页实际截图、切换记录和原生音频设置在 `artifacts/pptx-wps-0.4.1-fixed/`。
- 最终 Playbook 0.4.1 .app/ZIP 重新构建完成；12 个包内 Skill 文件与源码逐字节一致。艺工项目根目录两入口为 Skill 0.7.1；更新前完整备份并核验字节，最终动画说明同步后再次备份主 Skill。回执 `artifacts/yigong-root-skill-pptx-sync-install.json`、`artifacts/yigong-root-skill-pptx-sync-final.json`。

## 验证边界

已完成 WPS 实际放映的画面、顺序、换页时长与原生媒体配置检查。电脑控制工具不能监听系统扬声器，**未声称人耳确认旁白完整或听感同步**；已请用户试听最终文件。本机仍没有 Microsoft PowerPoint，因此未将 WPS 结果等同于 PowerPoint 实机验收。导出检查使用隔离样例，不代表艺工真实登录、业务数据或客户环境验收；实体保存选择器、系统热键与其他平台不在本次新增验收内。

以下历史记录完整保留。

---

# 桌面 v0.4.0 / Skill 0.7.0 · PPTX 导出验证

日期：2026-10-21，macOS Apple Silicon。范围：Book、Section、单脚本的截图课件导出，换页节奏、内嵌音频与演讲者备注；清单/脚本/Profile schemaVersion 仍为 1，业务仓库代码未修改。

## 当前结果

客户端通过系统保存窗口选择文件，重新执行原 Playwright 流程，在固定 1440×810 视口采集开场、章节、步骤提示、校验后的结果及完成页。引导帧保留箭头、蒙层与柔边光圈，结果帧隐藏引导并保留独立打码。截图为静态关键状态，不能在 PPT 中编辑业务控件或连续播放鼠标动画。

原始步骤及 Profile release 全部成功后才生成/提交文件，停止、断言失败不覆盖已有目标。换页时间取现有停留/移动配置与音频实际长度的较大值，结果页使用 afterMs；人工暂停、网络等待、语音生成和文件处理不计入课件时长。Chrome 将本地音频解码为内嵌 PCM WAV；Open XML 设置每页自动入页播放一次、静音页停止前一声音、自动计时换页。讲稿优先自定义 text，否则使用现有 explain/开场文案，录音不自动转录。

## 实际检查与证据

- `npm run check` 通过：SDK 与样例类型检查；单元检查 95 通过、1 项非 macOS 条件跳过；原始、共享和独立 TC 3/3 通过，三种入口均拒绝刻意破坏的业务预期。此后新增打包阶段控制检查，最终 `desktop:check` 为 53 通过、1 项条件跳过（54 项）；受影响 PPTX/控制检查 10/10。
- `npm run package:mac` 通过，产物为 Playbook 0.4.0 Apple Silicon .app 与 ZIP。最终安装包在 PATH 仅含系统工具的隔离配置运行；产品运行不依赖外置 Node 或 ffmpeg，仍需要本机 Chrome。
- 最终安装包 PPTX 检查 **10/10**，页面错误 0：Book 真实回放生成 10 页、3 段真实中文语音；导出中暂停/继续；Section 入口取消不执行；单脚本生成 4 页且保持静音；原始动作/断言/释放顺序正确；音频完整嵌入、备注对应、逐页计时与名义节奏一致；断言失败及停止保留原目标；运行记录保留输出。保存窗口返回受控模拟，没有声称实体文件选择验收。证据：`artifacts/pptx-packaged-smoke-1792593520490/`；可打开样例：`artifacts/pptx-export-demo.pptx`。
- 同一最终包首轮导出 `artifacts/pptx-packaged-smoke-1792593193811/` 中，10 页实际渲染为 PDF/PNG 并查看开场、引导、结果与总览，打码保留；56 个 XML 部件解析成功，76 条内部关系全部解析到文件，10 页含显式 cut 与自动换页，媒体无外部引用。另一次 LibreOffice 导入确认识别内嵌声音及显式切换；LibreOffice 对亚秒计时会取整，不能把它作为 PowerPoint 毫秒放映精度验收。
- WAV/MP3/M4A/OGG 四种双声道测试录音均通过真实 Chrome 解码和单声道 22050 Hz PCM WAV 转换，时长 3328 ms，内嵌前持续时间不短于音频。系统 ffmpeg 仅制作测试输入，产品不调用它。证据：`artifacts/pptx-audio-codecs/result.json`。
- 最终安装包原桌面回归 **29/29**：布局、搜索、Book/Section 顺序、暂停继续、停止重播、快照、失败、只读资产、原生控制、快捷键注册、双 Skill 安装与备份继续通过。证据：`artifacts/v03-packaged-smoke-1792593255604/`（历史测试命名前缀，实际包为 0.4.0）。系统输入按既有受控信号模拟，未重新声称实体组合键或听感验收。
- 两个 Skill 校验与 22 个本地引用通过，包内全部 12 个 Skill 文件和源码一致。艺工根目录两入口更新到 0.7.0，原 0.6.0 逐文件字节备份核验通过；新增导出指引解释入口、重播/业务影响、画面、计时、录音与备注映射、现有字段调整和验证边界。安装与恢复证据：`artifacts/yigong-root-skill-pptx-install.json`。本轮未再次消耗智能体调用验证，名称/兼容转发保持上一轮已验证实现。

## 验证边界

本机未安装 Microsoft PowerPoint，**尚未在 PowerPoint 实机确认自动放映与可听声音**；已验证标准文件属性、嵌入字节、真实 Chrome 音频解码/结束、幻灯片渲染及兼容软件导入，不能将这些等同于目标 PowerPoint 放映或人耳验收。PDF 不带声音/自动换页，只用于画面检查。其他操作系统、干净机器、真实艺工登录/数据/客户环境与签名公证均未新增验收。

早期验证工具的路径归一、隔离 HTML 字符串和返回列表后未打开 Book 等失败证据仍留在各 `pptx-*smoke-*` 目录；没有改写早期结果。兼容性检查发现缺少显式切换类型时部分软件忽略计时，已加入 cut 并重验最终文件。以下历史记录完整保留。

---

# 桌面 v0.3.3 / Skill 0.6.0 改名与兼容验证

日期：2026-10-21，macOS Apple Silicon。用户确认只将主 Skill 改名为 playbook-wright，并保留旧 $playbook-playwright 调用；产品名、SDK 名、业务资产和 schemaVersion 保持原契约。

## 实现与安装

完整指引迁移到 skills/playbook-wright，旧目录只保留轻量兼容入口与 UI 元数据，读取同级主 Skill，不维护第二份契约。安装器同时预览两个目标，识别原 playbook-playwright 安装记录；任一目标有本地修改/冲突时先保护整组，软链接阻止安装。每个目录分别备份、原子替换和校验；第二个入口失败会报告部分完成并允许重试，不声称跨目录原子事务。安装页显示两个路径、各自版本和全部备份位置；复制给智能体的上下文默认使用新调用名。

已按用户授权实际升级艺工学院根目录 .agents/skills：playbook-wright 主 Skill 与 playbook-playwright 兼容入口均为 0.6.0。迁移前的完整 0.5.2 旧安装（含安装记录）在应用备份目录保留，备份逐文件字节核验通过；两个新入口与产品来源校验一致。证据及恢复位置见 artifacts/yigong-root-skill-rename-install.json。没有更改业务脚本、服务或业务数据，也未安装到个人技能目录。

## 实际验证

- npm run desktop:build、npm run package:mac 通过；最终客户端 0.3.3。两个 Skill validator 与 19 个本地引用检查通过，最终包内全部 11 个 Skill 文件与产品源文件逐字节一致。
- npm run desktop:check：49 通过、1 项仅适用非 macOS 的检查按平台跳过，其中安装器 18 项。新增覆盖双入口安装/记录、旧版迁移/备份、本地修改阻止整组写入、兼容软链接不写入，以及第二入口提交失败后的明确部分状态与安全重试。原有安装回滚、锁、越界与文件保护检查继续通过。
- 最终应用包桌面检查 29/29，通过真实 Electron 页面、受限 IPC 与文件安装器确认双入口预览、安装、修改冲突与备份；页面错误 0。证据：artifacts/v03-packaged-smoke-1792587924165/（历史前缀，实际版本 0.3.3）。安装页截图已查看，主/兼容目标与状态可见。
- 使用当前桌面应用随附 Codex 0.163.0-alpha.10.2 的 skills/list 强制刷新艺工根目录，两项均返回 scope=repo、enabled=true，相关发现错误为 0。
- 同一随附 Codex 分别启动两次 ephemeral、read-only 调用：$playbook-wright 与 $playbook-playwright 均正常完成。实际命令读取入口、主指引和主能力索引，返回版本 0.6.0 及正确柔边、打码、朗读字段；旧名称调用明确读取兼容入口后转到新主 Skill。完整发现与调用证据：artifacts/skill-rename-codex-1792587839828/。

## 验证边界与既有轮次

未直接操作 Codex 桌面 $ 候选菜单：电脑控制工具禁止操作 Codex 自身，故明确采用其随附引擎的发现接口与两次实际调用。此前 Homebrew Codex 0.150.1 在读取现有新格式 features 配置时失败；未修改全局配置，改用桌面随附兼容版本后通过。原始失败及原名 0.5.2 验证证据仍保留于 artifacts/yigong-root-codex-invoke*。

本轮 Codex 验证只读取 Skill，未运行艺工业务演示；桌面回归使用隔离合成项目。系统活动/文件选择返回仍按既有测试方式受控模拟，不代表实体输入验收。此前语音试听、跨应用焦点与其他平台的未验证范围保留。

以下历史记录完整保留。

---

# 桌面 v0.3.2 / Skill 0.5.2 验证记录

日期：2026-10-21，macOS Apple Silicon。范围：项目级 Skill 安装独立选择文件夹，解除与已登记演示工作区的绑定；播放引擎、业务资产和 schemaVersion 未变更。

## 结果

原实现按已登记 workspace.path 追加框架 Skill 子目录；登记 demos/guided-replay 时，安装也落入该子目录。现通过“选择文件夹/更换文件夹”选择智能体使用的任意现有项目目录，不要求登记到 Playbook 或存在 .playbook.json。选择后按框架预览完整目标；取消保留原目标，更换后重新检查并清除旧安装回执。主进程只接受本会话通过选择器选过的目录，写入前重新核对可访问性及重定向；既有安装器的备份、冲突和校验机制保留。Skill、README 和架构说明同步更新。

- `npm run desktop:build` 与 `npm run package:mac` 通过；最终客户端 0.3.2、随包 Skill 0.5.2。
- `npm run desktop:check`：45 通过、1 项仅适用非 macOS 的检查按平台跳过，包含安装器 14 项。首轮两项播放控制检查的源码截取依赖固定函数签名；安装参数校验改为 async 后截取范围错误并出现 app is not defined。只修正测试截取标记后复验通过，未改动播放逻辑；首轮摘要保留于 `artifacts/v032-project-picker-unit-round1.txt`。
- 开发桌面与最终应用包各 28/28 项通过，页面错误 0。新增覆盖：未选择时禁止安装、未选目录的 IPC 拒绝、任意未登记/无清单文件夹（含中文与空格）、选择/预览零写入、取消保留目标、Codex/Claude Code 后缀切换、实际安装与本地修改备份、更换目标清除旧回执且不自动安装/登记。登记演示目录源文件摘要前后一致。
- 开发证据：`artifacts/v032-desktop-smoke-1792585409318/`；最终包证据：`artifacts/v03-packaged-smoke-1792585607077/`（历史前缀，实际版本 0.3.2）。安装与备份只在临时合成项目进行，未改动真实个人或艺工项目的 Skill 安装。
- Skill validator、18 个 Markdown 本地引用与变更空白检查通过；最终包内 9 个 Skill 文件与源文件逐字节相同。安装页截图已查看，选择按钮、路径与目标预览可见。

## 验证边界

上述安装页验证使用真实 Electron 页面、受限 IPC 和文件安装器；系统文件夹选择器的返回值受控替代，以可重复覆盖取消和不同目标，未将其当作实体鼠标完成原生选择器操作的证据。最终包测试 PATH 不包含外部 Node/npm；已有播放与全局控制回归仍通过，系统活动信号模拟和热键注册不替代实体输入。此前语音试听、跨应用焦点及其他平台的缺口按历史记录保留。

以下历史记录完整保留。

---

# Skill 0.5.1 / 客户端 v0.3.1 验证记录

日期：2026-10-21，macOS Apple Silicon。本轮只补齐随包 Skill 的能力发现、用法和边界，及相应版本标识；schemaVersion 仍为 1，播放引擎与呈现实现未变更。

## 已核对的范围

新增完整能力索引，并从 Skill 入口、默认提示、创作/维护指引与契约连接。覆盖项目文件夹/Book 两层导航、Section Tab、两级批量播放、引导/光圈/柔边、遮盖与模糊、朗读与录音、原生播放栏显隐/拖动/收起、全局热键、继续时恢复 Chrome、只读浏览/搜索/反馈、快照、TC 双向复用和 Skill 安装更新。明确区分客户端能力和脚本字段，不新增虚构接口。批量执行共享 BrowserContext 的会话边界也已写明。

独立只读审查按当前实现核对能力索引与相关指引，未发现需修改的实际问题。

## 实际验证

- Skill validator、全部 Markdown 本地文件引用及变更空白检查通过。
- Skill 安装器单元检查 14/14 通过。
- 一个只读取新版 Skill 与其引用的独立智能体，在隔离合成业务项目中生成 1 Book / 2 Section、2 份脚本与共享 TC，包含 32 px 柔边、cover/blur、TTS 开关及本地录音；同时保留原用例。父任务核验类型、清单引用、静态编译与录音快照冻结通过，原始 TC 字节未变。真实本机 Chrome 中原 TC 与共享 TC 2/2 通过。证据：`artifacts/skill-051-probe/`。
- 父任务的首轮隔离测试环境未声明 ESM，测试收集前出现 `No "exports" main defined`；保留于上述目录的 `artifacts/round1-esm-resolution.txt`。仅修正隔离项目模块配置后取得 2/2 通过，未修改生成的业务动作、断言或 TC。Skill 契约和 TC 指引已补充当前 SDK 仅有 ESM import 入口的解析要求，禁止为解决这一问题擅自切换整个业务仓库模块制式。
- 最终 `npm run package:mac` 通过。真实 v0.3.1 应用包的安装页识别旧 Skill 0.5.0 并完成“备份并更新”，5 项检查通过、页面错误 0；新能力索引与源文件逐字节一致，旧 SKILL.md 备份与更新前一致。隔离项目证据：`artifacts/skill-051-upgrade-1792580562745/result.json`，未更改用户个人智能体安装或真实项目配置。
- 最终包内全部 Skill 文件与源文件逐字节相同；播放运行器及 guide.js / guide.css / privacy.js / narration.js 与已保留的 0.3.0 包逐字节相同。

## 边界与生效

本轮样例的语音字段与录音快照已核验，未将 TC 通过当成实际引导播放或人耳试听证据；没有重复未变更播放引擎的全量回放。此前真实播放、系统输入与其他平台的验证结果及缺口按下方历史记录保留。

已有 Skill 安装需要在客户端安装页更新；安装成功表示文件落盘，目标智能体需重新加载或开启新会话后确认使用当前版本。客户端版本 0.3.1，随包 Skill 0.5.1。

以下历史记录完整保留。

---

# 桌面 v0.3 验证记录

日期：2026-10-21，macOS Apple Silicon。范围：渐变柔边、流程级画面打码、同步本地语音/录音，以及随包 Skill 0.5.0。schemaVersion 仍为 1，既有脚本默认不启用语音。

## 本轮检查

- `npm run check`：类型与样例检查通过，单元检查 88 通过、1 项仅适用非 macOS 的检查按平台跳过；原始、共享、独立 TC 的 3 项 Chrome 正向和负向预期回归通过。
- 开发桌面完整检查 24/24 通过，包含两层树、Section Tab、Book/Section 顺序播放、快照冻结、停止重播、原生播放栏和 Skill 安装备份。阶段证据保留于 `artifacts/v021-desktop-smoke-1792578865281/`（沿用的目录前缀，实际版本 0.3.0）。
- 真实 Chrome 三轮综合检查 17/17 通过：成功、播放中停止、损坏录音。证据：`artifacts/v03-presentation-smoke-1792578915350/`。
- 本机 Tingting 实际生成中文 WAV，246826 字节、120103 个非零 PCM 样本；缓存命中、取消清理、缺失 voice 明确报错通过。沙箱内首次导出为零数据，模块拒绝；本机正常进程导出成功，两轮原始证据均保留于 `artifacts/narration-source-real/`。

## 真实媒体和画面证据

录音在浏览器 Audio 中实际推进，暂停 650 ms 期间 currentTime 完全相同，继续后推进；录音与 TTS 均结束后才执行原业务动作。播放中停止的轮次业务动作数为 0、媒体 stopped/paused；损坏 WAV 的轮次 failed、业务动作数为 0，没有用定时等待冒充语音。

截图与浏览器检查确认默认 24 px 渐变柔边；cover 跟随滚动、DOM 替换、原生 dialog 和新文档导航，打码的按钮仍可由 Playwright 点击并通过原断言，标签未复制原始敏感值。blur 的计算样式与实际截图均检查。打码仅改变观看画面，DOM/API 中原始数据仍存在，blur 也不保证不可辨识。

音频内容参与变更标识，快照拷贝与越界/软链接检查通过；TC 执行器忽略柔边、打码和语音元数据，继续使用原动作、断言与生命周期。未新增云服务、模型账号或产品依赖。

## 尚未确认

原生 UI 工具本轮仍报告 Mac 锁屏。自动检查证明媒体解码/时间推进及控制同步，不代表已经人耳试听、确认音色或扬声器输出。跨应用前台焦点、实体输入体验和其他平台仍保留原先未验证状态。当前语音合成限定 macOS 本机已安装 voice；本地录音的其他操作系统兼容性尚未实测。

最终 `Playbook.app` 的 24/24 项桌面检查通过，页面错误 0，应用 PATH 不含外部 Node/npm；随包 Skill 0.5.0 的安装与备份也通过。证据：`artifacts/v03-packaged-smoke-1792579112542/`。

最终应用包另完整回放艺工本机 Book 12/12 步：各步中文 TTS 均有真实媒体时长，28 px 柔边、三个不透明遮盖区域和组织名称模糊均检查；原有业务动作、箭头与光圈保持同步，末步及 Profile 释放确认写入 0、课程摘要不变。视觉等待节奏为 0.2，语音保持配置语速。业务脚本/环境的独立 TypeScript 检查通过。使用本地模拟统一身份与受控测试身份，不代表学校 SSO 或采购终验。运行摘要在 `artifacts/v03-yigong-book/`，详细画面证据保留于艺工 `demos/guided-replay/artifacts/playbook-v03-book/`。

以下历史记录完整保留。

---

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
