// 1 回戦ごとの打ち切りタイマー。
// 大会データに { round, startedAt, pausedAt, pausedTotal } を持ち、時刻（ミリ秒）から残り時間を計算する。
// 主催者が「開始」を押した時刻を全員の端末で共有するので、どの端末でも同じ残り時間になる

export const DEFAULT_TIME_LIMIT_MIN = 50;
export const WARNING_MS = 5 * 60 * 1000; // 残り 5 分で予告する

export function startTimer(round, now) {
  return { round, startedAt: now, pausedAt: null, pausedTotal: 0 };
}

export function pauseTimer(timer, now) {
  if (!timer || timer.pausedAt) return timer;
  return { ...timer, pausedAt: now };
}

export function resumeTimer(timer, now) {
  if (!timer || !timer.pausedAt) return timer;
  return { ...timer, pausedAt: null, pausedTotal: (timer.pausedTotal || 0) + (now - timer.pausedAt) };
}

// 残り時間（ミリ秒）。0 未満は時間切れ
export function remainingMs(timer, limitMin, now) {
  if (!timer) return null;
  const elapsed = (timer.pausedAt ?? now) - timer.startedAt - (timer.pausedTotal || 0);
  return limitMin * 60 * 1000 - elapsed;
}

// タイマーの状態。idle は未開始、running は計測中、warning は残り 5 分以下、over は時間切れ、paused は一時停止中
export function timerState(timer, limitMin, now) {
  if (!timer) return 'idle';
  const left = remainingMs(timer, limitMin, now);
  if (left <= 0) return 'over';
  if (timer.pausedAt) return 'paused';
  return left <= WARNING_MS ? 'warning' : 'running';
}

// 残り時間を「49:59」の形にする（時間切れは 0:00）
export function formatRemaining(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
