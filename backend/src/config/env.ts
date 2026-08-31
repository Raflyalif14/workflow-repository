import dotenv from 'dotenv';

dotenv.config();

const userRoles = ['SUPER_ADMIN', 'SALES', 'HEAD_SA', 'SA'] as const;
const defaultRegisterRole = process.env.DEFAULT_REGISTER_ROLE || 'SA';

if (!userRoles.includes(defaultRegisterRole as (typeof userRoles)[number])) {
  throw new Error('DEFAULT_REGISTER_ROLE must be one of SUPER_ADMIN, SALES, HEAD_SA, SA');
}

export const ENV = {
  PORT: process.env.PORT || '4000',
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
  DEFAULT_REGISTER_ROLE: defaultRegisterRole as (typeof userRoles)[number],
  SUPABASE_DOCUMENT_BUCKET: process.env.SUPABASE_DOCUMENT_BUCKET || 'workflow-documents',
};
