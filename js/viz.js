// Canvas visualizations: treemap, reach graph, heatmap. Timeline is DOM (in app.js).

import { isBlocked } from "./data.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Block state can't be a chip on canvas, so blocked marks get hatched and ✕-flagged.
let blockCtx = { block: [] };
export function setBlockContext(rules) { blockCtx = rules ?? { block: [] }; }
const blocked = (domain) => isBlocked(domain, blockCtx);

function hatch(ctx, x, y, w, h) {
  if (w < 3 || h < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#0b0d14";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = -h; i < w; i += 7) {
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, w: rect.width, h: rect.height };
}

const TIER_COLOR = {
  tracker: () => css("--viz-tracker"),
  shared: () => css("--viz-shared"),
  "first-party": () => css("--viz-first"),
};

// The reach graph animates via rAF; every other draw must cancel it or the
// graph's frame loop keeps repainting the shared canvas over the new chart.
let graphAnim = null;
function cancelAnim() {
  if (graphAnim) { cancelAnimationFrame(graphAnim); graphAnim = null; }
}
export function stopViz() { cancelAnim(); }

// ---- squarified treemap ----
export function drawTreemap(canvas, rows, onHover, onClick, onMenu) {
  cancelAnim();
  const { ctx, w, h } = setupCanvas(canvas);
  const items = rows
    .filter((r) => r.cookies > 0)
    .sort((a, b) => b.cookies - a.cookies)
    .slice(0, 120)
    .map((r) => ({ r, v: r.cookies }));
  const total = items.reduce((a, i) => a + i.v, 0);
  const rects = [];

  function layout(list, x, y, ww, hh) {
    if (!list.length) return;
    if (list.length === 1) { rects.push({ ...list[0], x, y, w: ww, h: hh }); return; }
    let best = 1, bestRatio = Infinity;
    const sum = list.reduce((a, i) => a + i.v, 0);
    for (let k = 1; k <= list.length; k++) {
      const part = list.slice(0, k).reduce((a, i) => a + i.v, 0);
      const frac = part / sum;
      const side = Math.min(ww, hh);
      const other = (ww >= hh ? ww : hh) * frac;
      const worst = Math.max(
        ...list.slice(0, k).map((i) => {
          const cell = (i.v / part) * side * other;
          const a = other, b = cell / other;
          return Math.max(a / b, b / a);
        })
      );
      if (worst <= bestRatio) { bestRatio = worst; best = k; } else break;
    }
    const part = list.slice(0, best).reduce((a, i) => a + i.v, 0);
    const frac = part / sum;
    if (ww >= hh) {
      const stripW = ww * frac;
      let cy = y;
      for (const i of list.slice(0, best)) {
        const ch = (i.v / part) * hh;
        rects.push({ ...i, x, y: cy, w: stripW, h: ch });
        cy += ch;
      }
      layout(list.slice(best), x + stripW, y, ww - stripW, hh);
    } else {
      const stripH = hh * frac;
      let cx = x;
      for (const i of list.slice(0, best)) {
        const cw = (i.v / part) * ww;
        rects.push({ ...i, x: cx, y, w: cw, h: stripH });
        cx += cw;
      }
      layout(list.slice(best), x, y + stripH, ww, hh - stripH);
    }
  }
  layout(items, 0, 0, w, h);

  ctx.clearRect(0, 0, w, h);
  for (const rc of rects) {
    const base = TIER_COLOR[rc.r.tier]();
    const g = ctx.createLinearGradient(rc.x, rc.y, rc.x, rc.y + rc.h);
    g.addColorStop(0, base + "e6");
    g.addColorStop(1, base + "99");
    const isBlk = blocked(rc.r.domain);
    ctx.save();
    if (isBlk) ctx.globalAlpha = 0.45; // neutralized: drained of colour
    ctx.fillStyle = g;
    ctx.fillRect(rc.x + 1, rc.y + 1, Math.max(rc.w - 2, 0), Math.max(rc.h - 2, 0));
    // shine
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.fillRect(rc.x + 1, rc.y + 1, Math.max(rc.w - 2, 0), Math.min(3, rc.h - 2));
    ctx.restore();
    if (isBlk) hatch(ctx, rc.x + 1, rc.y + 1, Math.max(rc.w - 2, 0), Math.max(rc.h - 2, 0));
    drawTreemapLabel(ctx, rc, isBlk);
  }

  const hitAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    return rects.find((rc) => mx >= rc.x && mx <= rc.x + rc.w && my >= rc.y && my <= rc.y + rc.h);
  };
  canvas.onmousemove = (e) => {
    const hit = hitAt(e);
    canvas.style.cursor = hit ? "pointer" : "default";
    onHover(hit ? hit.r : null, e.clientX, e.clientY);
  };
  canvas.onmouseleave = () => onHover(null);
  canvas.onclick = (e) => {
    const hit = hitAt(e);
    if (hit && onClick) onClick(hit.r.domain);
  };
  canvas.oncontextmenu = (e) => {
    e.preventDefault();
    const hit = hitAt(e);
    if (hit && onMenu) onMenu(hit.r.domain, e.clientX, e.clientY);
  };
}

// Adaptive treemap labels: font shrinks with the tile, tall slivers rotate
// vertical, and only boxes too small for ~3 characters stay tooltip-only.
function drawTreemapLabel(ctx, rc, isBlk = false) {
  const vertical = rc.h > rc.w * 1.5 && rc.w < 44 && rc.h > 40;
  const availW = (vertical ? rc.h : rc.w) - 8;
  const availH = (vertical ? rc.w : rc.h) - 4;
  if (availW < 13 || availH < 8) return;
  const fs = Math.max(7, Math.min(11, availH / 2.2, availW / 4));
  const maxChars = Math.floor(availW / (fs * 0.62));
  if (maxChars < 3) return;
  const mark = isBlk ? "✕ " : "";
  const room = maxChars - mark.length;
  const name = mark + (rc.r.domain.length > room
    ? rc.r.domain.slice(0, Math.max(2, room - 1)) + "…"
    : rc.r.domain);
  ctx.save();
  ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`;
  ctx.fillStyle = css("--viz-label");
  if (vertical) {
    ctx.translate(rc.x + rc.w / 2 + fs * 0.35, rc.y + rc.h - 5);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(name, 0, 0);
  } else {
    ctx.fillText(name, rc.x + 4, rc.y + fs + 3);
    const cfs = Math.max(6.5, fs - 1.5);
    if (rc.h > fs + cfs + 12 && maxChars >= 5) {
      ctx.fillStyle = css("--viz-label-dim");
      ctx.font = `${cfs}px ui-monospace, Menlo, monospace`;
      ctx.fillText(String(rc.r.cookies) + (maxChars > 12 ? " cookies" : ""), rc.x + 4, rc.y + fs + cfs + 7);
    }
  }
  ctx.restore();
}

// ---- force-directed reach graph ----
export function drawGraph(canvas, rows, onHover, onClick, onMenu) {
  cancelAnim();
  const { ctx, w, h } = setupCanvas(canvas);

  const trackers = rows.filter((r) => r.tier === "tracker").sort((a, b) => b.reach - a.reach).slice(0, 22);
  const siteCount = new Map();
  for (const t of trackers)
    for (const s of t.reachSites) siteCount.set(s, (siteCount.get(s) ?? 0) + 1);
  const sites = [...siteCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 90).map(([s]) => s);
  const siteSet = new Set(sites);

  const nodes = [
    ...trackers.map((t, i) => ({
      id: t.domain, type: "tracker", row: t,
      r: 7 + Math.sqrt(t.reach) * 1.6,
      x: w / 2 + Math.cos((i / trackers.length) * 6.28) * 60,
      y: h / 2 + Math.sin((i / trackers.length) * 6.28) * 60,
      vx: 0, vy: 0,
    })),
    ...sites.map((s, i) => ({
      id: s, type: "site",
      label: s.replace(/^https?:\/\//, ""),
      r: 3.5 + siteCount.get(s) * 0.55,
      x: w / 2 + Math.cos((i / sites.length) * 6.28) * Math.min(w, h) * 0.38,
      y: h / 2 + Math.sin((i / sites.length) * 6.28) * Math.min(w, h) * 0.38,
      vx: 0, vy: 0,
    })),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  for (const t of trackers)
    for (const s of t.reachSites)
      if (siteSet.has(s)) edges.push([byId.get(t.domain), byId.get(s)]);

  let ticks = 0;
  function step() {
    // repulsion (grid-free O(n²), n≤112 is fine)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.sin(i * 7 + j); dy = Math.cos(i * 3 - j); d2 = 1; }
        const f = 900 / d2;
        const d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    // springs
    for (const [a, b] of edges) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 70) * 0.004;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    // center pull + integrate
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.0015;
      n.vy += (h / 2 - n.y) * 0.0015;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x = Math.max(n.r, Math.min(w - n.r, n.x + n.vx));
      n.y = Math.max(n.r, Math.min(h - n.r, n.y + n.vy));
    }

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = css("--viz-edge");
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const [a, b] of edges) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();

    for (const n of nodes) {
      const nBlocked = n.type === "tracker" && blocked(n.id);
      const color = nBlocked ? "#5a6076" : n.type === "tracker" ? css("--viz-tracker") : css("--viz-site");
      const g = ctx.createRadialGradient(n.x - n.r / 3, n.y - n.r / 3, 0, n.x, n.y, n.r);
      g.addColorStop(0, "#ffffff55");
      g.addColorStop(0.25, color);
      g.addColorStop(1, color + "aa");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, 6.29);
      ctx.fill();
      if (n.type === "tracker") {
        if (!nBlocked) {
          ctx.shadowColor = color; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.29); ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          // struck through: the tracker is still there, but it can't hold an ID
          ctx.strokeStyle = "#ff8496";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(n.x - n.r * 0.7, n.y - n.r * 0.7);
          ctx.lineTo(n.x + n.r * 0.7, n.y + n.r * 0.7);
          ctx.moveTo(n.x + n.r * 0.7, n.y - n.r * 0.7);
          ctx.lineTo(n.x - n.r * 0.7, n.y + n.r * 0.7);
          ctx.stroke();
        }
        ctx.fillStyle = nBlocked ? css("--viz-label-dim") : css("--viz-label");
        ctx.font = "600 10.5px ui-monospace, Menlo, monospace";
        ctx.fillText((nBlocked ? "✕ " : "") + n.id, n.x + n.r + 4, n.y + 3);
      }
    }

    if (++ticks < 260) graphAnim = requestAnimationFrame(step);
  }
  step();

  const hitAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    return nodes.find((n) => (mx - n.x) ** 2 + (my - n.y) ** 2 <= (n.r + 3) ** 2);
  };
  canvas.onmousemove = (e) => {
    const hit = hitAt(e);
    canvas.style.cursor = hit?.type === "tracker" ? "pointer" : "default";
    if (hit?.type === "tracker") onHover(hit.row, e.clientX, e.clientY);
    else if (hit) onHover({ domain: hit.label, siteNode: true, trackers: siteCount.get(hit.id) }, e.clientX, e.clientY);
    else onHover(null);
  };
  canvas.onmouseleave = () => onHover(null);
  canvas.onclick = (e) => {
    const hit = hitAt(e);
    if (hit?.type === "tracker" && onClick) onClick(hit.row.domain);
  };
  canvas.oncontextmenu = (e) => {
    e.preventDefault();
    const hit = hitAt(e);
    if (hit?.type === "tracker" && onMenu) onMenu(hit.row.domain, e.clientX, e.clientY);
  };
}

// ---- activity heatmap ----
export function drawHeatmap(canvas, rows, activity, onHover, onClick, onMenu) {
  cancelAnim();
  const { ctx, w, h } = setupCanvas(canvas);
  const DAYS = 14, DAY = 86400000;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const start = today0.getTime() - (DAYS - 1) * DAY;

  const active = rows
    .filter((r) => r.writesTotal > 0)
    .sort((a, b) => b.writesTotal - a.writesTotal)
    .slice(0, 20);

  ctx.clearRect(0, 0, w, h);
  if (!active.length) {
    ctx.fillStyle = css("--viz-label-dim");
    ctx.font = "13px ui-monospace, Menlo, monospace";
    ctx.fillText("No activity recorded yet — the tracker logs cookie writes from install onward.", 20, 40);
    ctx.fillText("Browse for a bit and come back.", 20, 62);
    canvas.onmousemove = null;
    return;
  }

  const labelW = 190, cellGap = 3;
  const cellW = (w - labelW - 20) / DAYS - cellGap;
  const cellH = Math.min(22, (h - 30) / active.length - cellGap);
  let max = 1;
  const grid = active.map((r) => {
    const days = new Array(DAYS).fill(0);
    for (const [hr, n] of Object.entries(activity[r.domain] ?? {})) {
      const idx = Math.floor((Number(hr) - start) / DAY);
      if (idx >= 0 && idx < DAYS) days[idx] += n;
    }
    max = Math.max(max, ...days);
    return { r, days };
  });

  const cells = [];
  grid.forEach((row, i) => {
    const y = 24 + i * (cellH + cellGap);
    const rowBlocked = blocked(row.r.domain);
    ctx.fillStyle = rowBlocked ? "#ff8496" : css("--viz-label");
    ctx.font = "11px ui-monospace, Menlo, monospace";
    const mark = rowBlocked ? "✕ " : "";
    const raw = row.r.domain.length > 26 - mark.length ? row.r.domain.slice(0, 25 - mark.length) + "…" : row.r.domain;
    ctx.fillText(mark + raw, 8, y + cellH / 2 + 4);
    row.days.forEach((n, dIdx) => {
      const x = labelW + dIdx * (cellW + cellGap);
      const t = n / max;
      ctx.fillStyle = n === 0 ? css("--viz-cell-empty") : heatColor(t);
      ctx.beginPath();
      ctx.roundRect(x, y, cellW, cellH, 3);
      ctx.fill();
      if (n > 0) {
        ctx.fillStyle = "rgba(255,255,255,.12)";
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, Math.min(3, cellH), 3);
        ctx.fill();
      }
      cells.push({ x, y, w: cellW, h: cellH, domain: row.r.domain, n, day: new Date(start + dIdx * DAY) });
    });
  });

  ctx.fillStyle = css("--viz-label-dim");
  ctx.font = "10px ui-monospace, Menlo, monospace";
  for (let d = 0; d < DAYS; d += 2) {
    const dt = new Date(start + d * DAY);
    ctx.fillText(`${dt.getMonth() + 1}/${dt.getDate()}`, labelW + d * (cellW + cellGap), 14);
  }

  const hitAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    return cells.find((c) => mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h);
  };
  canvas.onmousemove = (e) => {
    const hit = hitAt(e);
    canvas.style.cursor = hit ? "pointer" : "default";
    onHover(hit ? { heatCell: true, ...hit } : null, e.clientX, e.clientY);
  };
  canvas.onmouseleave = () => onHover(null);
  canvas.onclick = (e) => {
    const hit = hitAt(e);
    if (hit && onClick) onClick(hit.domain);
  };
  canvas.oncontextmenu = (e) => {
    e.preventDefault();
    const hit = hitAt(e);
    if (hit && onMenu) onMenu(hit.domain, e.clientX, e.clientY);
  };
}

function heatColor(t) {
  // caramel → hot rose ramp
  const stops = [
    [58, 46, 32], [140, 84, 26], [214, 128, 42], [240, 100, 90], [255, 72, 128],
  ];
  const f = t * (stops.length - 1);
  const i = Math.min(Math.floor(f), stops.length - 2);
  const k = f - i;
  const c = stops[i].map((v, ch) => Math.round(v + (stops[i + 1][ch] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
