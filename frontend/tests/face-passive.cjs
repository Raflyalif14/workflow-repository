'use strict';
const path = require('node:path'), Module = require('node:module');
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../tsconfig.json');
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'Node', jsx: 'react-jsx' });
require('../../backend/node_modules/ts-node/register/transpile-only');
const original = Module._resolveFilename;
Module._resolveFilename = function(request,...args) { return original.call(this,request.startsWith('@/') ? path.resolve(__dirname,'../src',request.slice(2)) : request,...args); };
(async()=> {
  await require('../src/lib/face-passive-burst.test').testBurst();
  await require('../src/lib/face-passive-ui.test').testPassiveUi();
})().catch(error=>{console.error(error);process.exitCode=1;});
