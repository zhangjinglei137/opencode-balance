// ponytail: v2 优先级/权重算法——烧速率模型（Q_m × 月周期 / 剩余天数，周因子惩罚，对数权重映射）
const DEFAULTS = {
  rolling_period_hours: 5, weekly_period_days: 7, monthly_period_days: 30,
  t_min: 0.5, c_w: 1.0, k: 2, S_0: 0.3, gamma: 1.0, W_floor: 5,
  F_w: 0.98, T_w_fuse: 0.5,
  fuse_rolling_disable: 0.95, fuse_monthly_disable: 0.99,
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

    // 烧速率：T_m 用 max(T_m, t_min) 参与计算
    const S = q_m === null ? 0 : q_m * cfg.monthly_period_days / Math.max(T_m, cfg.t_min);
    const W = u_w === null ? 1 : Math.min(Math.max(1 - cfg.c_w * Math.pow(u_w, cfg.k) * (T_w / cfg.weekly_period_days), 0), 1);
    const S_eff = S * W;

    // P1-5: stale——刚过月度重置点但 pct 未归零（仅标记，不熔断；t_min 已防爆表）
    const stale = !fused && u_m !== null && u_m > 0 && T_m <= 0;

    return { account_id: acc.account_id, name: acc.name, S_eff, q_m, T_r, T_w, T_m, fused, fuse_reason, weekly_factor: W, stale };
  });

  const active = scored.filter(s => !s.fused);
  const sMax = active.length ? Math.max(...active.map(s => s.S_eff)) : 0;

  const result = scored.map(s => {
    let weight;
    if (s.fused) {
      weight = 0;
    } else if (!isFinite(sMax) || sMax <= cfg.S_0) {
      weight = 100; // S_max 无效或过低 → 均分
    } else {
      // 先算完幂再 clamp，NaN 或负（S_eff < S_0 时 ln 为负）→ W_floor
      const ratio = Math.pow(Math.log(s.S_eff / cfg.S_0) / Math.log(sMax / cfg.S_0), cfg.gamma);
      weight = (isNaN(ratio) || ratio < 0) ? cfg.W_floor : Math.min(Math.max(Math.round(100 * ratio), cfg.W_floor), 100);
    }
    return {
      account_id: s.account_id, name: s.name,
      burn_rate: Math.round(s.S_eff * 10000) / 10000,
      priority: 1,
      weight,
      tier: 1,
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
