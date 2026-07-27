// Service worker: activity tracking + rules engine + alarm mode (alert notifications).
// All data stays in chrome.storage.local; the only thing that ever leaves the machine is nothing.

const DAY = 86400000;
const RETENTION_DAYS = 14;
const REACH_ALERT = 5;          // distinct sites → "new tracker" alert
const BURST_ALERT = 60;         // cookie writes in the last hour → burst alert
const MAX_ALERTS_PER_FLUSH = 3; // per 1-minute window
const MAX_ALERTS_PER_HOUR = 6;

// Protected defaults: major US banks/brokers, so a bulk delete never logs anyone
// out of their money mid-session. Fully editable in the Rules tab.
const DEFAULT_RULES = {
  block: [],
  autoPurge: [],
  protected: [
    "chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com", "capitalone.com",
    "fidelity.com", "schwab.com", "vanguard.com", "robinhood.com", "etrade.com",
    "paypal.com", "venmo.com",
  ],
};
const DEFAULT_ALERTS = { enabled: true, newTracker: true, crossSite: true, burst: true };

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

chrome.runtime.onInstalled.addListener(async () => {
  const { rules, alertCfg } = await chrome.storage.local.get(["rules", "alertCfg"]);
  if (!rules) await chrome.storage.local.set({ rules: DEFAULT_RULES });
  if (!alertCfg) await chrome.storage.local.set({ alertCfg: DEFAULT_ALERTS });
  chrome.alarms.create("flush", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("flush", { periodInMinutes: 1 });
  await runAutoPurge();
});

// ---- cached config (invalidated on storage writes) ----
let cache = {};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const k of Object.keys(changes)) delete cache[k];
});
async function cfg(key, fallback) {
  if (!(key in cache)) {
    const got = await chrome.storage.local.get(key);
    cache[key] = got[key] ?? fallback;
  }
  return cache[key];
}

function bare(d) { return d.startsWith(".") ? d.slice(1) : d; }
function matches(domain, list) {
  const d = bare(domain);
  return (list ?? []).some((r) => d === r || d.endsWith("." + r));
}
function siteHost(topLevelSite) {
  return topLevelSite.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

// ---- live observation buffers (flushed by the 1-minute alarm) ----
let buffer = {};        // { domain: { hourEpochMs: count } }
let pendingReach = {};  // { domain: Set(topLevelSite) }
let pendingCross = {};  // { domain: topLevelSite } — first third-party-context sighting this window
let blockedBuffer = {}; // { blockRuleDomain: killCountThisWindow }

chrome.cookies.onChanged.addListener(async ({ cookie, removed, cause }) => {
  const dom = bare(cookie.domain);
  const hour = Math.floor(Date.now() / 3600000) * 3600000;
  (buffer[dom] ??= {})[hour] = ((buffer[dom] ?? {})[hour] ?? 0) + 1;
  if (removed) return;

  const top = cookie.partitionKey?.topLevelSite;
  if (top) {
    (pendingReach[dom] ??= new Set()).add(top);
    const host = siteHost(top);
    // third-party context: the cookie's domain isn't the site it was planted inside
    if (host !== dom && !host.endsWith("." + dom) && !dom.endsWith("." + host)) {
      pendingCross[dom] ??= top;
    }
  }

  if (cause === "explicit") {
    const rules = await cfg("rules", DEFAULT_RULES);
    const rule = (rules.block ?? []).find((r) => dom === r || dom.endsWith("." + r));
    if (rule) {
      removeCookie(cookie);
      blockedBuffer[rule] = (blockedBuffer[rule] ?? 0) + 1;
    }
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "flush") return;
  await flush();
});

async function flush() {
  const pendingAct = buffer; buffer = {};
  const pReach = pendingReach; pendingReach = {};
  const pCross = pendingCross; pendingCross = {};
  const pBlocked = blockedBuffer; blockedBuffer = {};

  const store = await chrome.storage.local.get(["activity", "reachSeen", "alertSeen", "alertLog", "blockStats"]);
  const activity = store.activity ?? {};
  const reachSeen = store.reachSeen ?? {};
  const alertSeen = store.alertSeen ?? {};
  const alertLog = store.alertLog ?? [];
  const blockStats = store.blockStats ?? {};

  // tally kills per block rule
  for (const [rule, n] of Object.entries(pBlocked)) {
    const s = (blockStats[rule] ??= { n: 0, last: 0 });
    s.n += n;
    s.last = Date.now();
  }

  // 1. merge activity + prune
  for (const [dom, hours] of Object.entries(pendingAct)) {
    const a = (activity[dom] ??= {});
    for (const [h, n] of Object.entries(hours)) a[h] = (a[h] ?? 0) + n;
  }
  const cutoff = Date.now() - RETENTION_DAYS * DAY;
  for (const [dom, hours] of Object.entries(activity)) {
    for (const h of Object.keys(hours)) if (Number(h) < cutoff) delete hours[h];
    if (!Object.keys(hours).length) delete activity[dom];
  }

  // 2. merge reach observations
  const prevKnown = new Set(Object.keys(reachSeen));
  for (const [dom, sites] of Object.entries(pReach)) {
    const cur = new Set(reachSeen[dom] ?? []);
    for (const s of sites) cur.add(s);
    reachSeen[dom] = [...cur].slice(0, 30);
  }

  // 3. evaluate alerts
  const alertCfg = await cfg("alertCfg", DEFAULT_ALERTS);
  const candidates = [];
  if (alertCfg.enabled) {
    if (alertCfg.newTracker) {
      for (const dom of Object.keys(pReach)) {
        if ((reachSeen[dom]?.length ?? 0) >= REACH_ALERT && !alertSeen["tracker:" + dom]) {
          candidates.push({
            type: "tracker", dom,
            title: "New tracker following you",
            msg: `${dom} now has cookies planted inside ${reachSeen[dom].length}+ different sites you visit.`,
          });
        }
      }
    }
    if (alertCfg.crossSite) {
      for (const [dom, top] of Object.entries(pCross)) {
        if (prevKnown.has(dom)) continue;                    // not new — seen in earlier windows
        if (alertSeen["cross:" + dom] || alertSeen["tracker:" + dom]) continue;
        if (candidates.some((c) => c.dom === dom)) continue; // tracker alert already covers it
        candidates.push({
          type: "cross", dom,
          title: "Cross-site cookie planted",
          msg: `${dom} set a cookie while you were on ${siteHost(top)} — you never visited ${dom} directly.`,
        });
      }
    }
    if (alertCfg.burst) {
      const hourAgo = Date.now() - 3600000;
      for (const dom of Object.keys(pendingAct)) {
        const writes = Object.entries(activity[dom] ?? {})
          .filter(([h]) => Number(h) >= hourAgo)
          .reduce((a, [, n]) => a + n, 0);
        if (writes >= BURST_ALERT && !alertSeen["burst:" + dom]) {
          candidates.push({
            type: "burst", dom,
            title: "Cookie write burst",
            msg: `${dom} wrote ${writes} cookies in the last hour.`,
          });
        }
      }
    }
  }

  // 4. rate-limit and fire
  const hourAgo = Date.now() - 3600000;
  const recentCount = alertLog.filter((e) => e.at >= hourAgo && !e.suppressed).length;
  let budget = Math.min(MAX_ALERTS_PER_FLUSH, Math.max(0, MAX_ALERTS_PER_HOUR - recentCount));
  for (const c of candidates) {
    alertSeen[c.type + ":" + c.dom] = Date.now();
    const suppressed = budget <= 0;
    alertLog.unshift({ at: Date.now(), type: c.type, domain: c.dom, msg: c.msg, suppressed });
    if (!suppressed) {
      budget--;
      chrome.notifications.create(`cc|${c.type}|${c.dom}`, {
        type: "basic",
        iconUrl: "icon128.png",
        title: c.title,
        message: c.msg,
        contextMessage: "Cookie Commander",
        priority: 2,
        buttons: [{ title: "Block & delete cookies" }, { title: "Delete cookies only" }],
      });
    }
  }

  await chrome.storage.local.set({
    activity, reachSeen, alertSeen, alertLog: alertLog.slice(0, 100), blockStats,
  });
}

// ---- notification actions ----
chrome.notifications.onButtonClicked.addListener(async (id, btnIdx) => {
  const [tag, , dom] = id.split("|");
  if (tag !== "cc" || !dom) return;
  const rules = await cfg("rules", DEFAULT_RULES);
  if (matches(dom, rules.protected)) {
    chrome.notifications.create("cc-prot", {
      type: "basic", iconUrl: "icon128.png", title: "Domain is protected",
      message: `${dom} is on your protected list — nothing was deleted. Manage this in Rules.`,
      contextMessage: "Cookie Commander",
    });
    chrome.notifications.clear(id);
    return;
  }
  if (btnIdx === 0 && !rules.block.includes(dom)) {
    rules.block.push(dom);
    await chrome.storage.local.set({ rules });
  }
  const n = await purgeDomain(dom);
  if (n) await logDeletion({ domain: dom, count: n, source: "notification" });
  chrome.notifications.clear(id);
  chrome.notifications.create("cc-done-" + dom, {
    type: "basic", iconUrl: "icon128.png",
    title: btnIdx === 0 ? `${dom} blocked` : `${dom} cleaned`,
    message: `Deleted ${n} cookie${n === 1 ? "" : "s"}${btnIdx === 0 ? " — future ones die on arrival." : "."}`,
    contextMessage: "Cookie Commander",
  });
});

chrome.notifications.onClicked.addListener((id) => {
  if (!id.startsWith("cc")) return;
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  chrome.notifications.clear(id);
});

// ---- purge helpers ----
async function purgeDomain(dom) {
  const all = await getAllCookies();
  let n = 0;
  for (const c of all) {
    if (bare(c.domain) === dom || bare(c.domain).endsWith("." + dom)) {
      await removeCookie(c); n++;
    }
  }
  return n;
}

async function runAutoPurge() {
  const rules = await cfg("rules", DEFAULT_RULES);
  if (!rules.autoPurge?.length) return;
  const all = await getAllCookies();
  let purged = 0;
  for (const c of all) {
    if (matches(c.domain, rules.autoPurge) && !matches(c.domain, rules.protected)) {
      await removeCookie(c); purged++;
    }
  }
  if (purged) await logDeletion({ domain: "(auto-purge)", count: purged, source: "startup auto-purge" });
}

async function logDeletion(entry) {
  const { deleteLog = [] } = await chrome.storage.local.get("deleteLog");
  deleteLog.unshift({ at: Date.now(), ...entry });
  await chrome.storage.local.set({ deleteLog: deleteLog.slice(0, 500) });
}

async function getAllCookies() {
  try { return await chrome.cookies.getAll({ partitionKey: {} }); }
  catch { return await chrome.cookies.getAll({}); }
}

function removeCookie(c) {
  const url = (c.secure ? "https://" : "http://") + bare(c.domain) + c.path;
  const details = { url, name: c.name, storeId: c.storeId };
  if (c.partitionKey) details.partitionKey = c.partitionKey;
  return chrome.cookies.remove(details).catch(() => {});
}
