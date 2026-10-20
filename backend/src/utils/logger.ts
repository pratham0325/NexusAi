/** Tiny leveled logger — no dependency, no noise in tests. */
const ts = () => new Date().toISOString().slice(11, 23);

export const logger = {
  info: (...args: unknown[]) => console.log(`[${ts()}] INFO`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${ts()}] WARN`, ...args),
  error: (...args: unknown[]) => console.error(`[${ts()}] ERROR`, ...args),
};
