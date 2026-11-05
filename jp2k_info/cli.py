"""
Command Line Interface for JPEG 2000 Encoding Metadata Analyzer.
"""

import sys
import os
import json
import argparse
from typing import Dict, Any
from .parser import JPEG2000Parser

# Terminal color codes
C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_CYAN = "\033[96m"
C_GREEN = "\033[92m"
C_YELLOW = "\033[93m"
C_BLUE = "\033[94m"
C_MAGENTA = "\033[95m"
C_RED = "\033[91m"
C_DIM = "\033[2m"


def format_bytes(num_bytes: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB']:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:3.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} TB"


def print_banner():
    banner = f"""
{C_CYAN}{C_BOLD}╔═════════════════════════════════════════════════════════════════════════╗
║   JPEG 2000 Deep Inspector & Encoding Analyzer (ISO/IEC 15444-1)        ║
╚═════════════════════════════════════════════════════════════════════════╝{C_RESET}
"""
    print(banner)


def dump_terminal(res: Dict[str, Any]):
    s = res['summary']
    print_banner()

    print(f"{C_BOLD}File Information:{C_RESET}")
    print(f"  • {C_CYAN}File Path:{C_RESET}       {res['filename']}")
    print(f"  • {C_CYAN}File Size:{C_RESET}       {format_bytes(res['file_size'])} ({res['file_size']:,} bytes)")
    print(f"  • {C_CYAN}Container:{C_RESET}       {res['format']}")
    print()

    print(f"{C_BOLD}Image Geometry & Components:{C_RESET}")
    print(f"  • {C_GREEN}Dimensions:{C_RESET}      {s['dimensions']} ({s['megapixels']} MP)")
    print(f"  • {C_GREEN}Color Model:{C_RESET}     {s['colorspace']}")
    print(f"  • {C_GREEN}Bit Depth:{C_RESET}       {s['bit_depth']}-bit ({'Signed' if s['is_signed'] else 'Unsigned'})")
    print(f"  • {C_GREEN}Components:{C_RESET}      {s['num_components']}")
    for c in s.get('components_detail', []):
        print(f"      - Comp #{c['index']}: {c['width']}×{c['height']}, {c['bit_depth']}-bit, subsample ({c['subsampling_x']}x, {c['subsampling_y']}y)")
    print()

    print(f"{C_BOLD}Encoding & Compression Architecture:{C_RESET}")
    mode_color = C_GREEN if s['is_lossless'] else C_YELLOW
    print(f"  • {C_MAGENTA}Compression:{C_RESET}     {mode_color}{s['compression_mode']}{C_RESET}")
    print(f"  • {C_MAGENTA}Wavelet Filter:{C_RESET}  {s['wavelet_filter']}")
    print(f"  • {C_MAGENTA}Color Transform:{C_RESET} {s['multiple_component_transform']}")
    print(f"  • {C_MAGENTA}Progression:{C_RESET}     {C_BOLD}{s['progression_order']}{C_RESET} ({s['progression_description']})")
    print(f"  • {C_MAGENTA}Quality Layers:{C_RESET}  {s['num_layers']}")
    print(f"  • {C_MAGENTA}Decomposition:{C_RESET}   {s['decomposition_levels']} levels ({s['resolution_levels_count']} resolution scales)")
    print(f"  • {C_MAGENTA}Bitrate:{C_RESET}          {s['bits_per_pixel']} bits/pixel (bpp)")
    print(f"  • {C_MAGENTA}Ratio:{C_RESET}            {s['compression_ratio']} (Uncompressed: {format_bytes(s['uncompressed_size_bytes'])})")
    print()

    print(f"{C_BOLD}Code-block & Error Resilience Settings:{C_RESET}")
    print(f"  • {C_YELLOW}Code-block Size:{C_RESET} {s['codeblock_dimensions']}")
    print(f"  • {C_YELLOW}SOP Markers:{C_RESET}     {'Enabled (Start of Packet)' if s['has_sop'] else 'Disabled'}")
    print(f"  • {C_YELLOW}EPH Markers:{C_RESET}     {'Enabled (End of Packet Header)' if s['has_eph'] else 'Disabled'}")
    print(f"  • {C_YELLOW}Mode Switches:{C_RESET}")
    for mode in s.get('codeblock_modes', []):
        status = f"{C_GREEN}[ON]{C_RESET}" if mode['enabled'] else f"{C_DIM}[off]{C_RESET}"
        print(f"      {status} {mode['mask']} {mode['description']}")
    print()

    print(f"{C_BOLD}Quantization Parameters:{C_RESET}")
    print(f"  • {C_BLUE}Quant Style:{C_RESET}     {s['quantization_style']}")
    print(f"  • {C_BLUE}Guard Bits:{C_RESET}      {s['guard_bits']} bits")
    dwt_tree = s.get('dwt_subband_tree', [])
    if dwt_tree:
        print(f"  • {C_BLUE}Wavelet Subbands ({len(dwt_tree)} total):{C_RESET}")
        for sb in dwt_tree[:6]:
            print(f"      - {C_BOLD}{sb['name']:<6}{C_RESET} ({sb['width']}×{sb['height']:<4}) | {sb['orientation'][:30]:<30} | Step: {sb['step_size']}")
        if len(dwt_tree) > 6:
            print(f"      ... and {len(dwt_tree) - 6} more subbands")
    print()

    print(f"{C_BOLD}Tile Partitioning Grid:{C_RESET}")
    tg = s['tile_grid']
    print(f"  • Tile Dimensions:  {tg['tile_width']} × {tg['tile_height']}")
    print(f"  • Grid Dimensions:  {tg['tiles_x']} horizontal × {tg['tiles_y']} vertical")
    print(f"  • Total Tiles:      {tg['total_tiles']}")
    print()

    if res['boxes']:
        print(f"{C_BOLD}JP2 Box Packaging Tree ({len(res['boxes'])} top-level boxes):{C_RESET}")
        for b in res['boxes']:
            print(f"  [{b['offset']:06X}] {C_CYAN}{b['type']}{C_RESET} : {b['name']} (length {b['length']} B)")
            if 'children' in b:
                for ch in b['children']:
                    print(f"      [{ch['offset']:06X}] └─ {C_CYAN}{ch['type']}{C_RESET} : {ch['name']} (length {ch['length']} B)")
        print()

    if s.get('comments'):
        print(f"{C_BOLD}Encoder Comments:{C_RESET}")
        for c in s['comments']:
            print(f"  \"{c}\"")
        print()


def generate_markdown_report(res: Dict[str, Any]) -> str:
    s = res['summary']
    md = []
    md.append(f"# JPEG 2000 Encoding Analysis: `{res['filename']}`\n")
    md.append(f"- **Container Format:** {res['format']}")
    md.append(f"- **File Size:** {res['file_size']:,} bytes ({format_bytes(res['file_size'])})")
    md.append(f"- **Dimensions:** {s['dimensions']} ({s['megapixels']} Megapixels)")
    md.append(f"- **Compression Mode:** **{s['compression_mode']}**")
    md.append(f"- **Wavelet Transform:** {s['wavelet_filter']}")
    md.append(f"- **Progression Order:** `{s['progression_order']}` ({s['progression_description']})")
    md.append(f"- **Compression Ratio:** {s['compression_ratio']}")
    md.append(f"- **Bitrate:** {s['bits_per_pixel']} bpp\n")

    md.append("## Image & Color Structure")
    md.append(f"- **Color Model:** {s['colorspace']}")
    md.append(f"- **Bit Depth:** {s['bit_depth']}-bit ({'Signed' if s['is_signed'] else 'Unsigned'})")
    md.append(f"- **Components Count:** {s['num_components']}")
    md.append(f"- **Color Transform:** {s['multiple_component_transform']}\n")

    md.append("## Wavelet & Multiresolution Decomposition")
    md.append(f"- **Decomposition Levels:** {s['decomposition_levels']}")
    md.append(f"- **Resolution Scales:** {s['resolution_levels_count']}")
    md.append(f"- **Code-Block Size:** {s['codeblock_dimensions']}")
    md.append(f"- **Quantization Style:** {s['quantization_style']}")
    md.append(f"- **Guard Bits:** {s['guard_bits']}\n")

    md.append("### Resolution Scales Pyramid")
    md.append("| Resolution Level | Dimensions | Scale | Precinct Size |")
    md.append("|---|---|---|---|")
    for r in s.get('resolution_levels_pyramid', []):
        md.append(f"| {r['resolution_level']} | {r['width']} × {r['height']} | {r['scale_factor']} | {r['precinct_width']} × {r['precinct_height']} |")
    md.append("\n")

    md.append("### Code-Block Modes & Error Resilience")
    md.append("| Mode Flag | Status | Description |")
    md.append("|---|---|---|")
    for m in s.get('codeblock_modes', []):
        md.append(f"| `{m['mask']}` | {'✅ ACTIVE' if m['enabled'] else '❌ Inactive'} | {m['description']} |")
    md.append(f"| SOP Markers | {'✅ Enabled' if s['has_sop'] else '❌ Disabled'} | Start of Packet markers |")
    md.append(f"| EPH Markers | {'✅ Enabled' if s['has_eph'] else '❌ Disabled'} | End of Packet Header markers |")
    md.append("\n")

    md.append("## Tile Layout")
    tg = s['tile_grid']
    md.append(f"- **Tile Dimensions:** {tg['tile_width']} × {tg['tile_height']}")
    md.append(f"- **Tile Grid:** {tg['tiles_x']} columns × {tg['tiles_y']} rows")
    md.append(f"- **Total Tiles:** {tg['total_tiles']}\n")

    if s.get('comments'):
        md.append("## Embedded Comments")
        for c in s['comments']:
            md.append(f"> {c}\n")

    return "\n".join(md)


def main():
    parser = argparse.ArgumentParser(
        description="JPEG 2000 Encoding Metadata Analyzer & Inspector",
        prog="jp2k-info"
    )
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # dump command
    dump_parser = subparsers.add_parser("dump", help="Dump comprehensive encoding metadata to terminal")
    dump_parser.add_argument("file", help="Path to JPEG 2000 file (.jp2, .j2k, .jpc, etc.)")

    # json command
    json_parser = subparsers.add_parser("json", help="Export metadata as JSON")
    json_parser.add_argument("file", help="Path to JPEG 2000 file")
    json_parser.add_argument("-o", "--output", help="Output file path (default stdout)")

    # markdown command
    md_parser = subparsers.add_parser("markdown", help="Export metadata as Markdown report")
    md_parser.add_argument("file", help="Path to JPEG 2000 file")
    md_parser.add_argument("-o", "--output", help="Output file path (default stdout)")

    # serve command
    serve_parser = subparsers.add_parser("serve", help="Launch the interactive web application")
    serve_parser.add_argument("--port", type=int, default=8000, help="HTTP server port (default 8000)")
    serve_parser.add_argument("--no-browser", action="store_true", help="Do not automatically open browser")

    args = parser.parse_args()

    if not args.command or args.command == "serve":
        from .server import start_server
        port = getattr(args, 'port', 8000)
        open_browser = not getattr(args, 'no_browser', False)
        start_server(port=port, open_browser=open_browser)
        return

    file_path = args.file
    if file_path.startswith(('http://', 'https://')):
        import urllib.request
        print(f"{C_CYAN}Fetching remote file:{C_RESET} {file_path} ...")
        try:
            req = urllib.request.Request(
                file_path,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) jp2k-info/1.0'}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            filename = os.path.basename(file_path.split('?')[0]) or 'remote.jp2'
        except Exception as e:
            print(f"{C_RED}Error fetching URL:{C_RESET} {e}", file=sys.stderr)
            sys.exit(1)
    else:
        if not os.path.exists(file_path):
            print(f"{C_RED}Error:{C_RESET} File '{file_path}' does not exist.", file=sys.stderr)
            sys.exit(1)

        with open(file_path, "rb") as f:
            data = f.read()
        filename = os.path.basename(file_path)

    jp2_parser = JPEG2000Parser(data, filename)
    res = jp2_parser.parse()

    if args.command == "dump":
        dump_terminal(res)
    elif args.command == "json":
        json_str = json.dumps(res, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(json_str)
            print(f"JSON saved to {args.output}")
        else:
            print(json_str)
    elif args.command == "markdown":
        md_str = generate_markdown_report(res)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(md_str)
            print(f"Markdown report saved to {args.output}")
        else:
            print(md_str)


if __name__ == "__main__":
    main()
