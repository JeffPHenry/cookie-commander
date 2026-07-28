// Cookie editor: full CRUD, bulk delete, protected-domain guard.

import { bare, removeCookie, setCookie, isProtected, fmtExpiry, logDeletions } from "./data.js";

let state = null; // set by app.js: { rows, rules, refresh, toast }

export function initEditor(shared) {
  state = shared;
  document.getElementById("ed-search").addEventListener("input", renderDomainList);
  document.getElementById("ed-new").addEventListener("click", () => openForm(null, null));
}

export function renderEditor() {
  renderDomainList();
}

function renderDomainList() {
  const q = document.getElementById("ed-search").value.trim().toLowerCase();
  const list = document.getElementById("ed-domains");
  const rows = state.rows
    .filter((r) => !q || r.domain.toLowerCase().includes(q))
    .sort((a, b) => b.cookies - a.cookies)
    .slice(0, 200);

  list.innerHTML = "";
  for (const r of rows) {
    const prot = isProtected(r.domain, state.rules);
    const det = document.createElement("details");
    det.className = "ed-dom";
    det.innerHTML = `
      <summary>
        <span class="ed-name mono lnk" data-d="${esc(r.domain)}" title="open info page">${esc(r.domain)}</span>
        ${prot ? '<span class="chip prot">protected</span>' : ""}
        <span class="chip ${r.tier === "tracker" ? "t3" : r.tier === "shared" ? "t2" : "t1"}">${r.tier}</span>
        ${r.adServing ? '<span class="chip ad">ad</span>' : ""}
        <span class="ed-count mono">${r.cookies}</span>
        <button class="btn danger sm ed-nuke" data-d="${esc(r.domain)}">delete all</button>
      </summary>
      <div class="ed-cookies"></div>`;
    det.addEventListener("toggle", () => { if (det.open) renderCookieRows(det, r); });
    det.querySelector(".ed-nuke").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      bulkDelete(r, prot);
    });
    list.appendChild(det);
  }
  if (!rows.length) list.innerHTML = '<p class="empty">No domains match.</p>';
}

function renderCookieRows(det, r) {
  const box = det.querySelector(".ed-cookies");
  box.innerHTML = "";
  for (const c of r.list.slice(0, 400)) {
    const row = document.createElement("div");
    row.className = "ed-row";
    row.innerHTML = `
      <span class="mono ed-cname" title="${esc(c.name)}">${esc(c.name)}</span>
      <span class="mono ed-val masked" data-v="${esc(c.value)}">••••••••</span>
      <span class="mono ed-meta">${fmtExpiry(c.session ? 0 : c.expirationDate)}</span>
      <span class="ed-flags mono">${c.secure ? "S" : ""}${c.httpOnly ? "H" : ""}${c.sameSite === "no_restriction" ? "X" : ""}</span>
      <button class="btn ghost sm">edit</button>
      <button class="btn danger sm">del</button>`;
    const val = row.querySelector(".ed-val");
    val.addEventListener("click", () => {
      const masked = val.classList.toggle("masked");
      val.textContent = masked ? "••••••••" : val.dataset.v;
    });
    row.querySelector(".btn.ghost").addEventListener("click", () => openForm(c, r));
    row.querySelector(".btn.danger").addEventListener("click", async () => {
      if (isProtected(r.domain, state.rules) && !confirm(`${r.domain} is on your protected list (bank/broker). Delete "${c.name}" anyway? This may log you out.`)) return;
      await removeCookie(c);
      await logDeletions([{ domain: r.domain, name: c.name, count: 1, source: "editor" }]);
      state.toast(`Deleted ${c.name} from ${r.domain}`);
      state.refresh();
    });
    box.appendChild(row);
  }
  if (r.list.length > 400) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = `Showing 400 of ${r.list.length} — narrow with a filter or use "delete all".`;
    box.appendChild(p);
  }
}

async function bulkDelete(r, prot) {
  if (prot) {
    if (!confirm(`⚠ ${r.domain} is PROTECTED (bank/broker). Deleting all ${r.cookies} cookies will log you out. Really proceed?`)) return;
  } else if (!confirm(`Delete all ${r.cookies} cookies for ${r.domain}?`)) return;
  let n = 0;
  for (const c of r.list) { try { await removeCookie(c); n++; } catch {} }
  if (n) await logDeletions([{ domain: r.domain, count: n, source: "delete all" }]);
  state.toast(`Deleted ${n} cookies from ${r.domain}`);
  state.refresh();
}

export async function bulkDeleteRows(rows, label) {
  const rules = state.rules;
  const skipped = rows.filter((r) => isProtected(r.domain, rules));
  const doomed = rows.filter((r) => !isProtected(r.domain, rules));
  const total = doomed.reduce((a, r) => a + r.cookies, 0);
  if (!total) { state.toast("Nothing to delete (all matching domains are protected)."); return; }
  let msg = `Delete ${total} cookies across ${doomed.length} domains (${label})?`;
  if (skipped.length) msg += `\n\nSkipping ${skipped.length} protected domain(s): ${skipped.map((s) => s.domain).join(", ")}`;
  if (!confirm(msg)) return;
  let n = 0;
  const entries = [];
  for (const r of doomed) {
    let k = 0;
    for (const c of r.list) { try { await removeCookie(c); k++; } catch {} }
    n += k;
    if (k) entries.push({ domain: r.domain, count: k, source: "bulk delete" });
  }
  await logDeletions(entries);
  state.toast(`Deleted ${n} cookies. Protected domains untouched.`);
  state.refresh();
}

// ---- edit / create form ----
function openForm(c, r) {
  const dlg = document.getElementById("ed-dialog");
  const f = document.getElementById("ed-form");
  f.dataset.mode = c ? "edit" : "new";
  f.elements.domain.value = c ? c.domain : "";
  f.elements.name.value = c ? c.name : "";
  f.elements.value.value = c ? c.value : "";
  f.elements.path.value = c ? c.path : "/";
  f.elements.expiry.value = c && !c.session && c.expirationDate
    ? new Date(Math.min(c.expirationDate * 1000, 4102444800000)).toISOString().slice(0, 16) : "";
  f.elements.secure.checked = c ? c.secure : true;
  f.elements.httpOnly.checked = c ? c.httpOnly : false;
  f.elements.sameSite.value = c ? c.sameSite : "lax";
  dlg.dataset.orig = c ? JSON.stringify(c) : "";
  dlg.showModal();
}

export function initForm() {
  const dlg = document.getElementById("ed-dialog");
  const f = document.getElementById("ed-form");
  document.getElementById("ed-cancel").addEventListener("click", () => dlg.close());
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const orig = dlg.dataset.orig ? JSON.parse(dlg.dataset.orig) : null;
    const domain = f.elements.domain.value.trim();
    if (!domain || !f.elements.name.value.trim()) return;
    if (isProtected(domain, state.rules) && !confirm(`${bare(domain)} is protected. Modify anyway?`)) return;
    const fields = {
      domain,
      url: (f.elements.secure.checked ? "https://" : "http://") + bare(domain) + (f.elements.path.value || "/"),
      name: f.elements.name.value.trim(),
      value: f.elements.value.value,
      path: f.elements.path.value || "/",
      secure: f.elements.secure.checked,
      httpOnly: f.elements.httpOnly.checked,
      sameSite: f.elements.sameSite.value,
      partitionKey: orig?.partitionKey,
    };
    if (f.elements.expiry.value) fields.expirationDate = new Date(f.elements.expiry.value).getTime() / 1000;
    try {
      const res = await setCookie(fields, orig);
      if (!res) throw new Error(chrome.runtime.lastError?.message || "set failed");
      state.toast(orig ? "Cookie updated" : "Cookie created");
      dlg.close();
      state.refresh();
    } catch (err) {
      state.toast("Failed: " + err.message, true);
    }
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
