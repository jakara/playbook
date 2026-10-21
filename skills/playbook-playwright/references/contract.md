# 当前桌面契约：schemaVersion 1

适用于内置 Skill 0.3.0。Skill 安装版本、SDK 包版本和 schemaVersion 分别核对。`definePlaybook`、`defineProfile` 与桌面播放器已可用；`runPlaybook` 是供 TC 复用的无呈现执行器。

## 工作区与清单

桌面添加的是含 `.playbook.json` 的业务目录。资产路径为该目录内的相对路径。以下清单、脚本和 Profile 相互对应；演示对象是合成页面，不假设业务系统有同名控件。

```json
{
  "schemaVersion": 1,
  "title": "课程演示",
  "profiles": [{ "id": "local-sample", "title": "本地合成页面", "file": "profiles/local.profile.ts", "dataMode": "fixture", "parameters": {} }],
  "scripts": [{ "file": "flows/courses.playbook.ts", "profile": "local-sample", "tags": ["课程", "搜索"] }],
  "demos": [{ "id": "course-training", "title": "课程培训", "scripts": ["courses.search"], "profile": "local-sample" }]
}
```

`demos` 可省略，其 scripts 引用流程 ID 而非文件名，按数组顺序播放。组合使用同一 Profile，所有流程的数据模式必须与之相同。Profile 和流程 ID 各自唯一，步骤 ID 在各流程内唯一。parameters 为明文可序列化配置，不是密码库；凭据读取既有私有文件或已授权环境。

## 原生脚本与静态元数据

`.playbook.ts` 使用 `export default definePlaybook({...})`。顶层对象、requirements、steps 数组及每步 ID、标题、说明和呈现字段写成 literal。浏览时只解析元数据，不执行模块；`scenario()`、变量引用、spread、模板插值、`.map()` 生成 steps 无法用于发现。动态逻辑放进 run/verify 或普通 helper，不把回调 stringify。

`flows/courses.playbook.ts`：

```ts
import { expect } from '@playwright/test';
import { definePlaybook } from '@playbook/core';
import type { Context } from '../profiles/local.profile';

export default definePlaybook<Context>({
  schemaVersion: 1, id: 'courses.search', title: '查找课程',
  summary: '通过名称筛选本地合成页面中的课程。',
  presentation: { spotlightRadius: 105, overlayOpacity: 0.56, cursorMoveMs: 900, defaultHoldMs: 2600, openingMs: 2800 },
  requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] },
  steps: [{
    id: 'search', title: '筛选课程', explain: '输入“校园海报”，再查看筛选结果。',
    presentation: { chapter: '课程管理', side: 'bottom', holdMs: 3000, afterMs: 900 },
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

`profiles/local.profile.ts`：

```ts
import { defineProfile, type PlaybookContext } from '@playbook/core';

export interface Context extends PlaybookContext { courseName: string }

export default defineProfile<Context>({
  schemaVersion: 1, id: 'local-sample', title: '本地合成页面', dataMode: 'fixture', roles: [],
  async prepare({ page, parameters }) {
    const courseName = typeof parameters.courseName === 'string' ? parameters.courseName : '校园海报';
    await page.setContent(`<label>搜索课程<input aria-label="搜索课程"></label><button>搜索</button>
      <table><tbody><tr><td>校园海报</td></tr><tr><td>动画角色</td></tr></tbody></table>
      <script>document.querySelector('button').onclick=()=>{const q=document.querySelector('input').value;for(const r of document.querySelectorAll('tr'))r.hidden=!r.textContent.includes(q)}</script>`);
    return { context: { page, courseName } };
  },
});
```

## Profile 生命周期

完整签名为 `prepare({ page, workspaceDir, parameters }) => Promise<{ context: C; release?: () => Promise<void> }>`，C 至少包含运行器传入的当前 page。workspaceDir 是已添加工作区的绝对路径；用 `path.resolve(workspaceDir, 'config.local.json')` 读取既有配置，不依赖进程 cwd 或个人机器路径。上例合成页面不需要磁盘配置，因此只使用 page 和 parameters。

运行器创建 Chrome、BrowserContext 和 page。Profile 负责业务登录、身份绑定、数据及自身 hooks，不关闭运行器的浏览器/会话。运行器在正常结束或失败后调用已经返回的 release；prepare 失败时还未返回 release，Profile 必须自行清理已创建的资源和 hooks。仅移除自己注册的 route/listener。

roles 必须由实际认证与授权上下文支撑；运行器只核对声明包含关系，不代替服务端授权。`resetBeforeRun: true` 仅用于 prepare 确实执行并验证了恢复的环境；声明不会自动恢复数据。

## 字段与呈现

| 字段 | 当前语义 |
|---|---|
| schemaVersion | 字面量 1 |
| source | 可选 `{ testFile, testTitle, revision? }`；仅填写真实 TC 来源 |
| requirements.dataMode / Profile dataMode | real 真实服务/身份；fixture 受控测试数据、测试身份或合成页面；mock 替换接口/浏览器能力。混合场景说明实际构成 |
| requirements.effects | read-only 不修改业务对象；writes 有业务创建、更新、发布或删除。认证与临时会话另说明 |
| requirements.replay | safe 不需还原持久业务状态；reset-required 需已验证恢复；single-run 没有已验证的再次运行方案 |
| steps[].target | 可选 `(context) => Locator`，只定位；桌面要求唯一可见目标，无目标时中央说明 |
| steps[].run / verify | 必需的原生异步 callbacks，依次执行，保留 Locator、事件顺序与有效预期 |
| 流程 presentation | spotlightRadius 40–300；overlayOpacity 0–0.9；cursorMoveMs 150–5000；defaultHoldMs 0–60000；openingMs 0–30000 |
| 步骤 presentation | chapter；side 为 top/right/bottom/left；holdMs、afterMs 均为 0–60000 |

时间单位为毫秒。播放器默认光圈 105、蒙层 0.56、移光标 900、讲解停留 2600、开场 2800；步骤 afterMs 默认 550。步骤 holdMs 覆盖流程 defaultHoldMs。holdMs 用于操作前讲解，afterMs 用于 run 和 verify 成功后阅读；不能替代断言、ready 条件、导航或事件等待。呈现层不重复执行业务点击。

read-only/replay 声明不是拦截器或代码沙箱。依据真实业务实现必要的写入限制、基线和结束校验，只执行用户认可且目标已授权的资产。

## 运行与验证

1. 运行业务项目已有类型检查，确保本地 SDK、Playwright 类型与业务 helpers 可以解析。
2. 用当前 Playbook 可执行文件传入 `--check-workspace <工作区绝对路径>`。它只检查静态元数据、清单引用与编译打包，不执行 Profile 或浏览器；结果明确为 `typecheck: not-run`、`browser: not-run`。esbuild 编译成功不等于 TypeScript 类型通过。
3. 在已授权环境从桌面添加工作区，选择脚本或组合演示及 Profile，实际播放并核对业务结果、说明遮挡、暂停继续、停止和重播。涉及写入与恢复时按真实风险验证。

桌面按本轮快照播放，源资产变更影响下一轮。清单、Profile、脚本和静态相对 imports 参与变更检测；运行时读取的私有配置不等于已纳入代码指纹。不要修改应用缓存来替代业务源文件。

## TC 复用与独立导出

runPlaybook 顺序执行 `beforeStep → run → verify → afterStep`，可由 aroundStep 包裹一次，异常向上传播。它不创建浏览器、准备 Profile、渲染讲解或管理暂停停止，也不等待阅读时间。

以下是绑定业务已有 fixture 的形状示例，不附带虚构 fixture 实现：

```ts
import { test } from './fixtures.js';
import { runPlaybook } from '@playbook/core';
import flow from '../demos/flows/courses.playbook.js';

test('search courses', async ({ page, seededCourse }) => {
  await runPlaybook(flow, { page, courseName: seededCourse.name }, {
    aroundStep: (step, execute) => test.step(step.title, execute),
  });
});
```

原 test.use、hooks、project、worker fixture、timeout、重试和断言配置仍归测试生命周期。共享模式保留单一业务流程；独立导出需阅读并展开原 run/verify 或提取普通 helper，记录快照和同步责任，不承诺任意 TypeScript 无损自动转换。
