// 打ち切りタイマーの表示部品。
// 残り時間は 1 秒ごとに tickTimers() が書き換える（画面全体は描き直さない）
import { h } from '../ui.js';
import { remainingMs, timerState, formatRemaining, DEFAULT_TIME_LIMIT_MIN } from '../logic/timer.js';

const STATE_TEXT = {
  idle: '開始前',
  running: '',
  warning: 'まもなく終了',
  paused: '一時停止中',
  over: '時間です。現局で終了',
};

export const timeLimitOf = (rules) => rules.timeLimitMin || DEFAULT_TIME_LIMIT_MIN;

// 残り時間の表示。size は 'small'（参加者のホーム・主催者メニュー）か 'big'（会場表示）
export function timerDisplay(size = 'small') {
  return h(
    'div',
    { class: `js-timer timer ${size}` },
    h('span', { class: 'timer-left' }, '--:--'),
    h('span', { class: 'timer-note' }, ''),
  );
}

// 画面にあるタイマー表示をすべて書き換える。会場表示で音が有効なら、予告と時間切れでチャイムを鳴らす
let lastState = null;
let lastKey = null;
export function tickTimers(state, now = Date.now()) {
  const t = state.t;
  if (!t) return;
  const timer = t.timer || null;
  const limit = timeLimitOf({ ...(t.rules || {}) });
  const s = timerState(timer, limit, now);
  const left = remainingMs(timer, limit, now);
  document.querySelectorAll('.js-timer').forEach((el) => {
    el.dataset.state = s;
    el.querySelector('.timer-left').textContent = timer ? formatRemaining(left) : `${limit}:00`;
    el.querySelector('.timer-note').textContent = STATE_TEXT[s];
  });

  // 同じタイマーの中で状態が変わったときだけ鳴らす（開き直したときに鳴らないように）
  const key = timer ? `${timer.round}-${timer.startedAt}` : null;
  if (key === lastKey && lastState && s !== lastState && soundEnabled && document.querySelector('.screen')) {
    if (s === 'warning') playChime(1);
    if (s === 'over') playChime(3);
  }
  lastKey = key;
  lastState = s;
}

// ===== 音 =====
// ブラウザは操作なしに音を出せないので、会場表示の「音を有効にする」を押したときに準備する
let audio = null;
let soundEnabled = false;

export function enableSound() {
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  audio.resume?.();
  soundEnabled = true;
  playChime(1);
}

export const isSoundEnabled = () => soundEnabled;

function playChime(times) {
  if (!audio) return;
  for (let i = 0; i < times; i += 1) {
    [880, 660].forEach((freq, k) => {
      const start = audio.currentTime + i * 0.9 + k * 0.3;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
  }
}
