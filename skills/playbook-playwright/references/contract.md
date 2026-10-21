# 当前桌面契约：schemaVersion 1

适用于客户端 v0.3、内置 Skill 0.5.0。Skill 安装版本、SDK 包版本和 schemaVersion 分别核对。`schemaVersion` 仍为 `1`，旧脚本向后兼容。`definePlaybook`、`defineProfile` 与桌面播放器已可用；`runPlaybook` 是供 TC 复用的无呈现执行器。

## 工作区与清单

桌面添加的是含 `.playbook.json` 的业务目录，界面称为“项目”；文档/API 中的 workspace 指同一目录，不是另一层资料库。项目内层级是 Book → Section → 可执行脚本。资产路径为项目目录内的相对路径。以下清单、脚本和 Profile 相互对应；演示对象是合成页面，不假设业务系统有同名控件。

```json
{
  "schemaVersion": 1,
  "title": "课程演示",
  "profiles": [{ "id": "local-sample", "title": "本地合成页面", "file": "profiles/local.profile.ts", "dataMode": "fixture", "parameters": {} }],
  "scripts": [{ "file": "flows/courses.playbook.ts", "profile": "local-sample", "tags": ["课程", "搜索"] }],
  "books": [{
    "id": "course-training", "title": "课程培训", "summary": "课程管理入门", "profile": "local-sample",
    "sections": [{ "id": "find-courses", "title": "查找课程", "scripts": ["courses.search"] }]
  }]
}
```

`books` 可省略。Book 为 `{ id, title, summary?, profile?, sections }`；Section 为 `{ id, title, summary?, scripts }`，sections 和 scripts 均须非空。`scripts` 引用已注册流程 ID，而非文件名，同一 Section 内不重复引用同一脚本。Book ID 在项目内唯一，Section ID 在所属 Book 内唯一；两者均使用 `[A-Za-z0-9._-]+`，Section 的组合键为 `bookId/sectionId`，不在 ID 内写 `/`。

Book 的“播放全部”依次展开 `sections` 数组，再依次展开每个 Section 的 `scripts` 数组；Section 的“播放全部”只按自身 `scripts` 顺序执行。单脚本仍可独立播放。Book 的 `profile` 可指定默认环境，实际播放使用用户选定的同一 Profile；所有脚本的数据模式与角色要求都必须与之兼容。每个脚本都单独 prepare/release，不隐式共享上一脚本的页面与内存。

旧清单 `demos: [{ id, title, summary?, scripts, profile? }]` 仍可读取，客户端将它归一为 Book 和单个 Section，不改写用户清单。新建或调整编排使用 `books`，保留原有稳定引用；不要同时复制为两份业务流程。

Profile 和流程 ID 各自唯一，步骤 ID 在各流程内唯一。parameters 为明文可序列化配置，不是密码库；凭据读取既有私有文件或已授权环境。

## 原生脚本与静态元数据

`.playbook.ts` 使用 `export default definePlaybook({...})`。顶层对象、requirements、steps 数组及每步 ID、标题、说明和呈现字段写成 literal。浏览时只解析元数据，不执行模块；`scenario()`、变量引用、spread、模板插值、`.map()` 生成 steps 无法用于发现。动态逻辑放进 run/verify 或普通 helper，不把回调 stringify。

`flows/courses.playbook.ts`：

这里的 SDK `Playbook` 类型和 `definePlaybook()` 仍表示一个可执行脚本；上层 Book/Section 是清单容器，不通过 `definePlaybook()` 定义。

```ts
import { expect } from '@playwright/test';
import { definePlaybook } from '@playbook/core';
import type { Context } from '../profiles/local.profile';

export default definePlaybook<Context>({
  schemaVersion: 1, id: 'courses.search', title: '查找课程',
  summary: '通过名称筛选本地合成页面中的课程。',
  presentation: { spotlightRadius: 105, spotlightFeather: 24, overlayOpacity: 0.56, cursorMoveMs: 900, defaultHoldMs: 2600, openingMs: 2800 },
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
| 流程 presentation | spotlightRadius 40–300；spotlightFeather 0–100 px（默认 24，0 为硬边）；overlayOpacity 0–0.9；cursorMoveMs 150–5000；defaultHoldMs 0–60000；openingMs 0–30000 |
| 步骤 presentation | chapter；side 为 top/right/bottom/left；holdMs、afterMs 均为 0–60000 |
| 流程 redactions | 可选数组；每项 `{ selector, mode?, label?, blurPx?, padding? }`。selector 是 CSS 选择器；mode 为 cover（默认不透明遮盖）或 blur；blurPx 为 1–40 px；padding 为 0–40 px |
| 流程 narration | 可选 `{ enabled?, voice?, rate?, opening? }`；默认不启用。rate 为 80–400 的整数（words/min）；opening 为 false 或 `{ text?, audio? }` |
| 步骤 narration | false 跳过；或 `{ text?, audio? }`，可在流程未启用时单独启用本步。text 与 audio 互斥 |

时间单位为毫秒。播放器默认光圈 105、蒙层 0.56、移光标 900、讲解停留 2600、开场 2800；步骤 afterMs 默认 550。步骤 holdMs 覆盖流程 defaultHoldMs。holdMs 用于操作前讲解，afterMs 用于 run 和 verify 成功后阅读；不能替代断言、ready 条件、导航或事件等待。呈现层不重复执行业务点击。

### 打码与语音

`redactions` 定义在流程顶层，不放进 step。使用实际页面上的稳定 CSS 选择器；它会随页面滚动、重渲染、弹窗和同一主页面导航重新定位。遮盖层不拦截点击，业务目标仍由原生 Locator 操作。不要修改元素内容或业务 CSS 来打码，也不要把打码目标误写成 Playwright `getByRole()` 表达式。默认 cover 适合隐藏 logo、姓名和数值；blur 仅作视觉模糊，不保证内容不可辨识。两者都只影响演示观看，原值仍在 DOM、网络响应和业务存储中，不是安全脱敏机制；更高保密要求应先提供适当的演示数据/环境。跨 frame、新页面仍需另行适配。

```ts
// 放在 definePlaybook 的顶层 literal 对象中
redactions: [
  { selector: '[data-demo="brand"]', mode: 'cover', label: '品牌已遮盖', padding: 4 },
  { selector: '[data-demo="customer-name"]', mode: 'cover' },
],
narration: { enabled: true, voice: 'Tingting', rate: 185 },
// 单步内可覆盖：narration: { text: '输入课程名称，查看匹配的课程。' }
// 使用录音：narration: { audio: 'demos/audio/search.mp3' }
// 静音本步：narration: false
```

流程 `narration.enabled: true` 时，开场默认朗读 title 与 summary，每步默认朗读 explain。`opening: false` 关闭开场语音，步骤 `narration: false` 跳过本步；对象可覆盖相应讲稿或录音。文字与录音二选一，不能同时填写。语音与提示/光标演示配合播放，当前讲解与最短 hold 都完成后才执行该步操作；暂停、继续、停止同步作用于语音。没有声音、音频无效或生成失败须明确失败，不能只用阅读等待冒充语音完成。

文字朗读使用 macOS 本地 `say` 生成 WAV，默认中文声线 Tingting、语速 185 words/min，无需云服务账户；系统缺少所选声线时按实际错误修复。其他平台暂使用已有本地录音，不宣称系统语音已经适配。audio 必须是工作区内的相对文件路径，支持 wav/mp3/m4a/ogg，单文件不超过 20 MB；不填绝对路径、越界路径或网络 URL。录音作为本轮快照冻结，源文件更新下一轮生效；不把音频放入产品仓库。

开场、explain 和自定义讲稿均不得包含被遮盖的实际敏感值。语音文件也可能含敏感信息，交付前核对内容与目标观众。无需语音的旧脚本保持静音，不为迁移版本擅自启用朗读。

read-only/replay 声明不是拦截器或代码沙箱。依据真实业务实现必要的写入限制、基线和结束校验，只执行用户认可且目标已授权的资产。

## 运行与验证

1. 运行业务项目已有类型检查，确保本地 SDK、Playwright 类型与业务 helpers 可以解析。
2. 用当前 Playbook 可执行文件传入 `--check-workspace <工作区绝对路径>`。它只检查静态元数据、清单引用与编译打包，不执行 Profile 或浏览器；结果明确为 `typecheck: not-run`、`browser: not-run`。esbuild 编译成功不等于 TypeScript 类型通过。
3. 在已授权环境从桌面添加项目，选择脚本、Section 或 Book 及 Profile，实际播放并核对业务结果、顺序、说明遮挡、暂停继续、停止和重播。Book/Section 批量播放须核对每个脚本的准备和释放。涉及写入与恢复时按真实风险验证。

桌面按本轮快照播放，源资产变更影响下一轮。清单、Profile、脚本、静态相对 imports 与声明的录音参与变更检测；运行时读取的私有配置不等于已纳入代码指纹。不要修改应用缓存来替代业务源文件。新增打码实际播放检查滚动/弹窗/导航后的遮盖与可交互性；新增语音检查内容、时序和暂停/继续/停止，静态检查不能证明听到声音。

## 客户端控制与页面呈现

浏览器注入负责开场、章节、箭头提示、蒙层、光圈与演示光标。进度条和播放控制由 Electron 原生透明置顶悬浮窗提供，不注入业务 DOM。它约 3 秒无输入后隐藏，在鼠标或键盘活动后显现；客户端使用系统空闲时间和鼠标坐标判断活动，不读取按键内容。

默认系统快捷键 `CommandOrControl+Alt+P`（Mac 为 `⌘⌥P`）切换播放/暂停；空闲时播放主界面当前选择，终态允许从头重播，仍遵守原重播策略。注册冲突会提示，不承诺快捷键始终可用或所有系统已经验收。不要把这套全局控制写进脚本、监听业务页面键盘，或为单个脚本新增悬浮条配置字段。

## TC 复用与独立导出

runPlaybook 接收一个可执行脚本，不接收清单 Book/Section。它顺序执行 `beforeStep → run → verify → afterStep`，可由 aroundStep 包裹一次，异常向上传播。它不创建浏览器、准备 Profile、渲染讲解、播放语音、应用打码或管理暂停停止，也不等待阅读时间。独立 TC 导出忽略 spotlightFeather、redactions、narration 等纯呈现元数据，保留真实动作和断言，不将遮盖转成 DOM 修改或测试前置操作。

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
