// App shell: tabs, overview, explore table, visualizations, rules. Editor lives in editor.js.

import { loadEverything, saveRules, fmtAgo, fmtExpiry, isProtected, removeCookie, logDeletions } from "./data.js";
import { lookup } from "./trackerdb.js";
import { drawTreemap, drawGraph, drawHeatmap, stopViz } from "./viz.js";
import { initEditor, renderEditor, initForm, bulkDeleteRows } from "./editor.js";

const state = {
  rows: [], cookies: [], activity: {}, rules: { block: [], autoPurge: [], protected: [] },
  blockStats: {}, deleteLog: [],
  refresh, toast,
};

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// ---- toast & tooltip ----
let toastTimer;
function toast(msg, err = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (err ? " err" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

function showTip(row, cx, cy) {
  const tip = $("tooltip");
  if (!row) { tip.hidden = true; return; }
  if (row.heatCell) {
    tip.innerHTML = `<div class="tt-title">${esc(row.domain)}</div>
      <div>${row.n} cookie writes</div>
      <div class="tt-dim">${row.day.toLocaleDateString()}</div>`;
  } else if (row.siteNode) {
    tip.innerHTML = `<div class="tt-title">${esc(row.domain)}</div>
      <div class="tt-dim">site you visited — ${row.trackers} of these trackers were on it</div>`;
  } else {
    tip.innerHTML = `<div class="tt-title">${esc(row.domain)}</div>
      <div>${row.cookies} cookies · seen on ${row.reach} site${row.reach > 1 ? "s" : ""}</div>
      <div class="tt-dim">${row.visits ? row.visits + " visits · " : ""}${row.sameSiteNone} sendable cross-site</div>`;
  }
  tip.hidden = false;
  const pad = 14;
  tip.style.left = Math.min(cx + pad, innerWidth - tip.offsetWidth - 10) + "px";
  tip.style.top = Math.min(cy + pad, innerHeight - tip.offsetHeight - 10) + "px";
}

// ---- tabs ----
document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((o) => {
      o.classList.toggle("active", o === b);
      o.setAttribute("aria-selected", String(o === b));
    });
    document.querySelectorAll(".panel").forEach((p) => {
      const on = p.id === "panel-" + b.dataset.tab;
      p.hidden = !on;
      p.classList.toggle("active", on);
    });
    if (b.dataset.tab === "visualize") renderViz();
    if (b.dataset.tab === "editor") renderEditor();
    saveUI();
  });
});

$("refresh").addEventListener("click", refresh);

// ---- overview ----
function renderOverview() {
  const r = state.rows;
  const total = r.reduce((a, x) => a + x.cookies, 0);
  const trackers = r.filter((x) => x.tier === "tracker");
  const expired = r.reduce((a, x) => a + x.expired, 0);
  const xsite = r.reduce((a, x) => a + x.sameSiteNone, 0);
  const top = [...trackers].sort((a, b) => b.reach - a.reach)[0];

  state.topTracker = top?.domain ?? null;
  const tiles = [
    { key: "total", n: total, k: "cookies stored", sub: r.length + " domains", flag: false },
    { key: "trackers", n: trackers.length, k: "cross-site trackers", sub: trackers.reduce((a, x) => a + x.cookies, 0) + " cookies", flag: true },
    { key: "expired", n: expired, k: "already expired", sub: "stored anyway", flag: false },
    { key: "xsite", n: xsite, k: "sendable cross-site", sub: "SameSite=None", flag: true },
    { key: "reach", n: top?.reach ?? 0, k: "widest reach", sub: top?.domain ?? "—", flag: true },
    { key: "blocked", n: killTotal(), k: "cookies blocked", sub: "kill count, live", flag: killTotal() > 0 },
  ];
  $("ov-tiles").innerHTML = tiles.map((t) => `
    <div class="tile${t.flag ? " flag" : ""}" data-tile="${t.key}" role="button" tabindex="0" title="click to open">
      <button class="tile-menu" data-menu="${t.key}" title="actions" aria-label="actions for ${esc(t.k)}">⋮</button>
      <div class="n">${t.n.toLocaleString()}</div>
      <div class="k">${esc(t.k)}</div>
      <div class="sub">${esc(String(t.sub))}</div>
    </div>`).join("");

  ranked("ov-viewed", [...r].sort((a, b) => b.visits - a.visits).filter((x) => x.visits).slice(0, 10),
    (x) => x.visits.toLocaleString() + " visits");
  ranked("ov-active", [...r].sort((a, b) => b.writes24h - a.writes24h).filter((x) => x.writes24h).slice(0, 10),
    (x) => x.writes24h + " writes", "No cookie writes seen yet — this fills as you browse.");
  ranked("ov-recent", [...r].filter((x) => x.lastWrite).sort((a, b) => b.lastWrite - a.lastWrite).slice(0, 10),
    (x) => fmtAgo(x.lastWrite), "Nothing yet — the live log starts at install.");

  const el = $("ov-trackers");
  const tr = [...trackers].sort((a, b) => b.reach - a.reach).slice(0, 12);
  const maxReach = tr[0]?.reach ?? 1;
  el.innerHTML = tr.map((x, i) => `
    <li>
      <span class="rk">${i + 1}</span>
      <span class="dm lnk" data-d="${esc(x.domain)}">${esc(x.domain)}</span>
      <span class="bar-track"><span class="bar" style="width:${(x.reach / maxReach) * 100}%"></span></span>
      <span class="val">${x.reach} sites · ${x.cookies} cookies</span>
    </li>`).join("") || '<p class="empty">No trackers found. Nice.</p>';
}

function ranked(id, rows, valFn, emptyMsg = "—") {
  $(id).innerHTML = rows.map((x, i) => `
    <li>
      <span class="rk">${i + 1}</span>
      <span class="dm lnk" data-d="${esc(x.domain)}">${esc(x.domain)}</span>
      <span class="val">${esc(valFn(x))}</span>
    </li>`).join("") || `<p class="empty">${esc(emptyMsg)}</p>`;
}

// ---- tile actions ----
function switchTab(name) {
  document.querySelector(`.tab[data-tab="${name}"]`).click();
}

function gotoExplore(tier, sortK) {
  exTier = tier;
  document.querySelectorAll("#ex-tier .seg").forEach((o) => o.classList.toggle("on", o.dataset.f === tier));
  if (sortK) {
    exSort = { k: sortK, dir: "desc" };
    document.querySelectorAll("#ex-table thead th").forEach((o) => o.removeAttribute("data-dir"));
    const th = document.querySelector(`#ex-table thead th[data-k="${sortK}"]`);
    if (th) th.dataset.dir = "desc";
  }
  renderExplore();
  switchTab("explore");
}

function killTotal() {
  return Object.values(state.blockStats).reduce((a, s) => a + (s.n ?? 0), 0);
}

function tilePrimary(key) {
  if (key === "blocked") switchTab("rules");
  else if (key === "total") gotoExplore("all", "cookies");
  else if (key === "trackers") gotoExplore("tracker", "reach");
  else if (key === "expired") gotoExplore("all", "expired");
  else if (key === "xsite") gotoExplore("tracker", "cookies");
  else if (key === "reach" && state.topTracker) openInfo(state.topTracker);
}

function tileMenuItems(key) {
  const trackers = () => state.rows.filter((x) => x.tier === "tracker");
  switch (key) {
    case "total": return [
      ["Open in Explore", () => gotoExplore("all", "cookies")],
      ["Open Editor", () => switchTab("editor")],
    ];
    case "trackers": return [
      ["View trackers in Explore", () => gotoExplore("tracker", "reach")],
      ["Block ALL trackers", blockAllTrackers],
      ["Delete all tracker cookies", () => bulkDeleteRows(trackers(), "all trackers")],
    ];
    case "expired": return [
      ["Delete expired cookies now", deleteExpired],
      ["View in Explore", () => gotoExplore("all", "expired")],
    ];
    case "xsite": return [
      ["View trackers in Explore", () => gotoExplore("tracker", "cookies")],
      ["Block ALL trackers", blockAllTrackers],
    ];
    case "blocked": return [
      ["Open Rules & block list", () => switchTab("rules")],
      ["Delete all cookies from blocked domains", purgeBlocked],
    ];
    case "reach": {
      const d = state.topTracker;
      if (!d) return [];
      return [
        ["Full info page", () => openInfo(d)],
        [`Block ${d}`, () => blockDomain(d)],
        [`Delete all ${d} cookies`, () => {
          const row = state.rows.find((x) => x.domain === d);
          if (row) bulkDeleteRows([row], d);
        }],
      ];
    }
  }
  return [];
}

function openMenuAt(items, x, y) {
  if (!items.length) return;
  const menu = $("ctx-menu");
  menu.innerHTML = items.map((it, i) => `<button data-i="${i}">${esc(it[0])}</button>`).join("");
  menu.hidden = false;
  menu.style.top = Math.min(y, innerHeight - menu.offsetHeight - 10) + "px";
  menu.style.left = Math.min(x, innerWidth - menu.offsetWidth - 12) + "px";
  menu.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { menu.hidden = true; items[Number(b.dataset.i)][1](); }));
}

function openMenu(items, anchor) {
  const r = anchor.getBoundingClientRect();
  openMenuAt(items, r.left, r.bottom + 6);
}

function openTileMenu(key, anchor) {
  openMenu(tileMenuItems(key), anchor);
}

function domainMenuItems(d) {
  const row = state.rows.find((x) => x.domain === d);
  if (!row) {
    // no cookies currently stored (e.g. already purged) — offer the rule actions that still make sense
    return [
      [state.rules.block.includes(d) ? "✓ Blocked already" : "Block domain", () => blockDomain(d)],
      ["Auto-purge on startup", () => addRule("autoPurge", d)],
      [isProtected(d, state.rules) ? "✓ Protected already" : "Protect domain", () => addRule("protected", d)],
    ];
  }
  return [
    ["Full info page", () => openInfo(d)],
    [state.rules.block.includes(d) ? "✓ Blocked already" : "Block domain", () => blockDomain(d)],
    ["Auto-purge on startup", () => addRule("autoPurge", d)],
    [isProtected(d, state.rules) ? "✓ Protected already" : "Protect domain", () => addRule("protected", d)],
    ["Delete all its cookies", () => bulkDeleteRows([row], d)],
  ];
}

async function addRule(key, d) {
  if (!state.rules[key].includes(d)) {
    state.rules[key].push(d);
    await saveRules(state.rules);
    renderRules();
  }
  toast(`${d} added to ${key === "autoPurge" ? "auto-purge" : key} list`);
}

$("ov-tiles").addEventListener("click", (e) => {
  const mb = e.target.closest(".tile-menu");
  if (mb) { e.stopPropagation(); openTileMenu(mb.dataset.menu, mb); return; }
  const tile = e.target.closest(".tile[data-tile]");
  if (tile) tilePrimary(tile.dataset.tile);
});
$("ov-tiles").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tile = e.target.closest(".tile[data-tile]");
  if (tile) { e.preventDefault(); tilePrimary(tile.dataset.tile); }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#ctx-menu") && !e.target.closest(".tile-menu") && !e.target.closest(".row-menu"))
    $("ctx-menu").hidden = true;
});

// any element carrying .lnk + data-d opens that domain's info page, wherever it lives
document.addEventListener("click", (e) => {
  const l = e.target.closest(".lnk[data-d]");
  if (!l) return;
  if (l.closest("summary")) e.preventDefault(); // don't also toggle the editor accordion
  openInfo(l.dataset.d);
});

async function blockDomain(d) {
  if (!state.rules.block.includes(d)) {
    state.rules.block.push(d);
    await saveRules(state.rules);
    renderRules();
  }
  toast(`${d} blocked — its cookies now die on arrival`);
}

// ---- explore table ----
let exSort = { k: "cookies", dir: "desc" }, exTier = "all";

function exFiltered() {
  const q = $("ex-q").value.trim().toLowerCase();
  return state.rows.filter((r) =>
    (exTier === "all" || (exTier === "ad" ? r.adServing : r.tier === exTier)) &&
    (!q || r.domain.toLowerCase().includes(q)));
}

function renderExplore() {
  const rows = exFiltered();
  rows.sort((a, b) => {
    let v = typeof a[exSort.k] === "string"
      ? a[exSort.k].localeCompare(b[exSort.k])
      : a[exSort.k] - b[exSort.k];
    if (!v) v = b.cookies - a.cookies;
    return exSort.dir === "asc" ? v : -v;
  });
  $("ex-count").textContent = rows.length + " / " + state.rows.length;
  $("ex-rows").innerHTML = rows.slice(0, 800).map((r) => `
    <tr>
      <td class="dom lnk" data-d="${esc(r.domain)}" title="open info page for ${esc(r.domain)}">${esc(r.domain)}</td>
      <td><span class="chip ${r.tier === "tracker" ? "t3" : r.tier === "shared" ? "t2" : "t1"}">${r.tier}</span>
          ${r.adServing ? '<span class="chip ad">ad</span>' : ""}
          ${isProtected(r.domain, state.rules) ? '<span class="chip prot">prot</span>' : ""}
          <button class="info-btn" data-d="${esc(r.domain)}" title="what is ${esc(r.domain)}?">i</button></td>
      <td class="num">${r.cookies}</td>
      <td class="num">${r.reach}</td>
      <td class="num">${r.visits ? r.visits.toLocaleString() : "—"}</td>
      <td class="num">${fmtAgo(r.lastVisit)}</td>
      <td class="num">${r.writes24h || "—"}</td>
      <td class="num">${fmtAgo(r.lastWrite)}</td>
      <td class="num">${r.expired}</td>
      <td class="num">${fmtExpiry(r.maxExpiry)}</td>
      <td class="num"><button class="row-menu" data-d="${esc(r.domain)}" title="actions" aria-label="actions for ${esc(r.domain)}">⋮</button></td>
    </tr>`).join("");
}

document.querySelectorAll("#ex-table thead th").forEach((th) => {
  th.addEventListener("click", () => {
    const k = th.dataset.k;
    if (!k) return;
    if (exSort.k === k) exSort.dir = exSort.dir === "desc" ? "asc" : "desc";
    else exSort = { k, dir: k === "domain" || k === "tier" ? "asc" : "desc" };
    document.querySelectorAll("#ex-table thead th").forEach((o) => o.removeAttribute("data-dir"));
    th.dataset.dir = exSort.dir;
    renderExplore();
    saveUI();
  });
});
$("ex-q").addEventListener("input", () => { renderExplore(); saveUI(); });
document.querySelectorAll("#ex-tier .seg").forEach((s) => {
  s.addEventListener("click", () => {
    exTier = s.dataset.f;
    document.querySelectorAll("#ex-tier .seg").forEach((o) => o.classList.toggle("on", o === s));
    renderExplore();
    saveUI();
  });
});
$("ex-nuke").addEventListener("click", () => {
  const rows = exFiltered();
  const label = (exTier === "all" ? "all types" : exTier) + ($("ex-q").value ? `, matching "${$("ex-q").value}"` : "");
  bulkDeleteRows(rows, label);
});

// ---- domain info dialog ----
let infoRow = null;

$("ex-rows").addEventListener("click", (e) => {
  const btn = e.target.closest(".info-btn");
  if (btn) { openInfo(btn.dataset.d); return; }
  const rm = e.target.closest(".row-menu");
  if (rm) { e.stopPropagation(); openMenu(domainMenuItems(rm.dataset.d), rm); }
});

function openInfo(domain) {
  const r = state.rows.find((x) => x.domain === domain);
  if (!r) { toast(`No cookies currently stored for ${domain}`); return; }
  $("tooltip").hidden = true; // a canvas click leaves the hover tooltip stranded otherwise
  infoRow = r;
  const info = lookup(r);
  $("info-name").textContent = info.name;
  $("info-cat").textContent = info.cat;
  $("info-domain").textContent = r.domain;
  $("info-desc").textContent = info.desc;

  const cells = [
    [r.cookies.toLocaleString(), "cookies"],
    [r.reach, "sites reached"],
    [r.sameSiteNone, "cross-site capable"],
    [r.expired, "expired"],
    [r.visits ? r.visits.toLocaleString() : "0", "visits by you"],
    [fmtAgo(r.lastVisit), "last visit"],
    [r.writes24h || 0, "writes 24h"],
    [fmtAgo(r.lastWrite), "last write"],
  ];
  $("info-grid").innerHTML = cells.map(([n, k]) => `
    <div class="ig-cell"><div class="ig-n mono">${esc(String(n))}</div><div class="ig-k">${esc(k)}</div></div>`).join("");

  const sites = r.reachSites.map((s) => s.replace(/^https?:\/\//, ""));
  $("info-sites-wrap").hidden = !sites.length;
  $("info-sites").innerHTML =
    sites.slice(0, 48).map((s) => `<span class="site-chip">${esc(s)}</span>`).join("") +
    (sites.length > 48 ? `<span class="site-chip">+${sites.length - 48} more</span>` : "");

  renderInfoCookies(r);
  $("info-search").href = "https://duckduckgo.com/?q=" + encodeURIComponent(`"${r.domain}" tracker what is`);
  const blocked = state.rules.block.includes(r.domain);
  $("info-block").textContent = blocked ? "✓ blocked" : "block domain";
  $("info-block").disabled = blocked;
  $("info-dialog").showModal();
}

function renderInfoCookies(r) {
  $("info-ckcount").textContent = r.cookies;
  const box = $("info-cookies");
  box.innerHTML = "";
  for (const c of r.list.slice(0, 200)) {
    const row = document.createElement("div");
    row.className = "ir-row";
    row.innerHTML = `
      <span class="mono ed-cname" title="${esc(c.name)}">${esc(c.name)}</span>
      <span class="mono ed-val masked" data-v="${esc(c.value)}" title="click to reveal">••••••••</span>
      <span class="mono ed-meta">${fmtExpiry(c.session ? 0 : c.expirationDate)}</span>
      <span class="ed-flags mono" title="S=secure H=httpOnly X=SameSite:none">${c.secure ? "S" : ""}${c.httpOnly ? "H" : ""}${c.sameSite === "no_restriction" ? "X" : ""}</span>
      <button class="btn danger sm">del</button>`;
    const val = row.querySelector(".ed-val");
    val.addEventListener("click", () => {
      const m = val.classList.toggle("masked");
      val.textContent = m ? "••••••••" : val.dataset.v;
    });
    row.querySelector(".btn.danger").addEventListener("click", async () => {
      if (isProtected(r.domain, state.rules) &&
        !confirm(`${r.domain} is protected (bank/broker). Delete "${c.name}" anyway? This may log you out.`)) return;
      await removeCookie(c);
      await logDeletions([{ domain: r.domain, name: c.name, count: 1, source: "info page" }]);
      row.remove();
      $("info-ckcount").textContent = String(Math.max(0, Number($("info-ckcount").textContent) - 1));
      toast(`Deleted ${c.name}`);
      refresh();
    });
    box.appendChild(row);
  }
  if (r.list.length > 200) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = `Showing 200 of ${r.list.length} — use "delete all cookies" below for the rest.`;
    box.appendChild(p);
  }
}

$("info-close").addEventListener("click", () => $("info-dialog").close());
$("info-block").addEventListener("click", async () => {
  if (!infoRow || state.rules.block.includes(infoRow.domain)) return;
  state.rules.block.push(infoRow.domain);
  await saveRules(state.rules);
  renderRules();
  $("info-block").textContent = "✓ blocked";
  $("info-block").disabled = true;
  toast(`${infoRow.domain} blocked — its cookies now die on arrival`);
});
$("info-delete").addEventListener("click", () => {
  if (!infoRow) return;
  $("info-dialog").close();
  bulkDeleteRows([infoRow], infoRow.domain);
});

// ---- visualize ----
let vzMode = "graph";
const VZ_NOTES = {
  graph: "Rose nodes are trackers; violet dots are sites you actually visited. Click a tracker for its info page, right-click for actions.",
  treemap: "Rectangle size = cookie count. Click a box for its info page, right-click for actions.",
  timeline: "When the stored cookies are set to die. Click a row to expand the domains inside it.",
  heatmap: "Cookie writes per domain per day, recorded live from install onward. Click a cell for that domain's info page, right-click for actions.",
};

document.querySelectorAll("#vz-pick .seg").forEach((s) => {
  s.addEventListener("click", () => {
    vzMode = s.dataset.v;
    document.querySelectorAll("#vz-pick .seg").forEach((o) => o.classList.toggle("on", o === s));
    renderViz();
    saveUI();
  });
});

function renderViz() {
  $("vz-note").textContent = VZ_NOTES[vzMode];
  const canvas = $("vz-canvas");
  const tl = $("vz-timeline");
  const useCanvas = vzMode !== "timeline";
  canvas.hidden = !useCanvas;
  tl.hidden = useCanvas;
  const vizMenu = (d, x, y) => openMenuAt(domainMenuItems(d), x, y);
  if (vzMode === "graph") drawGraph(canvas, state.rows, showTip, openInfo, vizMenu);
  else if (vzMode === "treemap") drawTreemap(canvas, state.rows, showTip, openInfo, vizMenu);
  else if (vzMode === "heatmap") drawHeatmap(canvas, state.rows, state.activity, showTip, openInfo, vizMenu);
  else { stopViz(); renderTimeline(tl); }
}

// redraw canvas visualizations when the window is resized
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!$("panel-visualize").hidden && vzMode !== "timeline") renderViz();
  }, 200);
});

function renderTimeline(el) {
  const now = Date.now() / 1000;
  const buckets = [
    { label: "already expired", test: (e) => e > 0 && e < now, dead: true },
    { label: "session only", test: (e, c) => c.session },
    { label: "≤ 30 days", test: (e) => e >= now && e < now + 2592000 },
    { label: "≤ 6 months", test: (e) => e >= now + 2592000 && e < now + 15552000 },
    { label: "≤ 1 year", test: (e) => e >= now + 15552000 && e < now + 31536000 },
    { label: "1–2 years", test: (e) => e >= now + 31536000 && e < now + 63072000 },
    { label: "beyond 2 years", test: (e) => e >= now + 63072000 },
  ].map((b) => ({ ...b, n: 0, doms: new Map() }));

  for (const r of state.rows)
    for (const c of r.list) {
      const e = c.session ? 0 : c.expirationDate ?? 0;
      const b = buckets.find((bk) => bk.test(e, c));
      if (b) { b.n++; b.doms.set(r.domain, (b.doms.get(r.domain) ?? 0) + 1); }
    }
  const max = Math.max(...buckets.map((b) => b.n), 1);
  el.innerHTML = buckets.map((b) => {
    const doms = [...b.doms.entries()].sort((a, z) => z[1] - a[1]);
    const chips = doms.slice(0, 80).map(([d, n]) =>
      `<span class="site-chip lnk" data-d="${esc(d)}" title="open info page">${esc(d)} · ${n}</span>`).join("") +
      (doms.length > 80 ? `<span class="site-chip">+${doms.length - 80} more domains</span>` : "");
    return `
    <details class="tl-det">
      <summary>
        <div class="tl-row">
          <span class="tl-label">${esc(b.label)}</span>
          <span class="tl-track"><span class="tl-bar${b.dead ? " dead" : ""}" style="width:${(b.n / max) * 100}%"></span></span>
          <span class="tl-val">${b.n.toLocaleString()} ▾</span>
        </div>
      </summary>
      <div class="tl-domains">${chips || '<span class="empty">nothing in this bucket</span>'}</div>
    </details>`;
  }).join("");
}

// ---- rules ----
function renderRules() {
  $("block-total").textContent = killTotal() ? killTotal().toLocaleString() + " cookies killed on arrival" : "";
  document.querySelectorAll(".rule-card").forEach((card) => {
    const key = card.dataset.rule;
    const ul = card.querySelector(".rule-list");
    ul.innerHTML = state.rules[key].map((d, i) => {
      const bs = key === "block" ? state.blockStats[d] : null;
      const kills = bs?.n
        ? ` <span class="bk-n" title="last kill ${fmtAgo(bs.last)}">${bs.n}× killed</span>`
        : "";
      return `<li><span>${esc(d)}${kills}</span><button data-i="${i}" title="remove">×</button></li>`;
    }).join("") ||
      '<li class="empty" style="border:0;background:none">empty</li>';
    ul.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", async () => {
        state.rules[key].splice(Number(b.dataset.i), 1);
        await saveRules(state.rules);
        renderRules();
        toast("Rule removed");
      }));
  });
}

document.querySelectorAll(".rule-add").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = form.closest(".rule-card").dataset.rule;
    const input = form.querySelector("input");
    const d = input.value.trim().toLowerCase().replace(/^\./, "").replace(/^https?:\/\//, "").split("/")[0];
    if (!d || !d.includes(".")) { toast("Enter a domain like example.com", true); return; }
    if (!state.rules[key].includes(d)) state.rules[key].push(d);
    await saveRules(state.rules);
    input.value = "";
    renderRules();
    toast(`Added ${d}`);
  });
});

async function blockAllTrackers() {
  const trackers = state.rows.filter((r) => r.tier === "tracker").map((r) => r.domain);
  const fresh = trackers.filter((d) => !state.rules.block.includes(d));
  if (!fresh.length) { toast("All current trackers already blocked"); return; }
  if (!confirm(`Add ${fresh.length} tracker domains to the block list?\n\n${fresh.slice(0, 12).join(", ")}${fresh.length > 12 ? "…" : ""}`)) return;
  state.rules.block.push(...fresh);
  await saveRules(state.rules);
  renderRules();
  toast(`Blocking ${fresh.length} trackers — their cookies now die on arrival`);
}
$("rule-preset-trackers").addEventListener("click", blockAllTrackers);

async function blockAllAdServing() {
  const ads = state.rows.filter((r) => r.adServing).map((r) => r.domain);
  const fresh = ads.filter((d) => !state.rules.block.includes(d));
  if (!fresh.length) { toast("All current ad-serving domains already blocked"); return; }
  if (!confirm(`Block ${fresh.length} known ad-serving domains? Nothing you log into is on this list.\n\n${fresh.slice(0, 12).join(", ")}${fresh.length > 12 ? "…" : ""}`)) return;
  state.rules.block.push(...fresh);
  await saveRules(state.rules);
  renderRules();
  toast(`Blocking ${fresh.length} ad-serving domains — their cookies now die on arrival`);
}
$("rule-preset-adserving").addEventListener("click", blockAllAdServing);

async function deleteExpired() {
  const now = Date.now() / 1000;
  const dead = [];
  for (const r of state.rows)
    for (const c of r.list)
      if (!c.session && c.expirationDate && c.expirationDate < now) dead.push(c);
  if (!dead.length) { toast("No expired cookies found"); return; }
  if (!confirm(`Delete ${dead.length} already-expired cookies? Zero risk — they're dead weight.`)) return;
  let n = 0;
  for (const c of dead) { try { await removeCookie(c); n++; } catch {} }
  if (n) await logDeletions([{ domain: "(expired sweep)", count: n, source: "preset" }]);
  toast(`Cleared ${n} expired cookies`);
  refresh();
}
$("rule-preset-expired").addEventListener("click", deleteExpired);

async function purgeBlocked() {
  const rows = state.rows.filter((r) =>
    state.rules.block.some((b) => r.domain === b || r.domain.endsWith("." + b)));
  if (!rows.length) { toast("No stored cookies from blocked domains — the block is holding"); return; }
  bulkDeleteRows(rows, "all blocked domains");
}
$("rule-preset-purgeblocked").addEventListener("click", purgeBlocked);

// ---- alarm mode settings ----
const ALERT_KEYS = ["enabled", "newTracker", "crossSite", "burst"];

async function loadAlerts() {
  const got = await chrome.storage.local.get(["alertCfg", "alertLog", "blockStats", "deleteLog"]);
  state.alertCfg = got.alertCfg ?? { enabled: true, newTracker: true, crossSite: true, burst: true };
  state.alertLog = got.alertLog ?? [];
  state.blockStats = got.blockStats ?? {};
  state.deleteLog = got.deleteLog ?? [];
}

// ---- deletion log ----
function renderDeleteLog() {
  $("delete-log").innerHTML = state.deleteLog.slice(0, 200).map((e, i) => {
    const pseudo = e.domain.startsWith("(");
    const dom = pseudo
      ? `<span class="mono al-dom">${esc(e.domain)}</span>`
      : `<span class="lnk mono al-dom" data-d="${esc(e.domain)}" title="open info page">${esc(e.domain)}</span>`;
    return `
    <li>
      <span class="mono dim al-when" title="${new Date(e.at).toLocaleString()}">${fmtAgo(e.at)}</span>
      ${dom}
      <span class="al-msg">${e.name ? esc(e.name) + " · " : ""}${e.count} cookie${e.count === 1 ? "" : "s"} · ${esc(e.source)}</span>
      <button class="dl-x" data-i="${i}" title="remove this record">×</button>
    </li>`;
  }).join("") || '<li class="empty">Nothing deleted yet — records appear here with dates as you clean house.</li>';
}

$("delete-log").addEventListener("click", async (e) => {
  const x = e.target.closest(".dl-x");
  if (!x) return;
  state.deleteLog.splice(Number(x.dataset.i), 1);
  await chrome.storage.local.set({ deleteLog: state.deleteLog });
  renderDeleteLog();
  toast("Record removed");
});

$("dl-clear").addEventListener("click", async () => {
  if (!state.deleteLog.length) { toast("Log is already empty"); return; }
  if (!confirm(`Clear all ${state.deleteLog.length} deletion records?`)) return;
  state.deleteLog = [];
  await chrome.storage.local.set({ deleteLog: [] });
  renderDeleteLog();
  toast("Deletion log cleared");
});

function renderAlerts() {
  ALERT_KEYS.forEach((k) => { $("al-" + k).checked = !!state.alertCfg[k]; });
  $("alert-log").innerHTML = state.alertLog.slice(0, 100).map((e) => `
    <li>
      <span class="mono dim al-when">${fmtAgo(e.at)}</span>
      <span class="lnk mono al-dom" data-d="${esc(e.domain)}" title="open info page for ${esc(e.domain)}">${esc(e.domain)}</span>
      <span class="al-msg">${esc(e.msg)}</span>
      ${e.suppressed ? '<span class="chip t2">muted</span>' : ""}
      <button class="row-menu" data-d="${esc(e.domain)}" title="actions" aria-label="actions for ${esc(e.domain)}">⋮</button>
    </li>`).join("") ||
    '<li class="empty">No alerts yet — they arrive as new trackers show up while you browse.</li>';
}

$("alert-log").addEventListener("click", (e) => {
  const rm = e.target.closest(".row-menu");
  if (rm) { e.stopPropagation(); openMenu(domainMenuItems(rm.dataset.d), rm); }
});

ALERT_KEYS.forEach((k) =>
  $("al-" + k).addEventListener("change", async (e) => {
    state.alertCfg[k] = e.target.checked;
    await chrome.storage.local.set({ alertCfg: state.alertCfg });
    toast("Alert settings saved");
  }));

// ---- UI state persistence (filters, sort, search, tab, viz survive reload) ----
function saveUI() {
  chrome.storage.local.set({
    uiState: {
      tab: document.querySelector(".tab.active")?.dataset.tab ?? "overview",
      exTier, exSort, exQ: $("ex-q").value, vzMode,
    },
  });
}

async function restoreUI() {
  const { uiState } = await chrome.storage.local.get("uiState");
  if (!uiState) return;
  exTier = uiState.exTier ?? exTier;
  exSort = uiState.exSort ?? exSort;
  vzMode = uiState.vzMode ?? vzMode;
  $("ex-q").value = uiState.exQ ?? "";
  document.querySelectorAll("#ex-tier .seg").forEach((o) => o.classList.toggle("on", o.dataset.f === exTier));
  document.querySelectorAll("#vz-pick .seg").forEach((o) => o.classList.toggle("on", o.dataset.v === vzMode));
  document.querySelectorAll("#ex-table thead th").forEach((o) => o.removeAttribute("data-dir"));
  const th = document.querySelector(`#ex-table thead th[data-k="${exSort.k}"]`);
  if (th) th.dataset.dir = exSort.dir;
  if (uiState.tab && uiState.tab !== "overview") switchTab(uiState.tab);
}

// ---- boot ----
async function refresh() {
  const data = await loadEverything();
  state.rows = data.rows;
  state.cookies = data.cookies;
  state.activity = data.activity;
  state.rules = data.rules;
  await loadAlerts();
  renderOverview();
  renderExplore();
  renderRules();
  renderAlerts();
  renderDeleteLog();
  if (!$("panel-visualize").hidden) renderViz();
  if (!$("panel-editor").hidden) renderEditor();
}

initEditor(state);
initForm();
restoreUI().then(refresh);
