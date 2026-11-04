export interface SiteBaseline {
  usersOnline: number;
  visitorsToday: number;
  pageviewsToday: number;
  totalVisitors: number;
  totalPageviews: number;
  displayId: string;
}

export const baselineStats: Record<string, SiteBaseline> = {
  "cinemovies.net": {
    usersOnline: 1,
    visitorsToday: 57,
    pageviewsToday: 125,
    totalVisitors: 22797292,
    totalPageviews: 40463572,
    displayId: "4867995",
  },
  "streamespn.org": {
    usersOnline: 568,
    visitorsToday: 23368,
    pageviewsToday: 35520,
    totalVisitors: 3868040,
    totalPageviews: 6970312,
    displayId: "4867998",
  },
  "mediatvlive.com": {
    usersOnline: 53,
    visitorsToday: 4010,
    pageviewsToday: 4479,
    totalVisitors: 6923070,
    totalPageviews: 14109847,
    displayId: "4868013",
  },
  "direktsports.com": {
    usersOnline: 166,
    visitorsToday: 11700,
    pageviewsToday: 22714,
    totalVisitors: 2387448,
    totalPageviews: 4571811,
    displayId: "4868014",
  },
  "fifaonscreen.com": {
    usersOnline: 0,
    visitorsToday: 27,
    pageviewsToday: 51,
    totalVisitors: 1134322,
    totalPageviews: 3439956,
    displayId: "5032429",
  },
  "x-x-x-x-x-x-x-x-x-x-x-x.xxx": {
    usersOnline: 2926,
    visitorsToday: 117277,
    pageviewsToday: 175037,
    totalVisitors: 3441087,
    totalPageviews: 4967435,
    displayId: "5050800",
  },
  "fresh-site.com": {
    usersOnline: 994,
    visitorsToday: 71600,
    pageviewsToday: 133570,
    totalVisitors: 1981181,
    totalPageviews: 3612724,
    displayId: "5054366",
  },
  "morejao.shoberkotha.com": {
    usersOnline: 1875,
    visitorsToday: 87875,
    pageviewsToday: 165608,
    totalVisitors: 1875410,
    totalPageviews: 3842910,
    displayId: "5055120",
  },
};

export function getCleanDomain(domainOrUrl: string): string {
  if (!domainOrUrl) return "";
  return domainOrUrl
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .split("/")[0]
    .trim();
}

export function getBaselineStats(domain: string): SiteBaseline {
  const clean = getCleanDomain(domain);
  if (baselineStats[clean]) {
    return baselineStats[clean];
  }

  // Deterministic fallback for any domain
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) & 0xffffffff;
  }
  const absHash = Math.abs(hash);
  const usersOnline = 120 + (absHash % 480);
  const visitorsToday = Math.floor(usersOnline * 35 + (absHash % 5000));
  const pageviewsToday = Math.floor(visitorsToday * 1.6 + (absHash % 8000));
  const totalVisitors = 1500000 + (absHash % 3000000);
  const totalPageviews = Math.floor(totalVisitors * 1.8 + (absHash % 5000000));
  const displayId = String(4800000 + (absHash % 300000));

  return {
    usersOnline,
    visitorsToday,
    pageviewsToday,
    totalVisitors,
    totalPageviews,
    displayId,
  };
}

export function generateFallbackTopPages(cleanDomain: string, count: number = 8) {
  const templates: Record<string, { path: string; title: string }[]> = {
    "streamespn.org": [
      { path: "/", title: "StreamESPN - Watch Live Sports Streaming Free" },
      { path: "/live", title: "Live Streaming Channels - StreamESPN" },
      { path: "/schedule", title: "Today Sports Schedule & Match Fixtures" },
      { path: "/soccer", title: "Live Soccer & Premier League Streams" },
      { path: "/nba", title: "NBA Basketball Live Online - Free HD" },
      { path: "/nfl", title: "NFL Football Streams - Watch Live Today" },
      { path: "/boxing-mma", title: "UFC & Boxing Championship Streams" },
      { path: "/tennis", title: "Tennis Grand Slam & ATP Live" },
    ],
    "cinemovies.net": [
      { path: "/", title: "CineMovies - Watch Movies & TV Series Online Free" },
      { path: "/trending", title: "Trending Movies This Week - CineMovies" },
      { path: "/top-rated", title: "Top Rated Cinema Releases" },
      { path: "/action", title: "Action & Adventure Movies" },
      { path: "/tv-series", title: "Full Episodes TV Series Online" },
    ],
  };

  const domainPages = templates[cleanDomain] || [
    { path: "/", title: `${cleanDomain} - Home Page` },
    { path: "/live", title: `Live Feeds - ${cleanDomain}` },
    { path: "/popular", title: `Most Popular - ${cleanDomain}` },
    { path: "/trending", title: `Trending Now - ${cleanDomain}` },
    { path: "/category/general", title: `Category General - ${cleanDomain}` },
    { path: "/schedule", title: `Broadcast Schedule - ${cleanDomain}` },
  ];

  return domainPages.slice(0, count).map((p, idx) => ({
    path: p.path,
    title: p.title,
    url: `https://${cleanDomain}${p.path}`,
    count: Math.max(1, Math.floor(45 / (idx + 1))),
  }));
}

export function generateFallbackRecentHits(
  cleanDomain: string,
  websiteId: string,
  limit: number = 25
) {
  const pages = generateFallbackTopPages(cleanDomain, 6);
  const sampleCountries = [
    { country: "United States", code: "US", city: "New York" },
    { country: "United Kingdom", code: "GB", city: "London" },
    { country: "Germany", code: "DE", city: "Berlin" },
    { country: "Canada", code: "CA", city: "Toronto" },
    { country: "France", code: "FR", city: "Paris" },
    { country: "Italy", code: "IT", city: "Rome" },
    { country: "Australia", code: "AU", city: "Sydney" },
    { country: "Spain", code: "ES", city: "Madrid" },
    { country: "Netherlands", code: "NL", city: "Amsterdam" },
    { country: "Brazil", code: "BR", city: "Sao Paulo" },
  ];
  const browsers = ["Chrome", "Safari", "Firefox", "Edge"];
  const osList = ["Windows", "Mac OS", "Android", "iOS", "Linux"];
  const referrers = [
    null,
    "https://www.google.com/",
    "https://t.co/",
    "https://facebook.com/",
    "https://reddit.com/",
  ];

  const now = Date.now();
  const hits: any[] = [];

  for (let i = 0; i < limit; i++) {
    const page = pages[i % pages.length];
    const country = sampleCountries[i % sampleCountries.length];
    const browser = browsers[i % browsers.length];
    const os = osList[i % osList.length];
    const referrer = referrers[i % referrers.length];
    // Stagger timestamp by seconds (e.g. 2s, 5s, 11s ago)
    const offsetSeconds = 2 + i * 3 + (i % 2) * 2;
    const viewedAt = new Date(now - offsetSeconds * 1000).toISOString();

    hits.push({
      id: `fallback-hit-${websiteId}-${i}-${now}`,
      websiteId,
      path: page.path,
      title: page.title,
      url: `https://${cleanDomain}${page.path}`,
      referrer,
      viewedAt,
      country: country.country,
      countryCode: country.code,
      city: country.city,
      browser,
      os,
      deviceType: os === "Android" || os === "iOS" ? "mobile" : "desktop",
      visitorKey: `vis-histat-${(i * 123 + 456) % 9999}`,
      ip: `192.168.${(i * 7) % 250 + 1}.${(i * 13) % 250 + 1}`,
      hitsCount: (i % 4) + 1,
    });
  }

  return hits;
}

export function generateFallbackDetailedReferrers(
  totalPv: number,
  totalVis: number
) {
  const sources = [
    { name: "google.com", share: 0.44, ppv: 1.6 },
    { name: "t.co", share: 0.18, ppv: 1.4 },
    { name: "facebook.com", share: 0.12, ppv: 1.8 },
    { name: "bing.com", share: 0.08, ppv: 1.5 },
    { name: "reddit.com", share: 0.06, ppv: 2.1 },
    { name: "duckduckgo.com", share: 0.04, ppv: 1.3 },
    { name: "yahoo.com", share: 0.03, ppv: 1.4 },
    { name: "instagram.com", share: 0.025, ppv: 1.9 },
    { name: "youtube.com", share: 0.015, ppv: 1.7 },
    { name: "pinterest.com", share: 0.01, ppv: 1.5 },
  ];

  const refVisitors = Math.round(totalVis * 0.9853);
  const refPageviews = Math.round(totalPv * 0.9721);

  return sources.map((s, idx) => {
    const visitors = Math.max(1, Math.round(refVisitors * s.share));
    const pageviews = Math.max(1, Math.round(visitors * s.ppv));
    const newVisitors = Math.max(1, Math.round(visitors * 0.95));
    const avgDuration = 120 + (idx * 37) % 180;
    const mins = Math.floor(avgDuration / 60);
    const secs = avgDuration % 60;
    const tpp = `${mins > 0 ? `${mins}m ` : ""}${secs}s`;
    const bounceRate = Number((28.5 + (idx * 3.7) % 20).toFixed(1));

    return {
      rank: idx + 1,
      trend: (idx % 3 === 0 ? "up" : "down") as "up" | "down",
      referrerUrl: s.name,
      fullUrl: `https://${s.name}/`,
      newVisitors,
      visitors,
      pageviews,
      ppv: s.ppv,
      avgDuration,
      tpp,
      bounceRate,
    };
  });
}

