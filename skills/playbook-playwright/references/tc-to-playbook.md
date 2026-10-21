# TC → Playbook

## 判断可演示的范围

检查目标 `test` 的完整标题、项目与配置选择、fixture 链、mock、测试数据、预期失败、并行限制与清理。失败/权限拒绝测试也可以演示，但必须忠实说明其预期，不能静默改成 happy path。

如果用户只指定一组测试，选择能说明完整业务价值且可安全复现的流程，保留其他测试。只有多个候选会实质影响目标时再问用户选择。

## 提取方式

1. 将原动作与业务断言提取为共享 `.playbook.ts`；使用静态 default definePlaybook 对象和 literal steps。上下文通过泛型 C 显式传入，保留 helper import，不复制密码和客户端配置。
2. 按可解释的业务步骤分组，标题与说明描述用途、即将执行的动作和结果。每步定位目标是演示辅助，不执行动作。
3. 原 TC 入口保留 fixture、hooks、test.use、project 和清理，改用共享流程或新增适配 TC 对照运行。保留原有超时、重试、serial、skip/fixme、expected failure 等适用语义。
4. 用 `defineProfile` 实际适配演示所需 baseURL、会话/角色、数据构造与释放，复用合适的 helpers。prepare 接收 page/workspaceDir/parameters 并返回 context 与必要的 release，准备失败自行清理自身 hooks；配置从 workspaceDir 解析。
5. 在业务项目 `.playbook.json` 注册 Profile 和脚本，按需加入 books → sections → scripts 编排；不复制业务动作。Book/Section 批量播放使用同一选定 Profile，每个脚本独立 prepare/release。不要将这些业务资产写入产品目录。不能直接运行的 TC-only 依赖给出最小适配缺口，不用 TODO 空壳宣称就绪。

不要把全部 beforeEach 搬进每一步，也不要把 afterEach 的数据库删除复制为客户演示结束动作。准备逻辑可以另写演示适配器，但原语义与新环境差异必须可审查。

## 常见映射

| 原 TC 内容 | 转换处理 |
|---|---|
| `getByRole().click()` / `fill()` | 保留原生调用；target 引用相应 Locator |
| `expect(locator).toHaveText(...)` | 原封保留在 verify 或必须保持时序的 helper 中 |
| `Promise.all([waitForEvent(...), click()])` | 保持一个原子 run，不能拆成先 click 后等事件 |
| 自定义 fixture / Page Object | 保留 import 与上下文类型；演示 Profile 单独适配 |
| route mock / clock /测试身份 | 保留并标识 mock；不默认宣称真实系统功能有效 |
| 循环 / 数据驱动 /分支 | 保留在 run/verify/helper 内，或生成明确参数的静态单场景；不能动态生成供清单解析的 steps，记录覆盖差异 |
| 多页 / frame /下载 | 保留原生能力；若播放器未支持相应呈现，明确暂不可演示 |
| `expect.soft` / 自定义 matcher / TestInfo | 保留 Test Runner 入口语义，普通 Node 演示环境另做显式适配并报告；不把 soft 失败静默变成功 |

未有中间断言时，适度合并动作成一步，保持原有检查；需要新增业务断言时从已知需求或真实结果确定，不能靠“按钮可见”猜测操作成功。新增断言与原断言在报告中分开。

## 验证

在同一隔离数据/配置下运行原 TC 和共享 TC，核对动作、断言、数据模式与清理。类型检查与 `--check-workspace` 的静态元数据/引用/编译结果分别记录，后者没有执行 typecheck 或浏览器。最后用桌面实际播放验证 Profile、呈现和业务结果；无呈现的 runPlaybook 执行成功不代表桌面视觉已验证。这里是智能体阅读原代码后的适配流程，不承诺任意 Playwright TC 无损自动转换。
