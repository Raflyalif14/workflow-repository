'use strict';

// Exact paths only: new tests join CI unless explicitly classified here.
// These are not counted as passing CI tests.
module.exports = {
  'src/routes/face-experiment.test.ts': 'Requires local Python, OpenCV and downloaded face models.',
  'src/routes/face-experiment-provenance.test.ts': 'Requires the pinned local Python/model runtime.',
  'src/routes/face-pad.test.ts': 'Requires the local Python PAD runtime and weights.',
  'src/routes/face-pad-analysis.test.ts': 'Requires the local Python PAD analysis runtime and weights.',
  'src/routes/face-pad-candidate.test.ts': 'Requires the local Python PAD candidate runtime and weights.',
  'src/utils/face-pad-candidate.test.ts': 'Runs actual local ONNX models through Python.',
  'src/utils/run-face-pad-analysis.test.ts': 'Requires multiple pinned local Python runtimes.',
  'src/utils/run-face-passive-inference.test.ts': 'Runs the local Python face models.',
};
