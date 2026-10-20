'use strict';
require('./register.cjs');
(async()=> {
  await require('../src/lib/face-passive-burst.test').testBurst();
  await require('../src/lib/face-passive-ui.test').testPassiveUi();
})().catch(error=>{console.error(error);process.exitCode=1;});
