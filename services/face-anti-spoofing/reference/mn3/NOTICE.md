# anti-spoof-mn3 attribution and source notices

anti-spoof-mn3 model from Open Model Zoo (OpenVINO Toolkit).
Original model: Prokofev Kirill, kprokofi/light-weight-face-anti-spoofing.
Original repository LICENSE: Copyright (c) 2020 Prokofev Kirill, MIT.

`LICENSE` preserves the original repository's MIT text. The OMZ model README
states MIT and the Intel moderator answer explicitly addresses ONNX weights.
However, the OMZ `model.yml` license URL points to a different repository's
Apache 2.0 text. `MODEL-YML-APACHE-LICENSE` retains that text as well; this
discrepancy is documented, not silently relabeled as MIT. Both full notices
are also retained beside the unmodified model asset outside Git.

OMZ commit: `eda1863a6d60b09551df9d039cff2377d6ddd4d6`.
Original repository commit: `82a2c26bacff5462c6f9320c34ae0363ccbed497`.
License-target commit: `84459ca1c32967c145f5feb27d2ad84aa64960e8`.
Pinned URLs and raw source checksums are in `sources.json`.

`../../mn3_offline.py` is a project adapter implementing the documented
original-ONNX numeric contract with explicit guards, verified model bytes,
OpenCV CPU inference and a synthetic-only smoke command. No upstream demo
code was copied or executed, no model conversion/training was performed,
and no weights are included in this repository. Crop observations describe
separate upstream examples; detector/camera parity is not established.
