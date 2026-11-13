import rateLimit from "express-rate-limit";

// Rate limiter for general public tracking requests (unlimited to prevent dropping live audience hits)
export const trackingRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000000, // Effectively unlimited (1,000,000 req/min) so high-traffic sites never drop visitor heartbeats
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
