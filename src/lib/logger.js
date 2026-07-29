/**
 * Production-safe logger.
 * In development, logs to console. In production, suppresses all output
 * to prevent information leakage via browser DevTools.
 */
const isDev = import.meta.env.DEV

export const logger = {
  log: isDev ? console.log.bind(console) : () => {},
  warn: isDev ? console.warn.bind(console) : () => {},
  error: isDev ? console.error.bind(console) : () => {},
}
