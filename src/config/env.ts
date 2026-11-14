import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const DEV_ACCESS_SECRET = "dev-only-access-secret-change-me-0123456789";
const DEV_REFRESH_SECRET = "dev-only-refresh-secret-change-me-0123456789";

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/wide_histat"),
  JWT_ACCESS_SECRET: z.string().default(DEV_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().default(DEV_REFRESH_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  TRACKER_DOMAIN: z.string().default("http://localhost:5000"),
  // "true"/"false". Defaults to true in production. Set false only if the site is served over plain http.
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  // "false" disables TLS to PostgreSQL (e.g. local postgres without SSL). Default keeps TLS on.
  DB_SSL: z.enum(["true", "false"]).optional(),
  // Number of reverse proxies in front of the app (Cloudflare tunnel / nginx = 1)
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  // Optional admin bootstrap (no admin is created unless BOTH are set)
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

const data = parsed.data;

if (data.NODE_ENV === "production") {
  const problems: string[] = [];
  const weak = (s: string, dev: string) => s === dev || s.length < 32;
  if (weak(data.JWT_ACCESS_SECRET, DEV_ACCESS_SECRET)) {
    problems.push("JWT_ACCESS_SECRET must be set to a random string of at least 32 characters");
  }
  if (weak(data.JWT_REFRESH_SECRET, DEV_REFRESH_SECRET)) {
    problems.push("JWT_REFRESH_SECRET must be set to a random string of at least 32 characters");
  }
  if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
    problems.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
  }
  if (problems.length > 0) {
    console.error("Insecure production configuration:\n - " + problems.join("\n - "));
    process.exit(1);
  }
} else if (
  data.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET ||
  data.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET
) {
  console.warn("[env] Using development JWT secrets. Set JWT_*_SECRET before deploying.");
}

export const env = data;

/** CORS_ORIGIN may hold several comma-separated origins; trailing slashes are ignored. */
export const allowedOrigins: string[] = data.CORS_ORIGIN.split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export const isDashboardOrigin = (origin: string): boolean => {
  const clean = origin.replace(/\/+$/, "");
  if (allowedOrigins.includes(clean)) return true;
  return (
    data.NODE_ENV !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)
  );
};
