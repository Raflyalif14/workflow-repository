import dotenv from 'dotenv';
import { isIP } from 'node:net';

dotenv.config();

export const validatePublicRegistrationRole = (configuredRole: string | undefined): 'SA' => {
  const defaultRegisterRole = configuredRole ?? 'SA';

  if (defaultRegisterRole !== 'SA') {
    throw new Error('DEFAULT_REGISTER_ROLE must be SA for public registration.');
  }

  return 'SA';
};

export type TrustProxySetting = false | number | string[];

const TRUST_PROXY_SUBNETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

const isTrustedProxyIpOrCidr = (value: string): boolean => {
  const parts = value.split('/');
  if (parts.length === 1) return isIP(parts[0]) !== 0;
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return false;

  const addressFamily = isIP(parts[0]);
  if (!addressFamily) return false;

  const prefixLength = Number(parts[1]);
  return Number.isSafeInteger(prefixLength) && prefixLength >= 0 && prefixLength <= (addressFamily === 4 ? 32 : 128);
};

export const parseTrustProxy = (configuredValue: string | undefined): TrustProxySetting => {
  const value = configuredValue?.trim();
  if (!value || value.toLowerCase() === 'false') return false;

  if (/^(0|[1-9]\d*)$/.test(value)) {
    const hopCount = Number(value);
    if (hopCount <= 10) return hopCount;
  }

  const trustedEntries = value.split(',').map((entry) => entry.trim());
  if (
    trustedEntries.length > 0 &&
    trustedEntries.every((entry) => {
      const normalizedEntry = entry.toLowerCase();
      return TRUST_PROXY_SUBNETS.has(normalizedEntry) || isTrustedProxyIpOrCidr(entry);
    })
  ) {
    return trustedEntries.map((entry) => {
      const normalizedEntry = entry.toLowerCase();
      return TRUST_PROXY_SUBNETS.has(normalizedEntry) ? normalizedEntry : entry;
    });
  }

  throw new Error('TRUST_PROXY must be false, a trusted proxy subnet name, a hop count from 0 to 10, or a comma-separated IP/CIDR list.');
};

const defaultRegisterRole = validatePublicRegistrationRole(process.env.DEFAULT_REGISTER_ROLE);
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

export const ENV = {
  PORT: process.env.PORT || '5000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT || '587',
  SMTP_SECURE: process.env.SMTP_SECURE || 'false',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || '',
  PASSWORD_RESET_URL: process.env.PASSWORD_RESET_URL || 'http://localhost:3000/reset-password',
  INTERNAL_EMAIL_DOMAIN: process.env.INTERNAL_EMAIL_DOMAIN || '',
  TRUST_PROXY: trustProxy,
  DEFAULT_REGISTER_ROLE: defaultRegisterRole,
  SUPABASE_DOCUMENT_BUCKET: process.env.SUPABASE_DOCUMENT_BUCKET || 'workflow-documents',
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || '',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || '',
};
