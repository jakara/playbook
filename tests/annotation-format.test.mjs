import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnotation, formatAnnotation } from '../desktop/annotation-format.mjs';

const run = { id: 'run-1', workspacePath: '/tmp/project', profileId: 'fixture', entryId: 'course', kind: 'script',
  flowId: 'course-flow', stepId: 'publish', stepTitle: '发布课程', index: 4, scriptTitle: '课程脚本' };

test('annotation prompt carries page, element, step and user comment without URL secrets', () => {
  const annotation = createAnnotation({ body: '确认按钮没有显示课程名称',
    page: { url: 'https://example.test/course/7?view=summary&token=secret-value', title: '课程页', headings: ['课程管理'] },
    element: { selector: '#publish', tag: 'BUTTON', role: 'button', label: '发布', text: '发布课程', nearbyText: '课程详情 发布课程' },
  }, run);
  const prompt = formatAnnotation(annotation);
  assert.equal(annotation.schema, 'playbook.annotation.v1');
  assert.equal(annotation.playbook.stepId, 'publish');
  assert.equal(annotation.element.tag, 'button');
  assert.match(prompt, /确认按钮没有显示课程名称/);
  assert.match(prompt, /playbook.annotation.v1/);
  assert.match(prompt, /#publish/);
  assert.doesNotMatch(prompt, /secret-value/);
  assert.match(prompt, /%5Bredacted%5D/);
});

test('annotation requires a selected element and bounded nonempty comment', () => {
  assert.throws(() => createAnnotation({ body: 'x' }, run), /请选择页面元素/);
  assert.throws(() => createAnnotation({ body: '  ', element: { selector: '#x', tag: 'div' } }, run), /请填写批注内容/);
  assert.throws(() => createAnnotation({ body: 'x'.repeat(5001), element: { selector: '#x', tag: 'div' } }, run), /不能超过/);
});
