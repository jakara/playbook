import test from 'node:test';
import assert from 'node:assert/strict';
import { ManualInteraction } from '../desktop/interaction.mjs';

test('manual interaction defaults to ten seconds and records timeout separately from continuation', () => {
  const gate = new ManualInteraction({ mode: 'manual' }, 1000);
  assert.equal(gate.timeoutMs, 10000);
  assert.equal(gate.onTimeout, 'continue');
  gate.update(10999);
  assert.equal(gate.remainingMs, 1);
  assert.equal(gate.outcome, null);
  gate.update(11000);
  assert.deepEqual(gate.result(11000), { outcome: 'timed-out', elapsedMs: 10000 });
});

test('zero timeout waits indefinitely until explicit continuation', () => {
  const gate = new ManualInteraction({ mode: 'manual', timeoutMs: 0 }, 1000);
  gate.update(1000000);
  assert.equal(gate.state().remainingMs, null);
  assert.equal(gate.outcome, null);
  gate.resume();
  assert.deepEqual(gate.result(1000000), { outcome: 'continued', elapsedMs: 999000 });
});

test('real activity resets the entire budget but an unchanged activity timestamp does not', () => {
  const gate = new ManualInteraction({ mode: 'manual', timeoutMs: 1000 }, 1000);
  gate.update(1600);
  assert.equal(gate.remainingMs, 400);
  gate.update(1700, 1700);
  assert.equal(gate.remainingMs, 1000);
  gate.update(2000, 1700);
  assert.equal(gate.remainingMs, 700);
  gate.update(2500, 2400);
  assert.equal(gate.remainingMs, 1000);
  assert.equal(gate.outcome, null);
});

test('manual pause freezes the budget and explicit continue finishes the handoff', () => {
  const gate = new ManualInteraction({ mode: 'manual', timeoutMs: 1000 }, 1000);
  gate.update(1400); gate.paused = true;
  gate.update(5000);
  assert.equal(gate.remainingMs, 600);
  assert.equal(gate.state().paused, true);
  assert.equal(gate.outcome, null);
  gate.resume();
  assert.equal(gate.result(5001).outcome, 'continued');
});

test('native file operation freezes the budget, blocks continuation and resets on completion', () => {
  const gate = new ManualInteraction({ mode: 'manual', timeoutMs: 1000 }, 1000);
  gate.update(1800); gate.setBusy(true, 1800);
  gate.update(20000);
  gate.resume();
  assert.equal(gate.state().busy, true);
  assert.equal(gate.remainingMs, 1000);
  assert.equal(gate.outcome, null);
  gate.setBusy(false, 22000);
  assert.equal(gate.state().busy, false);
  assert.equal(gate.remainingMs, 1000);
  gate.update(22999);
  assert.equal(gate.remainingMs, 1);
  gate.resume();
  assert.equal(gate.result(23000).outcome, 'continued');
});

test('continued and timed-out results are final and cannot be rewritten by late inputs', () => {
  const timeout = new ManualInteraction({ mode: 'manual', timeoutMs: 1000, onTimeout: 'fail' }, 1000);
  timeout.update(2000);
  timeout.resume();
  assert.equal(timeout.result(2001).outcome, 'timed-out');
  timeout.update(3000, 3000);
  assert.equal(timeout.result(3000).outcome, 'timed-out');
  const continued = new ManualInteraction({ mode: 'manual', timeoutMs: 1000 }, 1000);
  continued.resume(); continued.update(4000);
  assert.equal(continued.result(4000).outcome, 'continued');
});

test('backward clock movement cannot increase elapsed duration or consume a negative budget', () => {
  const gate = new ManualInteraction({ mode: 'manual', timeoutMs: 1000 }, 1000);
  gate.update(900);
  assert.equal(gate.remainingMs, 1000);
  assert.equal(gate.result(900).elapsedMs, 0);
});
