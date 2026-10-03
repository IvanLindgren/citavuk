import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from verify_build_settings import contains_value, verify


class BuildSettingsTest(unittest.TestCase):
    def test_encodings(self):
        for encoding in ("utf-8", "utf-16le", "utf-16be"):
            self.assertTrue(contains_value(b"prefix" + "test-parameter".encode(encoding), "test-parameter"))
        self.assertFalse(contains_value(b"missing", "test-parameter"))

    def test_actual_framework_binary(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"TEST_BUILD_VALUE": "example"}):
            root = Path(directory)
            binary = root / "App.framework/Versions/A/App"
            binary.parent.mkdir(parents=True)
            binary.write_bytes(b"aot" + "example".encode("utf-16le"))
            verify(root, ["TEST_BUILD_VALUE"])

    def test_config_does_not_count(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"TEST_BUILD_VALUE": "example"}):
            root = Path(directory)
            (root / "Generated.xcconfig").write_text("TEST_BUILD_VALUE=example")
            with self.assertRaises(ValueError):
                verify(root, ["TEST_BUILD_VALUE"])

    def test_missing_configuration(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"TEST_BUILD_VALUE": ""}):
            with self.assertRaises(ValueError):
                verify(Path(directory), ["TEST_BUILD_VALUE"])


if __name__ == "__main__":
    unittest.main()
