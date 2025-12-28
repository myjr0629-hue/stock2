/**
 * GEMS V8.1 - Central Configuration
 * Single Source of Truth for Base URL and Environment Settings
 */

export const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000";

export const IS_DEV = process.env.NODE_ENV === "development";

export const ENGINE_CONFIG = {
    DEFAULT_RUN_TIMEOUT_MS: 600000, // 10 minutes
    LOCK_TTL_MS: 180000,           // 3 minutes
};
