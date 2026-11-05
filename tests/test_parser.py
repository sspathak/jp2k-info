"""
Unit Tests for JPEG 2000 Parser and CLI Suite.
"""

import os
import unittest
from jp2k_info.parser import JPEG2000Parser
from jp2k_info.cli import generate_markdown_report

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = os.path.join(BASE_DIR, "samples")


class TestJPEG2000Parser(unittest.TestCase):

    def test_lossless_5_3(self):
        path = os.path.join(SAMPLES_DIR, "lossless_5_3.jp2")
        with open(path, "rb") as f:
            data = f.read()
        p = JPEG2000Parser(data, "lossless_5_3.jp2")
        res = p.parse()

        self.assertEqual(res['format'], 'JP2 Container')
        s = res['summary']
        self.assertTrue(s['is_lossless'])
        self.assertTrue(s['is_reversible'])
        self.assertEqual(s['width'], 256)
        self.assertEqual(s['height'], 256)
        self.assertEqual(s['num_components'], 3)
        self.assertEqual(s['progression_order'], 'LRCP')
        self.assertEqual(s['decomposition_levels'], 5)
        self.assertEqual(s['tile_grid']['total_tiles'], 1)
        self.assertTrue(len(res['boxes']) >= 4)
        self.assertTrue(len(res['codestream_markers']) >= 5)

    def test_lossy_9_7_multitile(self):
        path = os.path.join(SAMPLES_DIR, "lossy_9_7_multitile.jp2")
        with open(path, "rb") as f:
            data = f.read()
        p = JPEG2000Parser(data, "lossy_9_7_multitile.jp2")
        res = p.parse()

        s = res['summary']
        self.assertFalse(s['is_lossless'])
        self.assertFalse(s['is_reversible'])
        self.assertEqual(s['progression_order'], 'RLCP')
        self.assertEqual(s['tile_grid']['total_tiles'], 4)
        self.assertEqual(s['tile_grid']['tiles_x'], 2)
        self.assertEqual(s['tile_grid']['tiles_y'], 2)
        self.assertEqual(len(res['tiles']), 4)

    def test_multilayer_progressive(self):
        path = os.path.join(SAMPLES_DIR, "multilayer_progressive.jp2")
        with open(path, "rb") as f:
            data = f.read()
        p = JPEG2000Parser(data, "multilayer_progressive.jp2")
        res = p.parse()

        s = res['summary']
        self.assertEqual(s['num_layers'], 4)
        self.assertEqual(s['progression_order'], 'RPCL')

    def test_error_resilient(self):
        path = os.path.join(SAMPLES_DIR, "error_resilient.jp2")
        with open(path, "rb") as f:
            data = f.read()
        p = JPEG2000Parser(data, "error_resilient.jp2")
        res = p.parse()

        s = res['summary']
        self.assertTrue(s['has_sop'])
        self.assertTrue(s['has_eph'])
        modes = s['codeblock_modes']
        self.assertTrue(all(m['enabled'] for m in modes))

    def test_raw_codestream(self):
        path = os.path.join(SAMPLES_DIR, "raw_codestream.j2k")
        with open(path, "rb") as f:
            data = f.read()
        p = JPEG2000Parser(data, "raw_codestream.j2k")
        res = p.parse()

        self.assertEqual(res['format'], 'Raw J2K Codestream')
        self.assertEqual(len(res['boxes']), 0)
        self.assertTrue(len(res['codestream_markers']) >= 5)

    def test_xml_and_comments(self):
        path = os.path.join(SAMPLES_DIR, "xml_and_metadata.jp2")
        with open(path, "rb") as f:
            data = f.read()
        p = JPEG2000Parser(data, "xml_and_metadata.jp2")
        res = p.parse()

        s = res['summary']
        self.assertIsNotNone(s['xml_metadata'])
        self.assertIn("JPEG 2000 Comprehensive Metadata Test", s['xml_metadata'])

    def test_markdown_report_generation(self):
        path = os.path.join(SAMPLES_DIR, "lossless_5_3.jp2")
        with open(path, "rb") as f:
            data = f.read()
        p = JPEG2000Parser(data, "lossless_5_3.jp2")
        res = p.parse()
        md = generate_markdown_report(res)
        self.assertIn("# JPEG 2000 Encoding Analysis", md)
        self.assertIn("Mathematically Lossless", md)

    def test_url_cli_support(self):
        import subprocess, sys
        # Test CLI help and command options
        result = subprocess.run([sys.executable, "-m", "jp2k_info.cli", "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("JPEG 2000", result.stdout)


if __name__ == "__main__":
    unittest.main()
