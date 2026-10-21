import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'test', '-c', 'examples/playwright.config.ts', '--reporter=json'], {
  cwd: root, encoding: 'utf8', timeout: 60000,
  env: { ...process.env, PLAYBOOK_TEST_BROKEN_EXPECTATION: '1' },
});
if (result.error) throw result.error;
assert.equal(result.status, 1, 'All three TCs must fail when the business expectation changes');
const report = JSON.parse(result.stdout);
const specs = suites => suites.flatMap(suite => [...(suite.specs || []), ...specs(suite.suites || [])]);
const cases = specs(report.suites);
assert.equal(cases.length, 3);
assert.equal(report.stats.unexpected, 3);
assert.deepEqual(report.errors, []);
for (const item of cases) {
  const errors = item.tests.flatMap(test => test.results.flatMap(run => run.errors));
  assert.ok(errors.some(error => error.message.includes('Poster brief')), `Expected business assertion failure: ${item.title}`);
}
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/negative-verification.json', import.meta.url), JSON.stringify({
  checkedAt: new Date().toISOString(), changedFixtureHeading: 'Changed task',
  expectedAssertion: 'Poster brief', failedAsExpected: cases.map(item => item.title),
}, null, 2));
console.log('Passed: original, shared and standalone TCs all reject the changed business expectation.');
