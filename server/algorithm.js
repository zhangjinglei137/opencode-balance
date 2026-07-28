// ponytail: 优先级/权重算法引擎
function safePeriod(v, def) { return v > 0 ? v : def; }

function calculatePriorities(accounts, config) {
  const now = new Date();
  const N = accounts.length;
  if (N === 0) return [];

  const cfg = Object.assign({
    rolling_period_hours: 5, weekly_period_days: 7, monthly_period_days: 30,
    weight_rolling: 0.1, weight_weekly: 0.2, weight_monthly: 0.7,
    bonus_cap_rolling: 0.1, bonus_cap_weekly: 0.2, bonus_cap_monthly: 0.7,
    tier_threshold: 0.3,
    fuse_rolling_warn: 0.9, fuse_rolling_disable: 0.98,
    fuse_weekly_warn: 0.95,
    fuse_monthly_warn: 0.98, fuse_monthly_disable: 1.0,
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

    const K_r = 1 + (1 - T_r / safePeriod(cfg.rolling_period_hours, 5)) * R_r * cfg.bonus_cap_rolling;
    const K_w = 1 + (1 - T_w / safePeriod(cfg.weekly_period_days, 7)) * R_w * cfg.bonus_cap_weekly;
    const K_m = 1 + (1 - T_m / safePeriod(cfg.monthly_period_days, 30)) * R_m * cfg.bonus_cap_monthly;

    const S = (R_r * K_r) * cfg.weight_rolling + (R_w * K_w) * cfg.weight_weekly + (R_m * K_m) * cfg.weight_monthly;

    let fused = false;
    let fuse_reason = null;
    let priorityDrop = 0;

    if (U_r >= cfg.fuse_rolling_disable) { fused = true; fuse_reason = 'rolling_disable'; }
    else if (U_r >= cfg.fuse_rolling_warn) { priorityDrop += 1; }

    if (U_w >= cfg.fuse_weekly_warn) { priorityDrop += 1; }

    if (U_m >= cfg.fuse_monthly_disable) { fused = true; fuse_reason = 'monthly_disable'; }
    else if (U_m >= cfg.fuse_monthly_warn) { priorityDrop += 1; }

    return { account_id: acc.account_id, name: acc.name, health_score: isNaN(S) ? 0 : Math.max(0, S), rolling_remain: T_r, weekly_remain: T_w, monthly_remain: T_m, fused, fuse_reason, priorityDrop };
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
        priority = Math.max(1, (N - t) - item.priorityDrop);
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
