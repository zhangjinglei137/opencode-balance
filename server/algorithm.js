// ponytail: 优先级/权重算法引擎
function safePeriod(v, def) { return v > 0 ? v : def; }

function calculatePriorities(accounts, config) {
  const now = new Date();
  const N = accounts.length;
  if (N === 0) return [];

  const cfg = Object.assign({
    rolling_period_hours: 5, weekly_period_days: 7, monthly_period_days: 30,
    endgame_days: 5, accel_boost: 6, accel_power: 3,
    cap_weekly: 0.12, cap_rolling: 0.05,
    rolling_penalty_threshold: 0.9,
    tier_threshold: 0.3,
    fuse_rolling_disable: 0.98,
    fuse_monthly_disable: 1.0,
  }, config);

  const scored = accounts.map(acc => {
    const R_r = 1 - (acc.rolling_pct ?? 0) / 100;
    const R_w = 1 - (acc.weekly_pct ?? 0) / 100;
    const R_m = 1 - (acc.monthly_pct ?? 100) / 100;
    const U_r = (acc.rolling_pct ?? 0) / 100;
    const U_w = (acc.weekly_pct ?? 0) / 100;
    const U_m = (acc.monthly_pct ?? 100) / 100;

    const T_r = acc.rolling_reset_at
      ? Math.max(0, Math.min((new Date(acc.rolling_reset_at) - now) / 3600000, cfg.rolling_period_hours))
      : cfg.rolling_period_hours;
    const T_w = acc.weekly_reset_at
      ? Math.max(0, Math.min((new Date(acc.weekly_reset_at) - now) / 86400000, cfg.weekly_period_days))
      : cfg.weekly_period_days;
    const T_m = acc.monthly_reset_at
      ? Math.max(0, Math.min((new Date(acc.monthly_reset_at) - now) / 86400000, cfg.monthly_period_days))
      : cfg.monthly_period_days;

    // 月度基础信号（剩余多 × 时间紧）
    function monthAccel(T_m_days, endgame_days, accel_boost, accel_power) {
      if (T_m_days >= endgame_days) return 1;
      return 1 + accel_boost * Math.pow(1 - T_m_days / endgame_days, accel_power);
    }

    const M = R_m * monthAccel(T_m, cfg.endgame_days, cfg.accel_boost, cfg.accel_power);

    // 周度惩罚（用量高 + 距重置远 → 惩罚大）
    const pw = Math.min(U_w * (T_w / cfg.weekly_period_days) * cfg.cap_weekly, cfg.cap_weekly);

    // 滚动惩罚（U_r > threshold 才触发，用量高 + 距重置远 → 惩罚大）
    const pr = (U_r <= cfg.rolling_penalty_threshold) ? 0
      : Math.min(((U_r - cfg.rolling_penalty_threshold) / (1 - cfg.rolling_penalty_threshold)) * (T_r / cfg.rolling_period_hours) * cfg.cap_rolling, cfg.cap_rolling);

    // 末段惩罚门
    const gate = Math.min(Math.max(T_m / cfg.endgame_days, 0), 1);

    const S = Math.max(0, M - gate * (pw + pr));

    let fused = false;
    let fuse_reason = null;

    if (U_r >= cfg.fuse_rolling_disable) { fused = true; fuse_reason = 'rolling_disable'; }
    if (U_m >= cfg.fuse_monthly_disable) { fused = true; fuse_reason = 'monthly_disable'; }

    return { account_id: acc.account_id, name: acc.name, health_score: isNaN(S) ? 0 : Math.max(0, S), rolling_remain: T_r, weekly_remain: T_w, monthly_remain: T_m, fused, fuse_reason };
  });

  scored.sort((a, b) => {
    if (a.fused !== b.fused) return a.fused ? 1 : -1;
    return b.health_score - a.health_score;
  });

  // 分档: 间距大于 tier_threshold 则分档
  const tiers = [];
  let cur = [scored[0]];
  for (let i = 1; i < N; i++) {
    if (scored[i - 1].health_score - scored[i].health_score > cfg.tier_threshold) {
      tiers.push(cur); cur = [scored[i]];
    } else { cur.push(scored[i]); }
  }
  if (cur.length) tiers.push(cur);

  const result = [];
  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    // ponytail: 以档内最高分做基准，最高分=100，低分比例递减
    const tierHighest = tier[0].health_score;
    for (const item of tier) {
      let priority, weight;
      if (item.fused) { priority = 1; weight = 0; }
      else {
        priority = Math.max(1, N - t);
        // 高分=100，低分比例递减，向下取整到5的倍数确保差异化
        const raw = tierHighest > 0 ? (item.health_score / tierHighest) * 100 : 100;
        weight = Math.floor(raw / 5) * 5;
        weight = Math.max(5, weight);
      }
      result.push({
        account_id: item.account_id, name: item.name,
        health_score: Math.round(item.health_score * 10000) / 10000,
        priority, weight, tier: t + 1,
        rolling_remain: Math.round(item.rolling_remain * 100) / 100,
        weekly_remain: Math.round(item.weekly_remain * 100) / 100,
        monthly_remain: Math.round(item.monthly_remain * 100) / 100,
        fused: item.fused, fuse_reason: item.fuse_reason,
      });
    }
  }
  return result;
}

module.exports = { calculatePriorities };
