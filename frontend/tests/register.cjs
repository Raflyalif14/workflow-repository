'use strict';
const path = require('node:path'), fs = require('node:fs'), Module = require('node:module');
const frontend = path.resolve(__dirname, '..');
require('ts-node').register({ project: path.join(frontend, 'tsconfig.json'), transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node', jsx: 'react-jsx' } });
require('tsconfig-paths').register({ baseUrl: path.join(frontend, 'src'), paths: { '@/*': ['*'] } });
// The installed icon package may declare type:module while its require export
// points at a .js CommonJS bundle. Use its ESM entry only for that package layout.
const iconRoot = path.join(frontend, 'node_modules/lucide-react');
const icons = JSON.parse(fs.readFileSync(path.join(iconRoot, 'package.json'), 'utf8'));
if (icons.type === 'module' && icons.exports?.['.']?.require?.endsWith('.js')) {
  const original = Module._resolveFilename;
  Module._resolveFilename = function(request, ...args) {
    return original.call(this, request === 'lucide-react' ? path.join(iconRoot, 'dist/esm/lucide-react.js') : request, ...args);
  };
}
