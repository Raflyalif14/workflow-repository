# Stage 9E architecture reference

Copyright 2020 Minivision; source author zhuying.
Apache License 2.0, full copy retained in `LICENSE`.

`MiniFASNet.py` is the original shared architecture module from
`src/model_lib/MiniFASNet.py`, commit
`b6d5f04ad78778917853b25c778acef6d5626d15`. Only UTF-8/LF normalization was
applied; source URL and representation SHA-256 are in `MiniFASNet.sources.json`.
Layer definitions, factory defaults, state keys and forward methods are unchanged.
The file includes shared helper classes and additional factories; Stage 9E
instantiates only MiniFASNetV2 and MiniFASNetV1SE.

No training module, predictor, detector/configuration or pretrained checkpoint
is included. Test code supplies explicit 80x80-compatible constructor arguments,
random initialization seeds and CPU synthetic inputs. It calls softmax with
`dim=1`, and loads only temporary synthetic state dictionaries with
`weights_only=True` and `strict=True`. These are test policies, not changes to
the upstream architecture. No compatibility fallback is provided to the runner.

This attribution covers the code reference, not permission for pretrained
weights/detector assets. Stage 9C's asset questions remain unresolved.
