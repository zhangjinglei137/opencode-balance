// ponytail: 用正则从 HTML 中提取用量数据，与 opencode-usage-viewer 相同的解析策略
async function fetchUsage(workspaceId, authCookie) {
  const url = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/go`;
  const headers = buildPageHeaders(authCookie);
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

// 抓取每日用量，自动翻页直到跨天
async function fetchDailyUsage(workspaceId, authCookie) {
  const cookieStr = authCookie.includes("auth=") ? authCookie : `auth=${authCookie}`;
  const usageUrl = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/usage`;
  
  // 先获取初始页面，提取 server-id
  const initResp = await fetch(usageUrl, {
    headers: { ...buildPageHeaders(authCookie), 'Accept': 'text/html' },
    redirect: "follow",
  });
  if (!initResp.ok) return { dailyCost: 0, topModels: [], error: `HTTP ${initResp.status}` };
  
  const html = await initResp.text();
  
  // 从 HTML 提取 x-server-id（64 位 hex，出现在 script 或 meta 中）
  let serverId = 'bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c';
  const sidMatch = html.match(/[a-f0-9]{64}/);
  if (sidMatch) serverId = sidMatch[0];

  // 东八区今日日期
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 3600000);
  const today = beijing.toISOString().slice(0, 10);

  const modelTotals = {};
  let dailyCost = 0;
  let totalPages = 0;

  // 逐页抓取
  for (let page = 0; page < 50; page++) {
    const records = await fetchUsagePage(workspaceId, cookieStr, serverId, page);
    if (!records || records.length === 0) break;
    totalPages++;

    let crossedDay = false;
    for (const rec of records) {
      const utcDate = new Date(rec.time);
      const bjDate = new Date(utcDate.getTime() + 8 * 3600000).toISOString().slice(0, 10);
      
      if (bjDate < today) {
        // 已经翻到昨天，停止
        crossedDay = true;
        break;
      }
      if (bjDate !== today) continue;

      if (!modelTotals[rec.model]) modelTotals[rec.model] = { cost: 0, tokens: 0, count: 0 };
      modelTotals[rec.model].cost += rec.cost;
      modelTotals[rec.model].tokens += rec.tokens;
      modelTotals[rec.model].count++;
      dailyCost += rec.cost;
    }

    if (crossedDay || records.length < 50) break;
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

async function fetchUsagePage(workspaceId, cookieStr, serverId, page) {
  const body = JSON.stringify({
    t: {t:9,i:0,l:2,a:[{t:1,s:workspaceId},{t:0,s:page}],o:0},
    f: 31, m: []
  });

  const resp = await fetch('https://opencode.ai/_server', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieStr,
      'Accept': '*/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://opencode.ai',
      'Referer': `https://opencode.ai/workspace/${workspaceId}/usage`,
      'x-server-id': serverId,
      'x-server-instance': `server-fn:${page + 1}`,
    },
    body,
  });

  if (!resp.ok) return null;
  const text = await resp.text();

  // 解析记录
  const records = [];
  const segRegex = /id:"(usg_[^"]+)",workspaceID:"[^"]+",timeCreated:\$R\[\d+\]=new Date\("([^"]+)"\),[^}]*?model:"([^"]+)",[^}]*?cost:(\d+)/g;
  let m;
  while ((m = segRegex.exec(text)) !== null) {
    const inputM = /inputTokens:(\d+)/.exec(m[0]);
    const outputM = /outputTokens:(\d+)/.exec(m[0]);
    const reasonM = /reasoningTokens:(\d+)/.exec(m[0]);
    const cacheM = /cacheReadTokens:(\d+)/.exec(m[0]);
    records.push({
      time: m[2],
      model: m[3],
      cost: Number(m[4]) / 100000000,
      tokens: (inputM ? Number(inputM[1]) : 0) + (outputM ? Number(outputM[1]) : 0) +
        (reasonM ? Number(reasonM[1]) : 0) + (cacheM ? Number(cacheM[1]) : 0),
    });
  }
  return records;
}

function buildPageHeaders(authCookie) {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html",
    "Cookie": authCookie.includes("auth=") ? authCookie : `auth=${authCookie}`,
  };
}

module.exports = { fetchUsage, fetchDailyUsage };
