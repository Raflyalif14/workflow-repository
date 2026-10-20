import io
import json
import hashlib
import multiprocessing as mp
import time
import unittest
from pathlib import Path
from PIL import Image
from inference import compare_images, decode_image, InputError, MAX_FILE, ROOT
from server import run_bounded

FIXTURES = Path(__file__).parent / "fixtures"
ASTRONAUT = ROOT.parent.parent / "frontend/tests/fixtures/face-detection/astronaut.png"

def sleeping_child(payload, connection):
    time.sleep(30)

class ModelTests(unittest.TestCase):
    def test_real_pairs(self):
        for item in json.loads((FIXTURES / "manifest.json").read_text()):
            self.assertEqual(hashlib.sha256((FIXTURES / item["file"]).read_bytes()).hexdigest(), item["sha256"])
        a = (FIXTURES / "same-person-a.jpg").read_bytes()
        b = (FIXTURES / "same-person-b.jpg").read_bytes()
        c = ASTRONAUT.read_bytes()
        self.assertNotEqual(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())
        identical = compare_images(a, a)
        same = compare_images(a, b)
        different = compare_images(a, c)
        self.assertAlmostEqual(identical["score"], 1, places=5) # Sanity only, not recognition evaluation.
        self.assertGreater(same["score"], different["score"]) # Fixture-specific ordering, no match threshold.
        self.assertEqual(set(same), {"model", "metric", "score", "provenance"})
        results = {"model": same["model"], "identical_sanity": identical["score"], "distinct_same_person": same["score"], "different_people": different["score"], "limits": "Three public-photo examples, not accuracy, identity or liveness validation."}
        report = ROOT.parent.parent / "docs/face-verification-stage4"
        report.mkdir(parents=True, exist_ok=True)
        (report / "model-results.json").write_text(json.dumps(results, indent=2) + "\n")
    def test_image_validation(self):
        buf = io.BytesIO(); Image.new("RGB", (256, 256)).save(buf, "PNG")
        cases = [(buf.getvalue(), "FACE_NONE"), ((FIXTURES / "group-source.jpg").read_bytes(), "FACE_MULTIPLE"), (b"bad bytes", "FACE_IMAGE_INVALID"), (b"x" * (MAX_FILE + 1), "FACE_INPUT_LIMIT")]
        for value, code in cases:
            with self.subTest(code=code), self.assertRaises(InputError) as context:
                compare_images(value, ASTRONAUT.read_bytes())
            self.assertEqual(context.exception.code, code)
        for size in [(5000, 128), (4096, 4096), (64, 64)]:
            buf = io.BytesIO(); Image.new("RGB", size).save(buf, "PNG")
            with self.assertRaises(InputError): decode_image(buf.getvalue(), "A")
    def test_hard_timeout_and_cancel(self):
        before = {child.pid for child in mp.active_children()}
        start = time.monotonic()
        self.assertEqual(run_bounded(b"", timeout=0.2, target=sleeping_child)["code"], "FACE_TIMEOUT")
        self.assertLess(time.monotonic() - start, 5)
        self.assertEqual(run_bounded(b"", target=sleeping_child, cancelled=lambda: True)["code"], "FACE_TIMEOUT")
        self.assertEqual({child.pid for child in mp.active_children()}, before)

if __name__ == "__main__": unittest.main()
