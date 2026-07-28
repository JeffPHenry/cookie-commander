// Bundled offline profiles for common cookie-setting domains. No network lookups —
// unknown domains get a tier-based generic explanation plus a web-search link.

const DB = {
  // ---- ad exchanges / SSPs ----
  "rubiconproject.com": { name: "Magnite (Rubicon Project)", cat: "Ad exchange (SSP)", desc: "One of the largest sell-side ad exchanges. Sites you visit hand it their ad slots; it auctions them to bidders in real time. Its cookie is a persistent auction ID so bidders can recognize and target you across every site it's embedded in." },
  "pubmatic.com": { name: "PubMatic", cat: "Ad exchange (SSP)", desc: "Sell-side ad exchange auctioning publishers' ad space. Its cookies keep a stable ID for you across member sites so auctions can be targeted." },
  "openx.net": { name: "OpenX", cat: "Ad exchange (SSP)", desc: "Programmatic ad exchange. Cookies maintain a cross-site auction identity." },
  "casalemedia.com": { name: "Index Exchange", cat: "Ad exchange (SSP)", desc: "Major ad exchange (Casale Media is its cookie domain). Maintains a cross-site bidder ID." },
  "indexww.com": { name: "Index Exchange", cat: "Ad exchange (SSP)", desc: "Index Exchange's header-bidding infrastructure." },
  "contextweb.com": { name: "PulsePoint", cat: "Ad exchange (SSP)", desc: "Programmatic ad exchange focused on health/pharma advertising. Cookie = cross-site auction ID." },
  "smartadserver.com": { name: "Equativ (Smart AdServer)", cat: "Ad exchange", desc: "European ad exchange and ad server. Cross-site auction cookies." },
  "adform.net": { name: "Adform", cat: "Ad platform", desc: "European ad-tech platform: serving, buying, and tracking. Cross-site ID cookies." },
  "33across.com": { name: "33Across", cat: "Ad exchange / identity", desc: "Sells publisher inventory and runs identity resolution so you stay recognizable as third-party cookies die off." },
  "sovrn.com": { name: "Sovrn", cat: "Ad exchange", desc: "Publisher ad exchange (formerly Lijit). Cross-site auction cookies." },
  "lijit.com": { name: "Sovrn (Lijit)", cat: "Ad exchange", desc: "Sovrn's legacy cookie domain. Cross-site auction ID." },
  "triplelift.com": { name: "TripleLift", cat: "Ad exchange", desc: "Native-advertising exchange. Cross-site bidder cookies." },
  "sharethrough.com": { name: "Sharethrough", cat: "Ad exchange", desc: "Native ad exchange. Cross-site bidder cookies." },
  "gumgum.com": { name: "GumGum", cat: "Ad platform", desc: "Contextual/in-image advertising. Cookies for frequency and identity." },
  "yieldmo.com": { name: "Yieldmo", cat: "Ad exchange", desc: "Mobile-focused ad exchange. Cross-site ID cookies." },
  "teads.tv": { name: "Teads", cat: "Video ads", desc: "Outstream video ad network embedded in article pages. Cross-site cookies for targeting and frequency capping." },

  // ---- demand side / retargeting ----
  "criteo.com": { name: "Criteo", cat: "Retargeting", desc: "The \"that product is following me around the internet\" company. Watches what you browse in stores, then bids to show you those exact products on other sites. Its cookies knit your identity together across every site carrying its tag." },
  "adnxs.com": { name: "Xandr (Microsoft)", cat: "Ad exchange / DSP", desc: "Formerly AppNexus, now Microsoft's ad platform. One of the most widespread tracking cookies on the web — both buys and sells ads, holding a cross-site ID either way." },
  "adsrvr.org": { name: "The Trade Desk", cat: "DSP", desc: "The largest independent ad buyer. Its cookie (and UID2 identity system) tracks you so advertisers can bid on you specifically across the open web." },
  "dotomi.com": { name: "Epsilon/Conversant (Publicis)", cat: "Retargeting / identity", desc: "Personalized retargeting arm of Publicis. Long-lived cross-site identity cookies tied to offline purchase data." },
  "mathtag.com": { name: "MediaMath (now Infillion)", cat: "DSP", desc: "Demand-side ad platform cookie. MediaMath went bankrupt in 2023; the pixels and cookies live on under new ownership." },
  "bidswitch.net": { name: "BidSwitch (Criteo)", cat: "RTB routing", desc: "Plumbing between ad exchanges and buyers — its cookie-sync endpoint matches your ID between dozens of ad companies in one hop." },
  "taboola.com": { name: "Taboola", cat: "Content recommendation", desc: "The \"Around the Web\" clickbait boxes at the bottom of articles. Tracks what you read across all member sites to pick sponsored links you might click." },
  "outbrain.com": { name: "Outbrain", cat: "Content recommendation", desc: "Sponsored-content recommendation widgets on news sites. Cross-site reading-history cookies." },
  "adroll.com": { name: "AdRoll (NextRoll)", cat: "Retargeting", desc: "Retargeting service for smaller e-commerce brands. Cross-site cookies." },

  // ---- Google / Meta / big platforms ----
  "doubleclick.net": { name: "Google (DoubleClick)", cat: "Ad serving", desc: "Google's ad-serving and tracking domain — the single most widespread tracker on the web. The IDE cookie identifies you across virtually every site running Google ads." },
  "googleadservices.com": { name: "Google Ads", cat: "Ad conversion", desc: "Google Ads click and conversion tracking — connects the ad you clicked to what you did afterwards." },
  "googlesyndication.com": { name: "Google AdSense", cat: "Ad serving", desc: "Serves Google ads on third-party sites; cookies for frequency and targeting." },
  "google-analytics.com": { name: "Google Analytics", cat: "Analytics", desc: "Site-usage measurement for the site owner. First-party-ish in practice, but data flows to Google." },
  "googletagmanager.com": { name: "Google Tag Manager", cat: "Tag loader", desc: "Loads other trackers onto pages. Itself mostly a delivery mechanism." },
  "google.com": { name: "Google", cat: "Platform", desc: "Core Google cookies: sign-in, preferences, and the NID ad-personalization ID used across Google properties and beyond." },
  "youtube.com": { name: "YouTube (Google)", cat: "Platform / video", desc: "Sign-in, playback prefs, and ad-personalization cookies. YouTube embeds on other sites mean these travel with you — part of why its reach number is high." },
  "facebook.com": { name: "Meta (Facebook)", cat: "Platform / pixel", desc: "The Facebook Pixel and Like-button cookies report your visits on non-Facebook sites back to Meta for ad targeting, whether or not you clicked anything." },
  "amazon-adsystem.com": { name: "Amazon Ads", cat: "Ad platform", desc: "Amazon's advertising arm on third-party sites — targets you using your Amazon shopping profile." },
  "bing.com": { name: "Microsoft Bing", cat: "Platform / ads", desc: "Microsoft search and its ad conversion tracking (UET tag)." },
  "linkedin.com": { name: "LinkedIn (Microsoft)", cat: "Platform / pixel", desc: "LinkedIn Insight Tag on other sites reports your visits back for B2B ad targeting." },
  "tiktok.com": { name: "TikTok", cat: "Platform / pixel", desc: "TikTok Pixel tracks visits on other sites for ad targeting and attribution." },
  "pinterest.com": { name: "Pinterest", cat: "Platform / pixel", desc: "Pinterest Tag conversion and targeting cookies." },
  "reddit.com": { name: "Reddit", cat: "Platform / pixel", desc: "Reddit Pixel plus session cookies." },
  "twitter.com": { name: "X (Twitter)", cat: "Platform / pixel", desc: "X's conversion pixel and embed cookies." },

  // ---- measurement / identity / DMPs ----
  "scorecardresearch.com": { name: "Comscore", cat: "Audience measurement", desc: "TV-style \"ratings\" for the web. Its cookie counts you as a panel member across a huge share of major sites — which is why its reach is nearly one cookie per site." },
  "imrworldwide.com": { name: "Nielsen", cat: "Audience measurement", desc: "Nielsen's digital ratings tracking. Cross-site measurement ID." },
  "quantserve.com": { name: "Quantcast", cat: "Measurement / DMP", desc: "Audience measurement and ad targeting. Long-lived cross-site ID cookies." },
  "demdex.net": { name: "Adobe Audience Manager", cat: "DMP", desc: "Adobe's data-management platform — merges your behavior across sites of its corporate customers into audience segments." },
  "everesttech.net": { name: "Adobe Advertising", cat: "Ad platform", desc: "Adobe's ad-buying arm. Cross-site conversion and ID cookies." },
  "krxd.net": { name: "Salesforce DMP (Krux)", cat: "DMP", desc: "Salesforce's data-management platform. Builds cross-site audience profiles for its customers." },
  "bluekai.com": { name: "Oracle BlueKai", cat: "DMP (defunct)", desc: "Oracle's data broker, shut down in 2024. Its cookies are pure dead weight now — safe to delete." },
  "crwdcntrl.net": { name: "Lotame", cat: "DMP", desc: "Data-management platform building cross-site interest profiles." },
  "rlcdn.com": { name: "LiveRamp", cat: "Identity resolution", desc: "Links your cookies to a persistent person-level ID (RampID) that connects online behavior with offline data like loyalty cards. One of the more consequential trackers here." },
  "id5-sync.com": { name: "ID5", cat: "Identity resolution", desc: "Shared identity service for ad tech — exists specifically to keep you identifiable as browsers phase out third-party cookies." },
  "intentiq.com": { name: "Intent IQ", cat: "Identity resolution", desc: "Cross-device identity resolution — links your phone, laptop, and TV into one advertising profile." },
  "liadm.com": { name: "LiveIntent", cat: "Email-based identity", desc: "Identity network keyed off hashed email addresses, mostly via newsletter ads." },
  "agkn.com": { name: "Neustar (TransUnion)", cat: "Identity / data broker", desc: "Marketing identity resolution owned by credit bureau TransUnion." },
  "tapad.com": { name: "Tapad (Experian)", cat: "Cross-device identity", desc: "Links your devices together for ad targeting; owned by credit bureau Experian." },

  // ---- verification / analytics / misc ----
  "doubleverify.com": { name: "DoubleVerify", cat: "Ad verification", desc: "Checks that ads were actually seen by humans. Less about profiling you, more about auditing ads." },
  "moatads.com": { name: "Moat (Oracle)", cat: "Ad verification", desc: "Ad viewability measurement." },
  "chartbeat.com": { name: "Chartbeat", cat: "Publisher analytics", desc: "Real-time analytics newsrooms use to watch what you're reading. Per-site measurement, modest tracking risk." },
  "hotjar.com": { name: "Hotjar", cat: "Session recording", desc: "Records heatmaps and session replays of how you use a site — mouse movements included. Per-site, not cross-site." },
  "onetrust.com": { name: "OneTrust", cat: "Consent management", desc: "Ironically, the cookie-consent popup itself. Stores your cookie choices." },
  "cookielaw.org": { name: "OneTrust", cat: "Consent management", desc: "OneTrust's cookie domain — remembers your consent-banner choices." },
  "trustarc.com": { name: "TrustArc", cat: "Consent management", desc: "Consent-banner provider; stores your privacy choices." },
  "media.net": { name: "Media.net", cat: "Contextual ads", desc: "Contextual ad network tied to the Yahoo/Bing ad feed. Its prebid cookies sync your ID into header-bidding auctions." },
};

const GENERIC = {
  tracker: (r) => `No profile in the bundled database, but the footprint speaks for itself: this domain planted cookies inside ${r.reach} different sites you visited. You almost certainly never went to it directly — that pattern is the signature of an ad network, tracker, or identity service riding along on other people's pages.`,
  shared: (r) => `Present inside ${r.reach} sites — could be a CDN, an embedded widget, a payment or login provider, or a small ad service. Not enough spread to call it a tracker outright.`,
  "first-party": () => `Only seen on its own site — these are ordinary cookies from somewhere you actually visited: logins, preferences, shopping carts, and the site's own analytics.`,
};

// "Ad-serving" = known domains whose business is serving/buying/selling ads.
// Deliberately excludes platforms people log into (google.com, facebook.com),
// analytics, consent tools, and DMP/identity services.
const AD_CATS = /ad exchange|ad platform|ad serving|ad conversion|dsp|retargeting|rtb routing|content recommendation|video ads|contextual ads|ad verification/i;

export function isAdServing(domain) {
  let probe = String(domain).toLowerCase();
  while (probe.includes(".")) {
    const e = DB[probe];
    if (e) return AD_CATS.test(e.cat);
    probe = probe.slice(probe.indexOf(".") + 1);
  }
  return false;
}

export function lookup(row) {
  const d = row.domain.toLowerCase();
  let probe = d;
  while (probe.includes(".")) {
    if (DB[probe]) return { ...DB[probe], known: true, matched: probe };
    probe = probe.slice(probe.indexOf(".") + 1);
  }
  return {
    name: row.domain,
    cat: row.tier === "tracker" ? "Unknown — tracker-shaped" : row.tier === "shared" ? "Unknown — shared" : "First-party site",
    desc: GENERIC[row.tier](row),
    known: false,
  };
}
