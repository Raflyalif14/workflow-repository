import { readFileSync } from 'fs';
import { resolve } from 'path';
import { authRoutes } from './auth';
import { translate } from '../i18n';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const frontendRoot = resolve(__dirname, '../..');
const loginPage = readFileSync(resolve(frontendRoot, 'src/app/login/page.tsx'), 'utf8');
const registerPage = readFileSync(resolve(frontendRoot, 'src/app/register/page.tsx'), 'utf8');

assert(authRoutes.public.includes('/register'), 'Registration must remain a public auth route');
assert(/<Link\b[^>]*href="\/register"[^>]*>\s*\{t\("auth.createAccount"\)\}/.test(loginPage), 'Login must retain its localized Create account link to registration');
assert(registerPage.includes('<form'), 'Registration page must retain its form');
assert(registerPage.includes('"/auth/register"'), 'Registration form must call the existing registration API');
assert(registerPage.includes('translateI18n("copy.registerAccount")'), 'Registration page must retain its localized account registration UI');
for (const language of ['en', 'id'] as const) {
  assert(translate('auth.createAccount', undefined, language) === (language === 'en' ? 'Create account' : 'Buat akun'), 'Create account label must be translated in both locales');
  assert(translate('copy.registerAccount', undefined, language) === (language === 'en' ? 'Register Account' : 'Daftarkan Akun'), 'Registration heading must be translated in both locales');
}

console.log('Registration frontend regression checks passed.');
