# JPEG 2000 Deep Inspector & Encoding Analyzer (ISO/IEC 15444-1)

A complete toolchain and interactive web application designed to open, inspect, and analyze the encoding parameters of **JPEG 2000** files (`.jp2`, `.j2k`, `.jpc`, `.jpx`).

---

## 🌟 Highlights & Key Capabilities

- **Dual Mode:** Use the interactive **Web Application** or the fast, colorized **Python CLI** tool (`./jp2k-info`).
- **Comprehensive Format Support:** Handles both standard **JP2 Box Containers** (`jP  `, `ftyp`, `jp2h`, `ihdr`, `bpcc`, `colr`, `pclr`, `cmap`, `cdef`, `res `, `resc`, `resd`, `jp2c`, `xml `, `uuid`, `cprt`) and standalone **Raw J2K Codestreams** (`SOC`, `SIZ`, `COD`, `COC`, `QCD`, `QCC`, `RGN`, `POC`, `TLM`, `PLM`, `PLT`, `PPM`, `PPT`, `SOP`, `EPH`, `CRG`, `COM`, `SOT`, `SOD`, `EOC`).
- **Interactive 2D DWT Mallat Wavelet Explorer:** Interactive visual map of the discrete wavelet octave decomposition tree ($LL_{N_L}, HL_i, LH_i, HH_i$). Hover or click any subband to inspect its orientation, frequency band, exact pixel dimensions, and calculated quantizer step size $\Delta_b$ / exponent $\epsilon_b$.
- **Interactive Tile Grid Visualizer:** Visualizes spatial tile partitions ($X_{Tsiz} \times Y_{Tsiz}$) against the reference grid canvas ($X_{siz} \times Y_{siz}$), with tile bounding boxes, SOT offsets, and bitstream payload byte lengths.
- **Code-block & Error Resilience Matrix:** Inspects code-block dimensions ($64 \times 64$, etc.), SOP (Start of Packet), EPH (End of Packet Header), and all 6 SPcod mode switch flags:
  1. *Selective arithmetic coding bypass* (Lazy mode)
  2. *Reset context probabilities on coding pass boundaries*
  3. *Termination on each coding pass*
  4. *Vertically causal context*
  5. *Predictable termination*
  6. *Segmentation symbols* (0x0A)
- **Quantization & Dynamic Range Matrix:** Guard bits ($G$), quantization styles (Reversible 5/3 No-Quant, Scalar Derived, Scalar Expounded), step size formulas, and per-subband dynamic range.
- **Image & Channel Inspector:** Decoded raster preview with channel separation toggles (Composite RGB, Red only, Green only, Blue only, Luminance $Y$) and tile outline overlays.
- **Hierarchical Bitstream & Box Tree:** Collapsible tree view showing the hierarchy of every box and codestream marker segment with offsets and lengths.
- **Synchronized Raw Hex Viewer:** Live hex dump with pagination and automatic byte highlighting matching the selected box or marker segment.
- **Metadata & Comment Extraction:** Latin-1/UTF-8 `COM` encoder comments, embedded Dublin Core / XMP `xml ` boxes, and `uuid` tags.
- **Built-in Sample Showcase:** 8 pre-encoded JPEG 2000 datasets illustrating lossless 5/3, lossy 9/7, $2 \times 2$ tiling, 4-layer progressive quality, error-resilient bitstreams, 12-bit grayscale HDR, chroma subsampling, and raw `.j2k` codestreams.

---

## 🚀 Quick Start with Pixi

The project uses [Pixi](https://pixi.sh) to reproducibly manage all Python dependencies and OpenJPEG system binaries across Linux, macOS, and Windows.

```bash
# Install environment (fetches Python & OpenJPEG tools automatically)
pixi install

# Run the unit test suite
pixi run test

# Launch the interactive web application
pixi run serve

# Or run terminal CLI commands
pixi run dump samples/lossy_9_7_multitile.jp2
pixi run json samples/lossless_5_3.jp2
pixi run markdown samples/multilayer_progressive.jp2
```

Alternatively, you can run `./jp2k-info` directly using your local Python environment:

```bash
./jp2k-info serve
./jp2k-info dump samples/lossless_5_3.jp2
```

---

## 📚 JPEG 2000 Architecture Overview

| Parameter | Standard | Description |
|:---|:---|:---|
| **Wavelet Filter** | Le Gall 5/3 (Reversible) | Integer-to-integer wavelet filter providing **exact mathematical lossless** reconstruction. |
| | Daubechies CDF 9/7 (Irreversible) | Floating-point filter providing state-of-the-art **lossy compression efficiency** without blocking artifacts. |
| **Color Transform** | RCT (Reversible Color Transform) | Integer approximation of $YUV$ used with 5/3 filter for lossless RGB images. |
| | ICT (Irreversible Color Transform) | Floating-point $YC_bC_r$ transform used with 9/7 filter for lossy compression. |
| **Progression Orders** | `LRCP` | Layer $\to$ Resolution $\to$ Component $\to$ Position (Progressive by SNR/quality). |
| | `RLCP` | Resolution $\to$ Layer $\to$ Component $\to$ Position (Progressive by thumbnail/resolution). |
| | `RPCL` | Resolution $\to$ Position $\to$ Component $\to$ Layer (Progressive by resolution and spatial tile). |
| | `PCRL` | Position $\to$ Component $\to$ Resolution $\to$ Layer (Progressive by spatial panning). |
| | `CPRL` | Component $\to$ Position $\to$ Resolution $\to$ Layer (Progressive by color channel). |
| **Quantization** | $\Delta_b = 2^{R_b - \epsilon_b} (1 + \mu_b / 2048)$ | Explicit dead-zone scalar quantization per subband ($\epsilon_b$ exponent, $\mu_b$ 11-bit mantissa). |

---

## 📁 Project Structure

```
jp2k-info/
├── jp2k-info                  # Executable CLI wrapper
├── jp2k_info/                 # Python backend package
│   ├── __init__.py
│   ├── parser.py              # Pure-Python binary parser for boxes and codestreams
│   ├── cli.py                 # ANSI terminal formatter and argument parser
│   └── server.py              # HTTP server and REST endpoints (/api/upload, /api/samples)
├── web/                       # Modern web application frontend
│   ├── index.html             # Main dashboard layout
│   ├── style.css              # Dark/light theme styles
│   ├── app.js                 # UI coordination, tab controller, channel filters
│   ├── parser.js              # Pure JavaScript client-side binary parser (runs offline!)
│   ├── dwt_visualizer.js      # Interactive 2D Mallat Wavelet tree renderer
│   ├── tile_visualizer.js     # Interactive spatial tile grid renderer
│   └── samples -> ../samples  # Symlinked sample files
├── samples/                   # Pre-encoded test datasets (.jp2, .j2k, .png)
│   ├── lossless_5_3.jp2       # Reversible 5/3, RCT, 1 tile
│   ├── lossy_9_7_multitile.jp2# Irreversible 9/7, 4 tiles (2x2), RLCP
│   ├── multilayer_progressive.jp2 # 4 quality layers, RPCL progression
│   ├── error_resilient.jp2    # All 6 SPcod modes active + SOP/EPH
│   ├── grayscale_12bit.jp2    # 12-bit monochrome medical/satellite profile
│   ├── subsampled_420.jp2     # 2x2 subsampling
│   ├── raw_codestream.j2k     # Headerless J2K codestream
│   └── xml_and_metadata.jp2   # XML Dublin Core + Copyright boxes
└── tests/
    └── test_parser.py         # Unit tests suite
```

---

## 🧪 Testing

Run unit tests across the sample suite:

```bash
python3 -m unittest discover tests
```
