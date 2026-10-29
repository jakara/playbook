import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../desktop/presentation/annotation.js', import.meta.url), 'utf8');
const selectElement = source.slice(source.indexOf('  function onClick('), source.indexOf('  function onKey('));

test('selecting another annotation target clears the previous draft and enables saving again', () => {
  const fields = { '#body': { value: '已保存的上一条批注', focus() {} }, '#error': { textContent: '正在保存…' },
    '#save': { disabled: true }, '#target': { textContent: '' } };
  const intercepted = [];
  const element = { id: 'publish' };
  const context = vm.createContext({
    picking: true, selected: null, draft: null, host: {}, panel: { hidden: true }, outline: {}, tip: {},
    $: selector => fields[selector], candidate: () => element, selectorFor: () => '#publish',
    document: { removeEventListener() {} }, onMove() {},
    event: { clientX: 100, clientY: 100, composedPath: () => [], preventDefault() { intercepted.push('prevent'); }, stopImmediatePropagation() { intercepted.push('stop'); } },
  });
  vm.runInContext(selectElement, context);
  for (let index = 0; index < 2; index++) {
    context.picking = true; fields['#save'].disabled = true;
    fields['#body'].value = '上一条批注'; fields['#error'].textContent = '正在保存…';
    vm.runInContext('onClick(event)', context);
    assert.equal(fields['#save'].disabled, false);
    assert.equal(fields['#body'].value, ''); assert.equal(fields['#error'].textContent, '');
    assert.equal(context.panel.hidden, false); assert.equal(context.selected, element);
  }
  assert.deepEqual(intercepted, ['prevent', 'stop', 'prevent', 'stop']);
});
