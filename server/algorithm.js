// ponytail: v4 优先级/权重算法——激进阶梯版（S = 剩余金额 × 档位倍率 × 周因子，档内线性权重）
const DEFAULTS = {
  rolling_period_hours: 5, weekly_period_days: 7, monthly_period_days: 30,
  c_w: 1.0, k: 2, F_w: 0.98, T_w_fuse: 0.5,
  fuse_rolling_disable: 0.95, fuse_monthly_disable: 0.99,
  tier_break_crazy: 2, tier_break_accel: 5, tier_mult_crazy: 100, tier_mult_accel: 20,
};

const miss = (v) => v === null || v === undefined;

// 归一化用量：pct 或对应 reset_at 为 null/undefined/无效值 → data_missing=true（绝不允许 NULL 兜底成 0，无效值置 null 防 NaN 传播）
function normalizeUsage(u) {
  u = u || {};
  const pctOk = (v) => !miss(v) && !isNaN(Number(v));
  const dateOk = (v) => !miss(v) && !isNaN(new Date(v).getTime());
  const data_missing = !pctOk(u.rolling_pct) || !pctOk(u.weekly_pct) || !pctOk(u.monthly_pct) ||
    !dateOk(u.rolling_reset_at) || !dateOk(u.weekly_reset_at) || !dateOk(u.monthly_reset_at);
  return {
    rolling_pct: pctOk(u.rolling_pct) ? Number(u.rolling_pct) : null,
    weekly_pct: pctOk(u.weekly_pct) ? Number(u.weekly_pct) : null,
    monthly_pct: pctOk(u.monthly_pct) ? Number(u.monthly_pct) : null,
    rolling_reset_at: dateOk(u.rolling_reset_at) ? u.rolling_reset_at : null,
    weekly_reset_at: dateOk(u.weekly_reset_at) ? u.weekly_reset_at : null,
    monthly_reset_at: dateOk(u.monthly_reset_at) ? u.monthly_reset_at : null,
    data_missing,
  };
}

function daysUntil(resetAt, now) {
  return resetAt ? Math.max(0, (new Date(resetAt) - now) / 86400000) : null;
}

function calculatePriorities(accounts, config) {
  const now = new Date();
  if (accounts.length === 0) return [];

  const cfg = Object.assign({}, DEFAULTS, config);

  const scored = accounts.map(acc => {
    const q_m = miss(acc.monthly_pct) ? null : 1 - acc.monthly_pct / 100;
    const u_r = miss(acc.rolling_pct) ? null : acc.rolling_pct / 100;
    const u_w = miss(acc.weekly_pct) ? null : acc.weekly_pct / 100;
    const u_m = miss(acc.monthly_pct) ? null : acc.monthly_pct / 100;

    const tRawM = daysUntil(acc.monthly_reset_at, now);
    const tRawW = daysUntil(acc.weekly_reset_at, now);
    const tRawR = miss(acc.rolling_reset_at) ? null : Math.max(0, (new Date(acc.rolling_reset_at) - now) / 3600000);

    const T_m = tRawM === null ? cfg.monthly_period_days : Math.min(tRawM, cfg.monthly_period_days);
    const T_w = tRawW === null ? cfg.weekly_period_days : Math.min(tRawW, cfg.weekly_period_days);
    const T_r = tRawR === null ? cfg.rolling_period_hours : Math.min(tRawR, cfg.rolling_period_hours);

    // 数据缺失熔断（pct 或对应 reset_at 任一缺失）
    const dataMissing = acc.data_missing === true ||
      miss(acc.rolling_pct) || miss(acc.weekly_pct) || miss(acc.monthly_pct) ||
      miss(acc.rolling_reset_at) || miss(acc.weekly_reset_at) || miss(acc.monthly_reset_at);

    // 熔断判断必须在计算 weight 之前
    let fused = dataMissing;
    let fuse_reason = dataMissing ? 'data_missing' : null;
    if (!fused && u_r !== null && u_r >= cfg.fuse_rolling_disable) { fused = true; fuse_reason = 'rolling_disable'; }
    if (!fused && u_w !== null && u_w >= cfg.F_w && T_w >= cfg.T_w_fuse) { fused = true; fuse_reason = 'weekly_disable'; }
    if (!fused && u_m !== null && u_m >= cfg.fuse_monthly_disable) { fused = true; fuse_reason = 'monthly_disable'; }

    // v4 激进阶梯：R = 60×Q_m 剩余金额，tier_mult 按 T_m 分档（疯狂<2 / 加速2-5 / 正常≥5）
    const R = q_m === null ? 0 : 60 * q_m;
    let tierMult, tier;
    if (T_m < cfg.tier_break_crazy) { tierMult = cfg.tier_mult_crazy; tier = 3; }
    else if (T_m < cfg.tier_break_accel) { tierMult = cfg.tier_mult_accel; tier = 2; }
    else { tierMult = 1; tier = 1; }
    const W = u_w === null ? 1 : Math.min(Math.max(1 - cfg.c_w * Math.pow(u_w, cfg.k) * (T_w / cfg.weekly_period_days), 0), 1);
    const S_eff = R * tierMult * W;

    // P1-5: stale——刚过月度重置点但 pct 未归零（仅标记，不熔断）
    const stale = !fused && u_m !== null && u_m > 0 && T_m <= 0;

    return { account_id: acc.account_id, name: acc.name, S_eff, q_m, T_r, T_w, T_m, tier, fused, fuse_reason, weekly_factor: W, stale };
  });

  const active = scored.filter(s => !s.fused);
  // 每档内 S 最高者 weight=100，其余按比例（档内线性归一化）
  const tierMax = {};
  for (const s of active) tierMax[s.tier] = Math.max(tierMax[s.tier] ?? 0, s.S_eff);

  const result = scored.map(s => {
    let weight;
    if (s.fused) {
      weight = 0;
    } else {
      const tm = tierMax[s.tier] || 0;
      weight = tm > 0 ? Math.max(1, Math.round(100 * s.S_eff / tm)) : 100;
    }
    return {
      account_id: s.account_id, name: s.name,
      burn_rate: Math.round(s.S_eff * 10000) / 10000,
      priority: s.fused ? 1 : s.tier,
      weight,
      tier: s.tier,
      rolling_remain: Math.round(s.T_r * 100) / 100,
      weekly_remain: Math.round(s.T_w * 100) / 100,
      monthly_remain: Math.round(s.T_m * 100) / 100,
      fused: s.fused, fuse_reason: s.fuse_reason,
      stale: s.stale,
      weekly_factor: Math.round(s.weekly_factor * 10000) / 10000,
      q_m: s.q_m === null ? null : Math.round(s.q_m * 10000) / 10000,
    };
  });

  // 全熔断兜底：只从 rolling_disable 账号里选 Q_m 最大的，设 weight=1
  if (active.length === 0) {
    const candidates = result.filter(r => r.fuse_reason === 'rolling_disable');
    if (candidates.length) {
      const best = candidates.reduce((a, b) => ((b.q_m ?? -Infinity) > (a.q_m ?? -Infinity) ? b : a));
      best.weight = 1;
      best.fallback = true;
    }
  }

  return result;
}

module.exports = { calculatePriorities, normalizeUsage };
