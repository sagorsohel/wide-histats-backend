const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/** Convert strings like "15m", "7d", "30s" (or plain seconds) into milliseconds. */
export const durationToMs = (value: string, fallbackMs: number): number => {
  const match = /^\s*(\d+)\s*([smhdw])?\s*$/i.exec(value);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  return amount * UNIT_MS[unit];
};
