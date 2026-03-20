import * as Sentry from "@sentry/node";
import { logger } from "./middleware/logger.js";

const dsn = process.env.SENTRY_DSN?.trim();

/** Whether Sentry is enabled (DSN provided and init succeeded). */
export let sentryEnabled = false;

if (dsn) {
  try {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
      release: process.env.SENTRY_RELEASE || undefined,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0"),
      beforeSend(event) {
        // Strip PII from user context if present
        if (event.user) {
          delete event.user.ip_address;
          delete event.user.email;
        }
        return event;
      },
    });
    sentryEnabled = true;
    logger.info("Sentry error tracking initialized");
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Sentry — error tracking disabled");
  }
} else {
  logger.debug("SENTRY_DSN not set — error tracking disabled");
}

export { Sentry };
