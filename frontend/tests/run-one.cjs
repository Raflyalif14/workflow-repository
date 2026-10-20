'use strict';
require('./register.cjs');
const path = require('node:path');
(async () => {
  const exported = require(path.resolve(process.argv[2]));
  // The passive camera tests expose async entry points instead of auto-running.
  for (const [name, run] of Object.entries(exported)) {
    if (/^test[A-Z]/.test(name) && typeof run === 'function') await run();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
