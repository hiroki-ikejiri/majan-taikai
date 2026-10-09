// 打ち切りタイマーのテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startTimer, pauseTimer, resumeTimer, remainingMs, timerState, formatRemaining } from '../public/js/logic/timer.js';

const MIN = 60 * 1000;

test('開始から 50 分を数える', () => {
  const t = startTimer(1, 0);
  assert.equal(remainingMs(t, 50, 0), 50 * MIN);
  assert.equal(formatRemaining(remainingMs(t, 50, 10 * MIN + 1000)), '39:59');
  assert.equal(timerState(t, 50, 10 * MIN), 'running');
});

test('残り 5 分で予告、0 で時間切れ', () => {
  const t = startTimer(1, 0);
  assert.equal(timerState(t, 50, 45 * MIN), 'warning');
  assert.equal(timerState(t, 50, 50 * MIN), 'over');
  assert.equal(formatRemaining(remainingMs(t, 50, 55 * MIN)), '0:00');
});

test('一時停止中は減らず、再開すると止めていた時間を足して数える', () => {
  let t = startTimer(1, 0);
  t = pauseTimer(t, 10 * MIN);
  assert.equal(timerState(t, 50, 20 * MIN), 'paused');
  assert.equal(remainingMs(t, 50, 20 * MIN), 40 * MIN);
  t = resumeTimer(t, 20 * MIN);
  assert.equal(remainingMs(t, 50, 25 * MIN), 35 * MIN);
});

test('未開始は idle', () => {
  assert.equal(timerState(null, 50, 0), 'idle');
  assert.equal(remainingMs(null, 50, 0), null);
});
