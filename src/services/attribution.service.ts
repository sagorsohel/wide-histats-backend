export interface AttributionResult {
  source: string;
  medium: string;
  campaign?: string;
}

const SEARCH_ENGINES: Record<string, string> = {
  "google.com": "google",
  "bing.com": "bing",
  "yahoo.com": "yahoo",
  "duckduckgo.com": "duckduckgo",
  "baidu.com": "baidu",
  "yandex.com": "yandex",
  "ecosia.org": "ecosia",
};

const SOCIAL_NETWORKS: Record<string, string> = {
  "facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "l.facebook.com": "facebook",
  "instagram.com": "instagram",
  "l.instagram.com": "instagram",
  "twitter.com": "twitter",
  "x.com": "twitter",
  "t.co": "twitter",
  "linkedin.com": "linkedin",
  "lnkd.in": "linkedin",
  "reddit.com": "reddit",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "tiktok.com": "tiktok",
  "pinterest.com": "pinterest",
  "whatsapp.com": "whatsapp",
  "telegram.org": "telegram",
};

export class AttributionService {
  static resolve(
    referrer?: string,
    targetUrl?: string,
    utmSource?: string,
    utmMedium?: string,
    utmCampaign?: string
  ): AttributionResult {
    // 1. Check explicit UTM parameters
    if (utmSource) {
      return {
        source: utmSource.toLowerCase(),
        medium: utmMedium ? utmMedium.toLowerCase() : "cpc",
        campaign: utmCampaign,
      };
    }

    // Check query params in targetUrl if provided
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const qSource = parsed.searchParams.get("utm_source");
        const qMedium = parsed.searchParams.get("utm_medium");
        const qCampaign = parsed.searchParams.get("utm_campaign");
        if (qSource) {
          return {
            source: qSource.toLowerCase(),
            medium: qMedium ? qMedium.toLowerCase() : "cpc",
            campaign: qCampaign || undefined,
          };
        }
      } catch {
        // Ignore invalid URL
      }
    }

    // 2. Check Referrer
    if (!referrer || referrer.trim() === "") {
      return {
        source: "direct",
        medium: "none",
      };
    }

    try {
      const refUrl = new URL(referrer);
      const hostname = refUrl.hostname.replace(/^www\./, "").toLowerCase();

      // Check search engines
      for (const [domain, name] of Object.entries(SEARCH_ENGINES)) {
        if (hostname === domain || hostname.endsWith("." + domain)) {
          return {
            source: name,
            medium: "organic",
          };
        }
      }

      // Check social networks
      for (const [domain, name] of Object.entries(SOCIAL_NETWORKS)) {
        if (hostname === domain || hostname.endsWith("." + domain)) {
          return {
            source: name,
            medium: "social",
          };
        }
      }

      // General referral
      return {
        source: hostname,
        medium: "referral",
      };
    } catch {
      return {
        source: "referral",
        medium: "unknown",
      };
    }
  }
}
