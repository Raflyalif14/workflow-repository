'use strict';

const path = require('node:path');
const root = path.resolve(__dirname, '..');

function testEnvironment(source) {
  // Do not inherit database credentials, mail tokens, NODE_OPTIONS or application flags.
  const allowed = new Set(['path', 'pathext', 'systemroot', 'windir', 'comspec', 'temp', 'tmp', 'tmpdir']);
  const environment = Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toLowerCase())));
  return Object.assign(environment, {
    NODE_ENV: 'test',
    TZ: 'UTC',
    SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-ci-service-key',
    SUPABASE_ANON_KEY: 'synthetic-ci-anon-key',
    DEFAULT_REGISTER_ROLE: 'SA',
    TS_NODE_PROJECT: path.join(root, 'tsconfig.json'),
  });
}

module.exports = { testEnvironment };
