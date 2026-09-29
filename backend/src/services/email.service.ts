import nodemailer, { SendMailOptions, Transporter } from 'nodemailer';
import { ENV } from '../config/env';

export type InitialPasswordEmailInput = {
  recipientEmail: string;
  recipientName: string;
  initialPassword: string;
  loginUrl?: string;
  language?: 'en' | 'id';
};

export type PasswordResetEmailInput = {
  recipientEmail: string;
  recipientName: string;
  resetUrl: string;
  language?: 'en' | 'id';
};

const parseSmtpSecure = (value: string) => ['true', '1', 'yes'].includes(value.trim().toLowerCase());

const parseSmtpPort = (value: string) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a positive number');
  }
  return port;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

let transporter: Transporter | null = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!ENV.SMTP_HOST) throw new Error('SMTP_HOST is required');

  transporter = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: parseSmtpPort(ENV.SMTP_PORT),
    secure: parseSmtpSecure(ENV.SMTP_SECURE),
    auth: ENV.SMTP_USER || ENV.SMTP_PASS ? { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS } : undefined,
  });

  return transporter;
};

const getLoginUrl = (loginUrl?: string) => {
  if (loginUrl) return loginUrl;
  return ENV.APP_BASE_URL ? `${ENV.APP_BASE_URL.replace(/\/$/, '')}/login` : '';
};

export const buildInitialPasswordEmail = (input: InitialPasswordEmailInput): SendMailOptions => {
  const loginUrl = getLoginUrl(input.loginUrl);
  const copy = input.language === 'id' ? {
    subject: '[Workflow Repository] Akun Anda Telah Dibuat',
    greeting: 'Halo', account: 'Akun Workflow Repository System Anda telah dibuat.',
    temporaryPassword: 'Password sementara', login: 'Silakan login menggunakan credential tersebut.',
    security: 'Untuk keamanan, Anda wajib mengganti password setelah login pertama kali.',
    thanks: 'Terima kasih.',
  } : {
    subject: '[Workflow Repository] Your Account Has Been Created',
    greeting: 'Hello', account: 'Your Workflow Repository System account has been created.',
    temporaryPassword: 'Temporary password', login: 'Sign in using these credentials.',
    security: 'For security, you must change your password after signing in for the first time.',
    thanks: 'Thank you.',
  };
  const subject = copy.subject;
  const text = [
    `${copy.greeting} ${input.recipientName},`,
    '',
    copy.account,
    '',
    `Email: ${input.recipientEmail}`,
    '',
    `${copy.temporaryPassword}: ${input.initialPassword}`,
    '',
    copy.login,
    '',
    copy.security,
    '',
    loginUrl ? `Login: ${loginUrl}` : '',
    '',
    copy.thanks,
  ].filter((line) => loginUrl || !line.startsWith('Login:')).join('\n');

  const html = `
    <p>${copy.greeting} ${escapeHtml(input.recipientName)},</p>
    <p>${copy.account}</p>
    <p><strong>Email:</strong><br>${escapeHtml(input.recipientEmail)}</p>
    <p><strong>${copy.temporaryPassword}:</strong><br>${escapeHtml(input.initialPassword)}</p>
    <p>${copy.login}</p>
    <p>${copy.security}</p>
    ${loginUrl ? `<p><strong>Login:</strong><br><a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>` : ''}
    <p>${copy.thanks}</p>
  `;

  return {
    from: ENV.SMTP_FROM || undefined,
    to: input.recipientEmail,
    subject,
    text,
    html,
  };
};

export const buildPasswordResetEmail = (input: PasswordResetEmailInput): SendMailOptions => {
  const copy = input.language === 'id' ? {
    greeting: 'Halo', received: 'Kami menerima permintaan untuk melakukan reset password Workflow Repository System.',
    instruction: 'Silakan gunakan link berikut untuk membuat password baru:',
    ignore: 'Jika Anda tidak merasa meminta reset password, abaikan email ini.',
    security: 'Untuk keamanan, link reset bersifat terbatas dan hanya dapat digunakan sesuai kebijakan recovery Supabase.',
    thanks: 'Terima kasih.',
  } : {
    greeting: 'Hello', received: 'We received a request to reset your Workflow Repository System password.',
    instruction: 'Use the following link to create a new password:',
    ignore: 'If you did not request a password reset, ignore this email.',
    security: 'For security, the reset link is time limited and follows the Supabase recovery policy.',
    thanks: 'Thank you.',
  };
  const subject = '[Workflow Repository] Reset Password';
  const text = [
    `${copy.greeting} ${input.recipientName},`,
    '',
    copy.received,
    '',
    copy.instruction,
    '',
    input.resetUrl,
    '',
    copy.ignore,
    '',
    copy.security,
    '',
    copy.thanks,
  ].join('\n');

  const html = `
    <p>${copy.greeting} ${escapeHtml(input.recipientName)},</p>
    <p>${copy.received}</p>
    <p>${copy.instruction}</p>
    <p><a href="${escapeHtml(input.resetUrl)}">${escapeHtml(input.resetUrl)}</a></p>
    <p>${copy.ignore}</p>
    <p>${copy.security}</p>
    <p>${copy.thanks}</p>
  `;

  return {
    from: ENV.SMTP_FROM || undefined,
    to: input.recipientEmail,
    subject,
    text,
    html,
  };
};

export class EmailService {
  static async sendInitialPasswordEmail(input: InitialPasswordEmailInput) {
    return getTransporter().sendMail(buildInitialPasswordEmail(input));
  }

  static async sendPasswordResetEmail(input: PasswordResetEmailInput) {
    return getTransporter().sendMail(buildPasswordResetEmail(input));
  }
}
