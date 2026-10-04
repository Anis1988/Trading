import type { AppConfig } from '../types';

declare const __APP_ENV__: Record<string, string>;

// Values are injected at BUILD time from Netlify env vars (see vite.config.ts).
// Nothing secret is committed. NOTE: they still end up in the public bundle.
const e: Record<string, string> = typeof __APP_ENV__ !== 'undefined' ? __APP_ENV__ : {};

export const config: AppConfig = {
  mcpEndpoint: e.NETLIFY_MCP_ENDPOINT ?? '',
  mcpApiKey: e.NETLIFY_MCP_API_KEY ?? '',
  emailServiceId: e.EMAILJS_SERVICE_ID ?? '',
  emailTemplateId: e.EMAILJS_TEMPLATE_ID ?? '',
  emailUserId: e.EMAILJS_USER_ID ?? '',
  newsApiKey: e.NEWSAPI_KEY ?? '',
  siteName: e.SITE_NAME ?? '',
  siteId: e.SITE_ID ?? '',
  context: e.CONTEXT ?? '',
  branch: e.BRANCH ?? '',
};

export const mcpConfigured = () => !!(config.mcpEndpoint && config.mcpApiKey);
export const emailConfigured = () =>
  !!(config.emailServiceId && config.emailTemplateId && config.emailUserId);
