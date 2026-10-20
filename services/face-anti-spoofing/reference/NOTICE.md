# Source attribution

Copyright 2020 Minivision. Author recorded in source: zhuying.
Silent-Face-Anti-Spoofing, Apache License 2.0 (full copy in `LICENSE`).

Pinned commit: `b6d5f04ad78778917853b25c778acef6d5626d15`.
Source: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing

`generate_patches.py` is a reference copy of `src/generate_patches.py`,
unmodified except normalization to UTF-8/LF. `sources.json` records source
URLs and SHA-256 of that representation. Used only by preprocessing tests;
it imports OpenCV/NumPy and neither loads weights nor executes a model.

`../offline_pad.py` adapts the crop geometry with explicit input guards,
fixed 80x80 output and NumPy tensor preparation. These changes are project
code, not behavior supplied by the upstream detector. Its aggregation
utility follows the two-model rule from upstream `test.py`; fixtures are
explicitly synthetic and never used to replace an unavailable model.

This code attribution does not establish permission for PAD weights,
RetinaFace detector weights, or their training data. No such assets are
included. Their terms remain unresolved as documented in Stage 9A/9B.
