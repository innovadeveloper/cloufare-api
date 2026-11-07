export type Env = {
  CONTENT: R2Bucket;
  DB: D1Database;
  RATING_LIMITER: RateLimit;
  CATALOG_KEY: string;
  CATALOG_TTL_SECONDS?: string;
  ENVIRONMENT?: string;
  GOOGLE_CLIENT_ID?: string;
};
