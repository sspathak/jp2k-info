"""
Lightweight HTTP Server and REST API for JPEG 2000 Inspector Webapp.
"""

import os
import sys
import json
import mimetypes
import subprocess
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from .parser import JPEG2000Parser
from .cli import generate_markdown_report

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")
SAMPLES_DIR = os.path.join(BASE_DIR, "samples")
UPLOAD_DIR = os.path.join(BASE_DIR, "temp_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

SAMPLE_CATALOG = [
    {
        "id": "lossless_5_3",
        "filename": "lossless_5_3.jp2",
        "title": "Lossless 5/3 Reversible (RGB)",
        "tag": "Lossless",
        "description": "True mathematically lossless compression using Le Gall 5/3 integer wavelet and Reversible Color Transform (RCT).",
        "highlights": ["Integer 5/3 DWT", "No Quantization", "RCT Color", "Single Tile"]
    },
    {
        "id": "lossy_9_7_multitile",
        "filename": "lossy_9_7_multitile.jp2",
        "title": "Lossy 9/7 Irreversible (2×2 Tiled)",
        "tag": "Tiled",
        "description": "High-efficiency lossy compression partitioned into 4 spatial tiles (128×128) using Daubechies 9/7 floating-point DWT and RLCP progression.",
        "highlights": ["CDF 9/7 DWT", "2x2 Tiles (4 Total)", "RLCP Progression", "Scalar Expounded Quantization"]
    },
    {
        "id": "multilayer_progressive",
        "filename": "multilayer_progressive.jp2",
        "title": "Multilayer Progressive (4 Layers)",
        "tag": "Progressive",
        "description": "Progressive quality transmission with 4 distinct SNR layers and RPCL progression with custom precinct partitioning.",
        "highlights": ["4 Quality Layers", "RPCL Progression", "Custom Precincts", "Fast Streaming"]
    },
    {
        "id": "error_resilient",
        "filename": "error_resilient.jp2",
        "title": "Error-Resilient & Bypass Bitstream",
        "tag": "Resilience",
        "description": "Bitstream engineered for transmission over noisy channels with all 6 code-block modes active, plus SOP and EPH markers.",
        "highlights": ["SOP & EPH Markers", "Arithmetic Bypass Mode", "Segmark Symbols", "Predictable Term"]
    },
    {
        "id": "grayscale_12bit",
        "filename": "grayscale_12bit.jp2",
        "title": "12-bit High Dynamic Range Grayscale",
        "tag": "12-bit HDR",
        "description": "Medical & satellite imaging profile featuring 12-bit precision per sample (4096 shades of grey) and Greyscale colorspace.",
        "highlights": ["12-bit Depth", "Single Component", "Monochrome CS", "High Dynamic Range"]
    },
    {
        "id": "subsampled_420",
        "filename": "subsampled_420.jp2",
        "title": "Chroma Subsampled (2×2 Subsampling)",
        "tag": "Subsampled",
        "description": "Demonstrates independent component subsampling factors (XR=2, YR=2) reducing chroma data volume.",
        "highlights": ["Subsampling 2x2", "Variable Grid Dimensions", "ICT Transform"]
    },
    {
        "id": "raw_codestream",
        "filename": "raw_codestream.j2k",
        "title": "Raw J2K Codestream (No Box Wrapper)",
        "tag": "Raw J2K",
        "description": "Direct JPEG 2000 codestream starting with SOC marker (0xFF4F) without JP2 box container encapsulation.",
        "highlights": ["Zero Box Overhead", "SOC Delimiter Start", "Pure Codestream"]
    },
    {
        "id": "xml_and_metadata",
        "filename": "xml_and_metadata.jp2",
        "title": "Extended XML & Copyright Metadata",
        "tag": "Metadata",
        "description": "Includes embedded XML Dublin Core / TIFF metadata box and Copyright (cprt) box alongside image codestream.",
        "highlights": ["XML Box (Dublin Core)", "Copyright (cprt) Box", "JP2 Packaging"]
    },
    {
        "id": "metadata_comment",
        "filename": "metadata_comment.jp2",
        "title": "Encoder Comments Marker (COM)",
        "tag": "Comments",
        "description": "Contains codestream COM marker storing custom encoder signature and parameters.",
        "highlights": ["COM Marker Text", "Latin-1/UTF-8 Registration", "Encoder Attribution"]
    }
]


def ensure_preview_png(input_path: str) -> str:
    """Decompresses a JPEG 2000 file to PNG using opj_decompress if available."""
    png_path = input_path.rsplit('.', 1)[0] + '.png'
    if os.path.exists(png_path):
        return png_path

    try:
        subprocess.run(['opj_decompress', '-i', input_path, '-o', png_path],
                       check=True, capture_output=True, timeout=10)
        return png_path
    except Exception:
        return ""


class JP2Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Keep server output clean
        sys.stderr.write(f"[HTTP] {self.address_string()} - {format % args}\n")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path in ("/", "/index.html"):
            self.serve_file(os.path.join(WEB_DIR, "index.html"), "text/html; charset=utf-8")
        elif path.startswith("/web/"):
            rel_path = path[5:]
            full_path = os.path.join(WEB_DIR, rel_path)
            self.serve_file(full_path)
        elif path.startswith("/samples/"):
            rel_path = path[9:]
            full_path = os.path.join(SAMPLES_DIR, rel_path)
            self.serve_file(full_path)
        elif path == "/api/samples":
            self.send_json(SAMPLE_CATALOG)
        elif path.startswith("/api/sample/"):
            sample_id = path[len("/api/sample/"):]
            sample_entry = next((s for s in SAMPLE_CATALOG if s['id'] == sample_id or s['filename'] == sample_id), None)
            if not sample_entry:
                self.send_error(404, "Sample not found")
                return
            sample_file = os.path.join(SAMPLES_DIR, sample_entry['filename'])
            self.serve_file(sample_file, "application/octet-stream")
        elif path.startswith("/api/sample_meta/"):
            sample_id = path[len("/api/sample_meta/"):]
            sample_entry = next((s for s in SAMPLE_CATALOG if s['id'] == sample_id or s['filename'] == sample_id), None)
            if not sample_entry:
                self.send_error(404, "Sample not found")
                return
            sample_file = os.path.join(SAMPLES_DIR, sample_entry['filename'])
            with open(sample_file, "rb") as f:
                data = f.read()
            p = JPEG2000Parser(data, sample_entry['filename'])
            meta = p.parse()
            meta['catalog_info'] = sample_entry
            meta['preview_url'] = f"/api/preview/{sample_entry['filename']}"
            self.send_json(meta)
        elif path.startswith("/api/preview/"):
            filename = path[len("/api/preview/"):]
            # Look in samples or uploads
            for check_dir in [SAMPLES_DIR, UPLOAD_DIR]:
                base = os.path.join(check_dir, filename)
                png_path = base.rsplit('.', 1)[0] + '.png'
                if os.path.exists(png_path):
                    self.serve_file(png_path, "image/png")
                    return
                # If jp2 exists, try to decompress
                if os.path.exists(base):
                    decomp = ensure_preview_png(base)
                    if decomp and os.path.exists(decomp):
                        self.serve_file(decomp, "image/png")
                        return
            self.send_error(404, "Preview image not found")
        else:
            # Fallback to web dir
            full_path = os.path.join(WEB_DIR, path.lstrip("/"))
            if os.path.exists(full_path) and os.path.isfile(full_path):
                self.serve_file(full_path)
            else:
                self.send_error(404, "File not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/upload":
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0:
                self.send_json({'error': 'No file uploaded'}, status=400)
                return

            # Check content-type for raw binary vs multipart
            content_type = self.headers.get('Content-Type', '')
            raw_bytes = self.rfile.read(content_length)

            filename = self.headers.get('X-Filename', 'uploaded.jp2')
            safe_name = os.path.basename(filename)
            save_path = os.path.join(UPLOAD_DIR, safe_name)

            with open(save_path, "wb") as f:
                f.write(raw_bytes)

            try:
                parser = JPEG2000Parser(raw_bytes, safe_name)
                result = parser.parse()
                preview_png = ensure_preview_png(save_path)
                if preview_png and os.path.exists(preview_png):
                    result['preview_url'] = f"/api/preview/{os.path.basename(safe_name)}"
                else:
                    result['preview_url'] = None
                self.send_json(result)
            except Exception as e:
                self.send_json({'error': f'Failed to parse JPEG 2000: {str(e)}'}, status=400)
        else:
            self.send_error(404, "Unknown endpoint")

    def serve_file(self, file_path: str, content_type: Optional[str] = None):
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_error(404, "File not found")
            return

        if not content_type:
            content_type, _ = mimetypes.guess_type(file_path)
            if not content_type:
                content_type = "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, indent=2).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


def start_server(port: int = 8000, open_browser: bool = True):
    server = None
    actual_port = port
    for attempt in range(15):
        try:
            actual_port = port + attempt
            server_address = ('127.0.0.1', actual_port)
            server = HTTPServer(server_address, JP2Handler)
            break
        except OSError as e:
            if attempt == 14:
                raise

    url = f"http://localhost:{actual_port}"

    print(f"\n🚀 JPEG 2000 Inspector Web App running at:")
    print(f"   👉 {url}\n")
    print("Press Ctrl+C to stop the server.\n")

    if open_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()
