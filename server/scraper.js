// ponytail: 用正则从 HTML 中提取用量数据，与 opencode-usage-viewer 相同的解析策略
async function fetchUsage(workspaceId, authCookie) {
  const url = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/go`;
  const headers = buildHeaders(authCookie);
  const resp = await fetch(url, { headers, redirect: "follow" });

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new Error("认证过期，请更新 auth cookie");
    throw new Error(`HTTP ${resp.status}`);
  }

  const html = await resp.text();
  if (html.includes("Sign in") && !html.includes("rollingUsage")) {
    throw new Error("认证过期，请更新 auth cookie");
  }

  function extract(section) {
    const regex = new RegExp(`${section}:\\$R\\[\\d+\\]=\\{status:"ok",resetInSec:(\\d+),usagePercent:(\\d+)\\}`, "i");
    const match = html.match(regex);
    if (!match) return null;
    const resetInSec = Number(match[1]);
    const now = new Date();
    return { pct: Number(match[2]), resetAt: new Date(now.getTime() + resetInSec * 1000).toISOString(), resetInSec };
  }

  function extractRewards() {
    const amountMatch = html.match(/rewardAmount:(\d+)/);
    const rewardAmount = amountMatch ? Number(amountMatch[1]) : 500;
    const listMatch = html.match(/rewards:\$R\[\d+\]=\[(.*?)\]\}\)/s);
    if (!listMatch) return { rewardAmount, total: 0, used: 0, unused: 0 };
    const rewardItems = [];
    const itemRegex = /\{id:"([^"]+)",source:"([^"]+)",status:"([^"]+)",email:"([^"]+)",amount:(\d+)/g;
    let m;
    while ((m = itemRegex.exec(listMatch[1])) !== null) {
      rewardItems.push({ id: m[1], source: m[2], status: m[3], email: m[4], amount: Number(m[5]) });
    }
    const used = rewardItems.filter(r => r.status === "applied").length;
    return { rewardAmount, rewards: rewardItems, total: rewardItems.length, used, unused: rewardItems.length - used };
  }

  const result = {
    rolling: extract("rollingUsage"),
    weekly: extract("weeklyUsage"),
    monthly: extract("monthlyUsage"),
    rewards: extractRewards(),
  };

  if (!result.rolling && !result.weekly && !result.monthly) {
    throw new Error("未在页面中找到用量数据");
  }
  return result;
}

// 抓取 /usage 页面，获取每日用量和 Top 5 模型
async function fetchDailyUsage(workspaceId, authCookie) {
  const url = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/usage`;
  const headers = buildHeaders(authCookie);
  const resp = await fetch(url, { headers, redirect: "follow" });

  if (!resp.ok) {
    return { dailyCost: 0, topModels: [], error: `HTTP ${resp.status}` };
  }

  const html = await resp.text();

  // 东八区今日日期
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 3600000);
  const today = beijing.toISOString().slice(0, 10);

  // ponytail: 页面固定返回最近 50 条，不支持翻页，当日超过 50 条请求时只统计最近的 50 条
  const segments = html.split('id:"usg_');
  const modelTotals = {};
  let dailyCost = 0;

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const modelM = new RegExp('model:"([^"]+)"').exec(seg);
    const costM = /cost:(\d+)/.exec(seg);
    if (!modelM || !costM) continue;

    const timeM = new RegExp('timeCreated:\\$R\\[\\d+\\]=new Date\\("([^"]+)"\\)').exec(seg);
    if (!timeM) continue;
    // 页面时间戳是 UTC，转为东八区日期再比较
    const utcDate = new Date(timeM[1]);
    const beijingDate = new Date(utcDate.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    if (beijingDate !== today) continue;

    const inputM = /inputTokens:(\d+)/.exec(seg);
    const outputM = /outputTokens:(\d+)/.exec(seg);
    const reasonM = /reasoningTokens:(\d+)/.exec(seg);
    const cacheM = /cacheReadTokens:(\d+)/.exec(seg);

    const cost = Number(costM[1]) / 100000000;
    const tokens = (inputM ? Number(inputM[1]) : 0) + (outputM ? Number(outputM[1]) : 0) +
      (reasonM ? Number(reasonM[1]) : 0) + (cacheM ? Number(cacheM[1]) : 0);

    if (!modelTotals[modelM[1]]) modelTotals[modelM[1]] = { cost: 0, tokens: 0, count: 0 };
    modelTotals[modelM[1]].cost += cost;
    modelTotals[modelM[1]].tokens += tokens;
    modelTotals[modelM[1]].count++;
    dailyCost += cost;
  }

  const topModels = Object.entries(modelTotals)
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 5)
    .map(([name, data]) => ({
      name,
      cost: Math.round(data.cost * 10000) / 10000,
      tokens: data.tokens,
      count: data.count,
    }));

  return { dailyCost: Math.round(dailyCost * 10000) / 10000, topModels };
}

function buildHeaders(authCookie) {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html",
    "Cookie": authCookie.includes("auth=") ? authCookie : `auth=${authCookie}`,
  };
}

module.exports = { fetchUsage, fetchDailyUsage };
