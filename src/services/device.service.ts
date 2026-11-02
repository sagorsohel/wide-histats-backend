import { UAParser } from "ua-parser-js";

export interface DeviceInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
}

export class DeviceService {
  static parse(userAgent?: string): DeviceInfo {
    if (!userAgent) {
      return {
        browser: "Unknown",
        browserVersion: "",
        os: "Unknown",
        osVersion: "",
        deviceType: "desktop",
      };
    }

    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    let deviceType: DeviceInfo["deviceType"] = "desktop";
    const ua = userAgent.toLowerCase();
    if (
      device.type === "mobile" ||
      /mobile|android|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop|windows phone/i.test(ua)
    ) {
      deviceType = "mobile";
    } else if (device.type === "tablet" || /tablet|ipad|playbook|silk/i.test(ua)) {
      deviceType = "tablet";
    }

    return {
      browser: browser.name || "Unknown",
      browserVersion: browser.version || "",
      os: os.name || "Unknown",
      osVersion: os.version || "",
      deviceType,
    };
  }
}
