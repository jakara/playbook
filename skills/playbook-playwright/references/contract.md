# Playbook 脚本契约 v0.1

## 文件与最小接口

脚本使用 `.playbook.ts`，导出 `definePlaybook<C>(...)` 的结果。契约是 TypeScript 原生对象，包含函数，不是 JSON 动作语言。自定义业务上下文 C 至少包含 `page: Page`，其他数据由业务 fixture 或 Profile 注入。

```ts
import { expect } from '@playwright/test';
import { definePlaybook, type PlaybookContext } from '@playbook/core';

interface Context extends PlaybookContext { courseName: string }

export default definePlaybook<Context>({
  schemaVersion: 1,
  id: 'courses.search',
  title: '查找课程',
  summary: '教师通过名称筛选课程。',
  source: { testFile: 'tests/courses.spec.ts', testTitle: 'search courses' },
  requirements: {
    dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: ['teacher'],
  },
  steps: [{
    id: 'search', title: '筛选课程', explain: '输入课程名称，再查看筛选结果。',
    presentation: { chapter: '课程管理', side: 'bottom', holdMs: 3000 },
    target: ({ page }) => page.getByLabel('搜索课程', { exact: true }),
    run: async ({ page, courseName }) => {
      await page.getByLabel('搜索课程', { exact: true }).fill(courseName);
      await page.getByRole('button', { name: '搜索', exact: true }).click();
    },
    verify: async ({ page, courseName }) => {
      await expect(page.getByRole('row').filter({ hasText: courseName })).toHaveCount(1);
    },
  }],
});
```

上例是形状示例，不假设目标业务真的有这些中文标签。实际转换沿用原定位和预期，不从示例猜页面结构。步骤可以包含多个必须连贯的动作；讲解需要更细时拆分，但不能打断“先注册事件再点击”等时序。

## 字段语义

| 字段 | 规则 |
|---|---|
| schemaVersion | 当前为字面量 `1`；不自动接受未知版本 |
| id | 跨标题修改仍稳定的流程标识；步骤 id 在流程内唯一 |
| title / summary | 面向观众的业务名称和目的 |
| source | 可选；原 TC 文件、完整标题和可选 revision。无 TC 来源时不虚构 |
| requirements.dataMode | `real` 真实服务/身份边界；`fixture` 受控测试数据或合成页面；`mock` 接口或浏览器能力被替换。混合时报告具体构成，并采用限制更强的类别 |
| requirements.effects | `read-only` 不修改业务对象；`writes` 会创建、发布、更新、删除等。认证与临时会话资源另说明 |
| requirements.replay | `safe` 在正常 Profile/fixture 生命周期下可再次运行，无需因前一轮副作用还原持久业务状态；`reset-required` 必须恢复/重新准备持久业务状态，即使恢复已由 Profile 自动完成仍选此值；`single-run` 需要恢复但没有已验证方案。正常登录、导航和临时 HTML 页重建不单独算业务恢复 |
| requirements.roles | 实际执行所需的身份角色，不是观众类别；Profile 明确角色与身份绑定，不保存账号密码。无需登录的合成页面为 []，面向教师等观众写在讲解元数据 |
| steps[].explain | 下一步用途、动作与预期效果，不介绍底层选择器 |
| steps[].target | 可选的 `(context) => Locator`，只返回定位，不执行动作；无目标时用中央说明。原生 dialog/frame 等需要相应呈现支持 |
| steps[].presentation | 可选 `chapter`、`side: top/right/bottom/left`、`holdMs`；只影响演示 |
| steps[].run | 原生异步 Playwright/业务操作；不得在呈现 hook 中再执行一遍 |
| steps[].verify | 原预期的异步断言；不得用捕获并忽略失败、固定等待或永真检查取代 |

参考 SDK 在定义时检查身份、版本和步骤 ID，但不能证明无副作用、定位唯一或断言有效。类型和元数据不代替实际验证。

## 参考执行接口

```ts
await runPlaybook(flow, context, {
  beforeStep: async (step, context) => { /* 演示呈现，可省略 */ },
  afterStep: async (step, context) => { /* 成功后记录，可省略 */ },
  aroundStep: (step, execute) => test.step(step.title, execute), // TC 中可用
});
```

默认严格串行执行 `beforeStep → run → verify → afterStep`；任意异常向上抛出，后续步骤不执行。`aroundStep` 仅包裹一次执行，不能吞掉失败、重复调用或跳过 `execute`。

当前参考执行器不负责浏览器创建、登录、准备、释放、暂停停止、截图或超时。测试入口使用原项目 Test Runner 与 fixture，演示入口使用业务 Profile；调用方需要 `finally` 释放自己创建的资源。

演示 Profile 的准备与释放接口尚属产品设计，不能假装 SDK 已导出某个 `defineProfile` API。转换时可复用现有 helper 并提供明确的适配说明，或者在用户授权的实现范围内交付实际可执行适配器。

## 复用与导出

共享 TC 的形状：

```ts
import { test } from './fixtures.js'; // 沿用业务已有 fixture，不换成空白默认 test
import { runPlaybook } from '@playbook/core';
import flow from '../demos/flows/courses.playbook.js';

test('search courses', async ({ page, seededCourse }) => {
  await runPlaybook(flow, { page, courseName: seededCourse.name }, {
    aroundStep: (step, execute) => test.step(step.title, execute),
  });
});
```

原 `test.use`、project、beforeEach/afterEach、worker fixture、timeout 和断言配置仍保留在其原生命周期。只有业务上下文准备好，流程才可以运行。导出独立 TC 时展开 run/verify 或提取普通 helper，不把函数闭包当成可安全 stringify 的数据。

共享模式是单一业务真源；独立导出会形成一个需要重新生成或人工同步的快照，报告中记录来源版本和同步责任。
