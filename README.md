# Cookie Commander

**The best cookie management extension in the world — antivirus, but for your browser.**

Right now, ad exchanges are auctioning your attention in real time, and everyone in the chain — the browser companies, the advertisers, the device makers, your ISP — is happy to let it happen. Cookie Commander is where it stops. See every cookie every company keeps on your machine, watch the trackers that ride along with you across the web, and shut them down: block, purge, protect, alarm. 100% local, zero network code — nothing you do here ever leaves your machine.

## The field report

Don't take our word for it. **[Read what one real browser was carrying →](FINDINGS.md)**
4,916 cookies. 799 domains. Criteo inside 126 different sites. Comscore running a one-cookie-per-site
census across 109. A credit bureau fingerprinting the browser from 6. All of it named, with receipts.

## Install (30 seconds)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** → pick this folder
4. Pin the toolbar icon and click it — the dashboard opens in a full tab

Chrome will warn that the extension can "read your browsing history" and "read and change data on all sites." That's the `history` + cookie permissions doing the stats you asked for; the code makes zero network requests.

## What's inside

| Tab | What it does |
|---|---|
| **Overview** | Stat tiles, most-viewed (history × cookies), most-active (writes/24h), most-recent, widest-reach trackers |
| **Explore** | Filter by trackers / **ad-serving** / shared / first-party. Every domain in a sortable, searchable table: cookies, reach, visits, last visit, writes, expiry. "Delete all shown" bulk-deletes the current filter |
| **Visualize** | Force-directed tracker reach graph, treemap, expiry timeline, 14-day activity heatmap |
| **Editor** | Full CRUD: inspect (values masked until clicked), edit any field, create, delete one or a whole domain |
| **Rules** | Alarm mode (desktop notifications with Block/Delete buttons when new trackers appear), block list, auto-purge on startup, protected domains |

## Everything is clickable

Any domain name anywhere — overview lists, stat tiles, table rows, treemap boxes, graph nodes, heatmap cells, timeline buckets — opens that domain's full info page (who it is, footprint stats, sites it rode along on, every cookie with per-cookie delete). The ⋮ buttons and right-click on visualizations open an action menu: block, auto-purge, protect, delete. Filters, sort, search, and the active tab persist across reloads.

## Alarm mode

The service worker watches cookie writes and notifies you (macOS notification with action buttons) when: a domain's cookies cross into 5+ sites (new tracker), a cross-site cookie arrives from a domain you never visited, or one domain writes 60+ cookies in an hour. Once per domain, max 6/hour. Configure in Rules. If notifications don't appear, allow Chrome in System Settings → Notifications.

## Safety rails

- Major US banks and brokerages (Chase, BofA, Fidelity, Schwab, Robinhood, PayPal, …) are **protected** out of the box: bulk operations skip them, single deletes demand a confirm. Edit the list in Rules.
- "Most active / most recent" build from live cookie-write tracking that starts at install (rolling 14-day window, capped storage).
- "Purge on close" runs at next browser startup — MV3 can't detect browser close.

## Files

- `manifest.json` — MV3, permissions: cookies, history, storage, alarms
- `sw.js` — service worker: activity logging, block/auto-purge rules
- `dashboard.html/css` — the UI
- `js/data.js` — cookies + history + activity joined into per-domain stats
- `js/viz.js` — canvas visualizations
- `js/editor.js` — CRUD + bulk delete with protected-domain guard
- `js/app.js` — shell, overview, table, timeline, rules
