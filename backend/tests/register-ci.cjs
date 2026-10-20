'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { fileURLToPath } = require('node:url');
const { testEnvironment } = require('./test-environment.cjs');

const suppliedTemporaryRoot = process.env.BACKEND_CI_TEMP_ROOT;
if (suppliedTemporaryRoot && (path.dirname(path.resolve(suppliedTemporaryRoot)) !== path.resolve(os.tmpdir()) ||
  !path.basename(suppliedTemporaryRoot).startsWith('workflow-backend-ci-')))
  throw new Error('Unexpected backend CI fixture path.');
const environment = testEnvironment(process.env);
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, environment);
// Application configuration imports dotenv; CI must never load a developer's .env.
require('dotenv').config = () => ({ parsed: {} });

const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
function requireLoopback(host) {
  if (!loopback.has(String(host).toLowerCase())) throw new Error('Backend CI permits loopback connections only.');
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  requireLoopback(url.hostname);
  return realFetch(input, options);
};
// Covers HTTP(S), SMTP and direct TCP clients in addition to fetch.
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0] : args;
  const target = options[0];
  if (target && typeof target === 'object' && !target.path) requireLoopback(target.host || 'localhost');
  else if (typeof target === 'number') requireLoopback(typeof options[1] === 'string' ? options[1] : 'localhost');
  else throw new Error('Backend CI does not permit pipe or unclassified socket connections.');
  return connect.apply(this, args);
};

// Existing face service fixtures use repository-relative .private paths.
// Redirect only that tree to a per-process temporary store before loading any test.
const privateRoot = path.resolve(__dirname, '../../.private');
const temporaryRoot = suppliedTemporaryRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-backend-ci-'));
function isolatedPath(value) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value) && !(value instanceof URL)) return value;
  const absolute = path.resolve(value instanceof URL ? fileURLToPath(value) : String(value));
  const relative = path.relative(privateRoot, absolute);
  if (relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
    return path.join(temporaryRoot, relative);
  return value;
}
for (const method of ['readFile', 'writeFile', 'mkdir', 'lstat', 'stat', 'unlink', 'rm', 'readdir']) {
  const original = fs.promises[method];
  fs.promises[method] = (location, ...args) => original.call(fs.promises, isolatedPath(location), ...args);
}
const rename = fs.promises.rename;
fs.promises.rename = (from, to) => rename.call(fs.promises, isolatedPath(from), isolatedPath(to));
const readFileSync = fs.readFileSync;
fs.readFileSync = (location, ...args) => readFileSync(isolatedPath(location), ...args);
process.once('exit', () => {
  const absolute = path.resolve(temporaryRoot);
  if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('workflow-backend-ci-'))
    throw new Error('Unexpected backend CI cleanup path.');
  fs.rmSync(absolute, { recursive: true, force: true });
});

require('ts-node').register({ project: process.env.TS_NODE_PROJECT, transpileOnly: true });
