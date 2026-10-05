import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { ENV } from '../config/env';
import { EmailService, buildInitialPasswordEmail, buildPasswordResetEmail } from './email.service';

async function main() {
  const createTransport = nodemailer.createTransport;
  const original = { host: ENV.SMTP_HOST, port: ENV.SMTP_PORT, secure: ENV.SMTP_SECURE,
    user: ENV.SMTP_USER, pass: ENV.SMTP_PASS, from: ENV.SMTP_FROM };
  let constructions = 0;
  // Actual Nodemailer MIME/address composition; stream transport never uses SMTP.
  const transport = createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  try {
    Object.assign(ENV, { SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '2525', SMTP_SECURE: 'false',
      SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: 'Workflow <sender@example.invalid>' });
    (nodemailer as any).createTransport = (options: any) => {
      constructions++;
      assert.equal(options.host, 'smtp.example.invalid');
      assert.equal(options.port, 2525);
      assert.equal(options.secure, false);
      assert.equal(options.auth, undefined);
      return transport;
    };
    for (const language of ['en', 'id'] as const) {
      const initial = { recipientEmail: 'recipient@example.invalid', recipientName: '<Test & User>',
        initialPassword: 'TestOnlyPassword1!', loginUrl: 'https://example.invalid/login', language };
      const reset = { recipientEmail: initial.recipientEmail, recipientName: initial.recipientName,
        resetUrl: 'https://example.invalid/reset#test-only-fragment', language };
      for (const [built, sent] of [
        [buildInitialPasswordEmail(initial), await EmailService.sendInitialPasswordEmail(initial)],
        [buildPasswordResetEmail(reset), await EmailService.sendPasswordResetEmail(reset)],
      ] as const) {
        assert.deepEqual(sent.envelope.to, [initial.recipientEmail]);
        assert.equal(sent.envelope.from, 'sender@example.invalid');
        assert(Buffer.isBuffer(sent.message));
        const mime = sent.message.toString('utf8');
        assert(mime.includes('Subject: ' + built.subject));
        assert(mime.includes('Content-Type: multipart/alternative;'));
        assert(mime.includes('To: recipient@example.invalid'));
        assert(!String(built.html).includes('<Test & User>'));
        assert(String(built.html).includes('&lt;Test &amp; User&gt;'));
      }
    }
    assert.equal(constructions, 1, 'Existing service keeps one reusable transporter');
    console.log('Email transport: actual Nodemailer EN/ID composition, envelope, HTML escaping and transport reuse passed (no SMTP)');
  } finally {
    nodemailer.createTransport = createTransport;
    Object.assign(ENV, { SMTP_HOST: original.host, SMTP_PORT: original.port, SMTP_SECURE: original.secure,
      SMTP_USER: original.user, SMTP_PASS: original.pass, SMTP_FROM: original.from });
    transport.close();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
