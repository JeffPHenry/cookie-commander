// Data layer: cookies + history + activity, joined into per-domain stats.

import { isAdServing } from "./trackerdb.js";

export function bare(d) {
  return d.startsWith(".") ? d.slice(1) : d;
}

export async function getAllCookies() {
  let cookies;
  try {
    cookies = await chrome.cookies.getAll({ partitionKey: {} });
  } catch {
    cookies = await chrome.cookies.getAll({});
  }
  return cookies;
}

export async function getHistoryByHost() {
  const items = await chrome.history.search({ text: "", maxResults: 100000, startTime: 0 });
  const byHost = new Map(); // host -> {visits, lastVisit}
  for (const it of items) {
    let host;
    try { host = new URL(it.url).hostname; } catch { continue; }
    const h = byHost.get(host) ?? { visits: 0, lastVisit: 0 };
    h.visits += it.visitCount ?? 1;
    h.lastVisit = Math.max(h.lastVisit, it.lastVisitTime ?? 0);
    byHost.set(host, h);
  }
  return byHost;
}

export async function getActivity() {
  const { activity = {} } = await chrome.storage.local.get("activity");
  return activity;
}

export async function getRules() {
  const { rules } = await chrome.storage.local.get("rules");
  return rules ?? { block: [], autoPurge: [], protected: [] };
}

export async function saveRules(rules) {
  await chrome.storage.local.set({ rules });
}

export function isProtected(domain, rules) {
  const d = bare(domain);
  return (rules.protected ?? []).some((r) => d === r || d.endsWith("." + r));
}

// Which block-list entry (if any) covers this domain — subdomains included.
export function blockRuleFor(domain, rules) {
  const d = bare(domain);
  return (rules.block ?? []).find((r) => d === r || d.endsWith("." + r)) ?? null;
}

export function isBlocked(domain, rules) {
  return !!blockRuleFor(domain, rules);
}

// Shared "blocked" badge, so the state reads the same everywhere a domain appears.
export function blockedChip(domain, rules, blockStats = {}) {
  const rule = blockRuleFor(domain, rules);
  if (!rule) return "";
  const kills = blockStats[rule]?.n ?? 0;
  const via = rule === bare(domain) ? "" : ` (via ${rule})`;
  const title = kills
    ? `blocked${via} — ${kills} cookie${kills === 1 ? "" : "s"} killed on arrival`
    : `blocked${via} — new cookies die on arrival`;
  return `<span class="chip blk" title="${title}">✕ blocked${kills ? " " + kills : ""}</span>`;
}

// Walk history hosts up their label chain so www.chase.com visits land on .chase.com cookies.
function attributeHistory(domains, byHost) {
  const set = new Set(domains);
  const out = new Map();
  for (const [host, h] of byHost) {
    let d = host;
    while (d.includes(".")) {
      if (set.has(d)) {
        const cur = out.get(d) ?? { visits: 0, lastVisit: 0 };
        cur.visits += h.visits;
        cur.lastVisit = Math.max(cur.lastVisit, h.lastVisit);
        out.set(d, cur);
        break;
      }
      d = d.slice(d.indexOf(".") + 1);
    }
  }
  return out;
}

export function buildStats(cookies, byHost, activity) {
  const now = Date.now() / 1000;
  const perDomain = new Map();

  for (const c of cookies) {
    const d = bare(c.domain);
    let s = perDomain.get(d);
    if (!s) {
      s = {
        domain: d, cookies: 0, reach: new Set(), expired: 0, session: 0,
        secure: 0, httpOnly: 0, sameSiteNone: 0, maxExpiry: 0, list: [],
      };
      perDomain.set(d, s);
    }
    s.cookies++;
    s.list.push(c);
    if (c.partitionKey?.topLevelSite) s.reach.add(c.partitionKey.topLevelSite);
    if (c.session) s.session++;
    else if (c.expirationDate < now) s.expired++;
    if (c.secure) s.secure++;
    if (c.httpOnly) s.httpOnly++;
    if (c.sameSite === "no_restriction") s.sameSiteNone++;
    if (c.expirationDate) s.maxExpiry = Math.max(s.maxExpiry, c.expirationDate);
  }

  const hist = attributeHistory([...perDomain.keys()], byHost);
  const dayAgo = Date.now() - 86400000;

  const rows = [];
  for (const s of perDomain.values()) {
    const reach = Math.max(s.reach.size, 1);
    const h = hist.get(s.domain);
    const act = activity[s.domain] ?? {};
    let writes24h = 0, writesTotal = 0, lastWrite = 0;
    for (const [hr, n] of Object.entries(act)) {
      writesTotal += n;
      if (Number(hr) >= dayAgo) writes24h += n;
      lastWrite = Math.max(lastWrite, Number(hr));
    }
    rows.push({
      domain: s.domain,
      cookies: s.cookies,
      reach,
      reachSites: [...s.reach],
      tier: reach >= 5 ? "tracker" : reach >= 2 ? "shared" : "first-party",
      adServing: isAdServing(s.domain),
      expired: s.expired,
      session: s.session,
      secure: s.secure,
      httpOnly: s.httpOnly,
      sameSiteNone: s.sameSiteNone,
      maxExpiry: s.maxExpiry,
      visits: h?.visits ?? 0,
      lastVisit: h?.lastVisit ?? 0,
      writes24h,
      writesTotal,
      lastWrite,
      list: s.list,
    });
  }
  return rows;
}

export async function loadEverything() {
  const [cookies, byHost, activity, rules] = await Promise.all([
    getAllCookies(), getHistoryByHost(), getActivity(), getRules(),
  ]);
  return { cookies, rows: buildStats(cookies, byHost, activity), activity, rules };
}

export function cookieUrl(c) {
  return (c.secure ? "https://" : "http://") + bare(c.domain) + c.path;
}

export async function removeCookie(c) {
  const details = { url: cookieUrl(c), name: c.name, storeId: c.storeId };
  if (c.partitionKey) details.partitionKey = c.partitionKey;
  return chrome.cookies.remove(details);
}

export async function setCookie(fields, original) {
  const details = {
    url: fields.url ?? cookieUrl(fields),
    name: fields.name,
    value: fields.value,
    path: fields.path || "/",
    secure: !!fields.secure,
    httpOnly: !!fields.httpOnly,
    sameSite: fields.sameSite || "unspecified",
  };
  if (fields.domain.startsWith(".")) details.domain = fields.domain;
  if (fields.expirationDate) details.expirationDate = fields.expirationDate;
  if (fields.partitionKey) details.partitionKey = fields.partitionKey;

  // Only remove the original when its identity key changed — a same-key set()
  // overwrites in place. And if the set fails after a removal, put the
  // original back so an invalid edit can't destroy the cookie.
  const keyChanged = original && (
    original.name !== details.name ||
    original.domain !== fields.domain ||
    original.path !== details.path
  );
  if (keyChanged) await removeCookie(original);
  let res = null, err = null;
  try { res = await chrome.cookies.set(details); } catch (e) { err = e; }
  if (!res && keyChanged) await restoreCookie(original).catch(() => {});
  if (err) throw err;
  return res;
}

function restoreCookie(c) {
  const d = {
    url: cookieUrl(c), name: c.name, value: c.value, path: c.path,
    secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
  };
  if (c.domain.startsWith(".")) d.domain = c.domain;
  if (!c.session && c.expirationDate) d.expirationDate = c.expirationDate;
  if (c.partitionKey) d.partitionKey = c.partitionKey;
  return chrome.cookies.set(d);
}

// Deletion ledger: every user-initiated removal gets a dated record (capped at 500).
export async function logDeletions(entries) {
  if (!entries.length) return;
  const { deleteLog = [] } = await chrome.storage.local.get("deleteLog");
  const stamped = entries.map((e) => ({ at: Date.now(), ...e }));
  await chrome.storage.local.set({ deleteLog: [...stamped, ...deleteLog].slice(0, 500) });
}

export function fmtAgo(ms) {
  if (!ms) return "—";
  const s = (Date.now() - ms) / 1000;
  if (s < 90) return "just now";
  if (s < 5400) return Math.round(s / 60) + "m ago";
  if (s < 129600) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
}

export function fmtExpiry(sec) {
  if (!sec) return "session";
  const d = new Date(sec * 1000);
  if (d.getTime() < Date.now()) return "expired";
  const y = d.getFullYear();
  return y > 2100 ? "2100+" : d.toISOString().slice(0, 10);
}
