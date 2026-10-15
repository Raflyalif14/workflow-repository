# Licensed real-inference fixture

`astronaut.png` is the unmodified scikit-image v0.19.3 sample downloaded from the
pinned source in `manifest.json`. scikit-image's
[official data documentation](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut)
attributes the image to NASA's Great Images database and states that it has no
known copyright restrictions and is released into the public domain.
Original image source: https://flic.kr/p/r9qvLn . No NASA endorsement is implied.

This static, public test photo is not a user camera capture. It is stored outside
`public` and never bundled into the face-verification page. The browser harness
draws a crop into a transient synthetic video, duplicates it for two-face testing,
or paints a blank frame for zero faces. All returned boxes/scores in the browser
test come from actual BlazeFace inference. API/session fixtures are synthetic.
The file's SHA-256 and size are recorded separately in `manifest.json`.
