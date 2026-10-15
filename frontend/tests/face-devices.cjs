'use strict';
const path = require('node:path'), Module = require('node:module');
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../tsconfig.json');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'Node', jsx: 'react-jsx' });
require('../../backend/node_modules/ts-node/register/transpile-only');
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'lucide-react') return path.resolve(__dirname, '../node_modules/lucide-react/dist/esm/lucide-react.js');
  return original.call(this, request.startsWith('@/') ? path.resolve(__dirname, '../src', request.slice(2)) : request, ...args);
};
require('../src/lib/face-devices.test.tsx');
