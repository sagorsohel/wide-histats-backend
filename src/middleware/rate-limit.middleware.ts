import rateLimit from "express-rate-limit";

// Per-IP limiter for public tracking requests (generous: a visitor IP never needs more than this)
export const trackingRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // 300 req/min per visitor IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    message: "Too many tracking events from this IP, please try again later.",
  },
});

// Rate limiter for authentication attempts
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    message: "Too many login attempts, please try again after 15 minutes.",
  },
});
