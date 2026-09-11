import nodemailer, { SendMailOptions, Transporter } from 'nodemailer';
import { ENV } from '../config/env';

export type InitialPasswordEmailInput = {
  recipientEmail: string;
  recipientName: string;
  initialPassword: string;
  loginUrl?: string;
};

export type PasswordResetEmailInput = {
  recipientEmail: string;
  recipientName: string;
  resetUrl: string;
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
  const subject = '[Workflow Repository] Akun Anda Telah Dibuat';
  const text = [
    `Halo ${input.recipientName},`,
    '',
    'Akun Workflow Repository System Anda telah dibuat.',
    '',
    `Email: ${input.recipientEmail}`,
    '',
    `Password sementara: ${input.initialPassword}`,
    '',
    'Silakan login menggunakan credential tersebut.',
    '',
    'Untuk keamanan, Anda wajib mengganti password setelah login pertama kali.',
    '',
    loginUrl ? `Login: ${loginUrl}` : '',
    '',
    'Terima kasih.',
  ].filter((line) => loginUrl || !line.startsWith('Login:')).join('\n');

  const html = `
    <p>Halo ${escapeHtml(input.recipientName)},</p>
    <p>Akun Workflow Repository System Anda telah dibuat.</p>
    <p><strong>Email:</strong><br>${escapeHtml(input.recipientEmail)}</p>
    <p><strong>Password sementara:</strong><br>${escapeHtml(input.initialPassword)}</p>
    <p>Silakan login menggunakan credential tersebut.</p>
    <p>Untuk keamanan, Anda wajib mengganti password setelah login pertama kali.</p>
    ${loginUrl ? `<p><strong>Login:</strong><br><a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>` : ''}
    <p>Terima kasih.</p>
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
  const subject = '[Workflow Repository] Reset Password';
  const text = [
    `Halo ${input.recipientName},`,
    '',
    'Kami menerima permintaan untuk melakukan reset password Workflow Repository System.',
    '',
    'Silakan gunakan link berikut untuk membuat password baru:',
    '',
    input.resetUrl,
    '',
    'Jika Anda tidak merasa meminta reset password, abaikan email ini.',
    '',
    'Untuk keamanan, link reset bersifat terbatas dan hanya dapat digunakan sesuai kebijakan recovery Supabase.',
    '',
    'Terima kasih.',
  ].join('\n');

  const html = `
    <p>Halo ${escapeHtml(input.recipientName)},</p>
    <p>Kami menerima permintaan untuk melakukan reset password Workflow Repository System.</p>
    <p>Silakan gunakan link berikut untuk membuat password baru:</p>
    <p><a href="${escapeHtml(input.resetUrl)}">${escapeHtml(input.resetUrl)}</a></p>
    <p>Jika Anda tidak merasa meminta reset password, abaikan email ini.</p>
    <p>Untuk keamanan, link reset bersifat terbatas dan hanya dapat digunakan sesuai kebijakan recovery Supabase.</p>
    <p>Terima kasih.</p>
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
