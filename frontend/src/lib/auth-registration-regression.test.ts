import { readFileSync } from 'fs';
import { resolve } from 'path';
import { authRoutes } from './auth';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const frontendRoot = resolve(__dirname, '../..');
const loginPage = readFileSync(resolve(frontendRoot, 'src/app/login/page.tsx'), 'utf8');
const registerPage = readFileSync(resolve(frontendRoot, 'src/app/register/page.tsx'), 'utf8');

assert(authRoutes.public.includes('/register'), 'Registration must remain a public auth route');
assert(loginPage.includes('Create account'), 'Login must retain the Create account link');
assert(registerPage.includes('<form'), 'Registration page must retain its form');
assert(registerPage.includes('"/auth/register"'), 'Registration form must call the existing registration API');
assert(registerPage.includes('Register Account'), 'Registration page must retain its account registration UI');

console.log('Registration frontend regression checks passed.');
