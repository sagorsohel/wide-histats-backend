import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/wide_histat"),
  JWT_ACCESS_SECRET: z.string().default("wide_histat_access_secret_super_secure_key_2026"),
  JWT_REFRESH_SECRET: z.string().default("wide_histat_refresh_secret_super_secure_key_2026"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("30d"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("90d"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  TRACKER_DOMAIN: z.string().default("http://localhost:5000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
