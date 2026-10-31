import geoip from "geoip-lite";

export interface GeoLocation {
  countryCode: string;
  country: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
}

const COUNTRY_NAMES: Record<string, string> = {
  BD: "Bangladesh",
  US: "United States",
  GB: "United Kingdom",
  IN: "India",
  CA: "Canada",
  DE: "Germany",
  FR: "France",
  AU: "Australia",
  SG: "Singapore",
  AE: "United Arab Emirates",
  MY: "Malaysia",
  PK: "Pakistan",
  JP: "Japan",
  CN: "China",
  BR: "Brazil",
};

export class GeolocationService {
  static resolve(ip?: string): GeoLocation {
    if (!ip) {
      return this.getDefaultLocation();
    }

    // Clean IP (remove IPv6 prefix if present)
    const cleanIp = ip.replace(/^::ffff:/, "").trim();

    // Check for localhost or private networks
    if (
      cleanIp === "127.0.0.1" ||
      cleanIp === "::1" ||
      cleanIp === "localhost" ||
      cleanIp.startsWith("192.168.") ||
      cleanIp.startsWith("10.") ||
      cleanIp.startsWith("172.16.")
    ) {
      return {
        countryCode: "BD",
        country: "Bangladesh",
        region: "Dhaka",
        city: "Dhaka",
        latitude: 23.8103,
        longitude: 90.4125,
      };
    }

    try {
      const geo = geoip.lookup(cleanIp);
      if (geo) {
        let countryName = COUNTRY_NAMES[geo.country] || geo.country || "Unknown";
        if (typeof Intl !== "undefined" && geo.country && geo.country.length === 2) {
          try {
            const resolved = new Intl.DisplayNames(["en"], { type: "region" }).of(geo.country);
            if (resolved) countryName = resolved;
          } catch {}
        }
        return {
          countryCode: geo.country || "UNKNOWN",
          country: countryName,
          region: geo.region || "",
          city: geo.city || "",
          latitude: geo.ll ? geo.ll[0] : null,
          longitude: geo.ll ? geo.ll[1] : null,
        };
      }
    } catch {
      // Fallback on error
    }

    return this.getDefaultLocation();
  }

  private static getDefaultLocation(): GeoLocation {
    return {
      countryCode: "UNKNOWN",
      country: "Unknown",
      region: "",
      city: "",
      latitude: null,
      longitude: null,
    };
  }
}
