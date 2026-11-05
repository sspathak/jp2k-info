"""
JPEG 2000 Binary Parser and Encoding Metadata Extractor.
Complies with ISO/IEC 15444-1 (ITU-T T.800) and ISO/IEC 15444-2.
Supports both JP2 container file format and raw J2K/JPC codestreams.
"""

import struct
import math
from typing import Dict, Any, List, Optional, Tuple, Union

# Known JP2 Box 4-character codes
BOX_NAMES = {
    'jP  ': 'JPEG 2000 Signature Box',
    'ftyp': 'File Type Box',
    'jp2h': 'JP2 Header Superbox',
    'ihdr': 'Image Header Box',
    'bpcc': 'Bits Per Component Box',
    'colr': 'Colour Specification Box',
    'pclr': 'Palette Box',
    'cmap': 'Component Mapping Box',
    'cdef': 'Channel Definition Box',
    'res ': 'Resolution Superbox',
    'resc': 'Capture Resolution Box',
    'resd': 'Default Display Resolution Box',
    'jp2c': 'Contiguous Codestream Box',
    'jp2i': 'Intellectual Property Box',
    'xml ': 'XML Box',
    'uuid': 'UUID Box',
    'uinf': 'UUID Info Superbox',
    'ulst': 'UUID List Box',
    'url ': 'URL Box',
    'cprt': 'Copyright Box',
    'free': 'Free Space Box',
    'asoc': 'Association Superbox (JPX)',
    'nlst': 'Number List Box (JPX)',
    'lbl ': 'Label Box (JPX)',
}

# Codestream Markers
MARKER_NAMES = {
    0xFF4F: ('SOC', 'Start of Codestream'),
    0xFF51: ('SIZ', 'Image and Tile Size'),
    0xFF52: ('COD', 'Coding Style Default'),
    0xFF53: ('COC', 'Coding Style Component'),
    0xFF55: ('TLM', 'Tile-part Lengths'),
    0xFF57: ('PLM', 'Packet Length Main Header'),
    0xFF58: ('PLT', 'Packet Length Tile-part Header'),
    0xFF5C: ('QCD', 'Quantization Default'),
    0xFF5D: ('QCC', 'Quantization Component'),
    0xFF5E: ('RGN', 'Region-of-Interest'),
    0xFF5F: ('POC', 'Progression Order Change'),
    0xFF60: ('PPM', 'Packed Packet Headers Main Header'),
    0xFF61: ('PPT', 'Packed Packet Headers Tile-part Header'),
    0xFF63: ('CRG', 'Component Registration'),
    0xFF64: ('COM', 'Comment'),
    0xFF90: ('SOT', 'Start of Tile-part'),
    0xFF91: ('SOP', 'Start of Packet'),
    0xFF92: ('EPH', 'End of Packet Header'),
    0xFF93: ('SOD', 'Start of Data'),
    0xFFD9: ('EOC', 'End of Codestream'),
}

PROGRESSION_ORDERS = {
    0: ('LRCP', 'Layer-Resolution-Component-Position (Progressive by Quality / SNR)'),
    1: ('RLCP', 'Resolution-Layer-Component-Position (Progressive by Resolution)'),
    2: ('RPCL', 'Resolution-Position-Component-Layer (Progressive by Resolution & Spatial Location)'),
    3: ('PCRL', 'Position-Component-Resolution-Layer (Progressive by Spatial Location / Panning)'),
    4: ('CPRL', 'Component-Position-Resolution-Layer (Progressive by Color Component)'),
}

ENUM_COLORSPACES = {
    16: 'sRGB (IEC 61966-2-1)',
    17: 'Greyscale (Monochrome)',
    18: 'sYCC (IEC 61966-2-1 Annex Y)',
    20: 'e-sRGB',
    21: 'ROMM-RGB (ProPhoto RGB)',
    24: 'CIE-Lab',
}

WAVELET_FILTERS = {
    0: '9/7 Irreversible (Daubechies CDF 9/7 floating-point, Lossy)',
    1: '5/3 Reversible (Le Gall 5/3 integer, Lossless bit-exact)',
}

COLOR_TRANSFORMS = {
    0: 'None / Component-wise array',
    1: 'Reversible Component Transform (RCT, Lossless RGB <-> YUV)',
    2: 'Irreversible Component Transform (ICT, Lossy RGB <-> YCbCr)',
}

QUANT_STYLES = {
    0: 'No Quantization (Reversible 5/3 wavelet, step sizes = 1.0)',
    1: 'Scalar Derived (Single base step size for LL subband, higher subbands derived)',
    2: 'Scalar Expounded (Explicit independent step size for every subband)',
}

CODEBLOCK_MODES = [
    (0x01, 'Selective arithmetic coding bypass (Lazy / Bypass mode for high speed)'),
    (0x02, 'Reset context probabilities on coding pass boundaries'),
    (0x04, 'Termination on each coding pass'),
    (0x08, 'Vertically causal context (prevents context model from reading neighboring scan lines)'),
    (0x10, 'Predictable termination (enhanced error detection)'),
    (0x20, 'Segmentation symbols used (0x0A inserted at end of bitplane pass for error resilience)'),
]


class JPEG2000Parser:
    """Parses JPEG 2000 JP2 files and raw J2K codestreams into structured metadata."""

    def __init__(self, data: bytes, filename: str = "image.jp2"):
        self.data = data
        self.filename = filename
        self.file_size = len(data)
        self.is_jp2 = False
        self.boxes: List[Dict[str, Any]] = []
        self.codestream_offset = 0
        self.codestream_length = 0
        self.codestream_markers: List[Dict[str, Any]] = []
        self.tiles: List[Dict[str, Any]] = []
        self.summary: Dict[str, Any] = {}

    def parse(self) -> Dict[str, Any]:
        """Main parse entry point."""
        if self.file_size < 2:
            raise ValueError("File is too short to be a JPEG 2000 file.")

        # Check for JP2 Signature (0x0000000C 6A502020 0D0A870A)
        if self.data.startswith(b'\x00\x00\x00\x0cjP  \r\n\x87\n'):
            self.is_jp2 = True
            self.boxes = self._parse_boxes(0, self.file_size)
            # Find jp2c box for codestream
            jp2c_box = next((b for b in self.boxes if b['type'] == 'jp2c'), None)
            if jp2c_box:
                self.codestream_offset = jp2c_box['data_offset']
                self.codestream_length = jp2c_box['data_length']
            else:
                # If no jp2c, look for SOC marker
                soc_idx = self.data.find(b'\xff\x4f')
                if soc_idx != -1:
                    self.codestream_offset = soc_idx
                    self.codestream_length = self.file_size - soc_idx
        elif self.data.startswith(b'\xff\x4f'):
            # Pure J2K codestream
            self.is_jp2 = False
            self.codestream_offset = 0
            self.codestream_length = self.file_size
        else:
            # Check if there is an embedded codestream or signature
            soc_idx = self.data.find(b'\xff\x4f')
            if soc_idx != -1:
                self.is_jp2 = False
                self.codestream_offset = soc_idx
                self.codestream_length = self.file_size - soc_idx
            else:
                raise ValueError("Not a valid JPEG 2000 file (missing JP2 signature and SOC marker 0xFF4F).")

        # Parse codestream
        self._parse_codestream()

        # Build high-level encoding summary and derived analytics
        self._build_summary()

        return {
            'filename': self.filename,
            'file_size': self.file_size,
            'format': 'JP2 Container' if self.is_jp2 else 'Raw J2K Codestream',
            'summary': self.summary,
            'boxes': self.boxes,
            'codestream_markers': self.codestream_markers,
            'tiles': self.tiles,
        }

    # ==========================================
    # JP2 Box Parsing
    # ==========================================
    def _parse_boxes(self, start_offset: int, end_offset: int) -> List[Dict[str, Any]]:
        offset = start_offset
        boxes = []

        while offset < end_offset:
            if offset + 8 > end_offset:
                break

            lbox, tbox_raw = struct.unpack('>I4s', self.data[offset:offset+8])
            tbox = tbox_raw.decode('latin1', errors='replace')
            header_len = 8

            if lbox == 1:
                if offset + 16 > end_offset:
                    break
                lbox = struct.unpack('>Q', self.data[offset+8:offset+16])[0]
                header_len = 16
            elif lbox == 0:
                lbox = end_offset - offset

            box_end = min(offset + lbox, end_offset)
            data_offset = offset + header_len
            data_length = max(0, box_end - data_offset)
            box_payload = self.data[data_offset:box_end]

            box_info: Dict[str, Any] = {
                'type': tbox,
                'name': BOX_NAMES.get(tbox, f'Box "{tbox}"'),
                'offset': offset,
                'length': lbox,
                'header_length': header_len,
                'data_offset': data_offset,
                'data_length': data_length,
                'decoded': {},
            }

            # Superboxes
            if tbox == 'jp2h':
                box_info['name'] = 'JP2 Header Superbox'
                box_info['children'] = self._parse_boxes(data_offset, box_end)
            elif tbox == 'res ':
                box_info['name'] = 'Resolution Superbox'
                box_info['children'] = self._parse_boxes(data_offset, box_end)
            elif tbox == 'uinf':
                box_info['name'] = 'UUID Info Superbox'
                box_info['children'] = self._parse_boxes(data_offset, box_end)
            else:
                # Leaf boxes parsing
                box_info['decoded'] = self._parse_leaf_box(tbox, box_payload)

            boxes.append(box_info)
            offset = box_end

        return boxes

    def _parse_leaf_box(self, tbox: str, payload: bytes) -> Dict[str, Any]:
        res: Dict[str, Any] = {}
        try:
            if tbox == 'jP  ':
                res['magic'] = payload.hex().upper()
                res['valid'] = (payload == b'\r\n\x87\n')

            elif tbox == 'ftyp':
                if len(payload) >= 8:
                    res['brand'] = payload[0:4].decode('latin1', errors='replace')
                    res['minor_version'] = struct.unpack('>I', payload[4:8])[0]
                    compat = []
                    for i in range(8, len(payload), 4):
                        compat.append(payload[i:i+4].decode('latin1', errors='replace'))
                    res['compatibility_list'] = compat

            elif tbox == 'ihdr':
                if len(payload) >= 14:
                    h, w, nc, bpc, c, unkc, ipr = struct.unpack('>IIHBBBB', payload[0:14])
                    res['height'] = h
                    res['width'] = w
                    res['num_components'] = nc
                    res['bpc_raw'] = bpc
                    if bpc == 255:
                        res['bit_depth'] = 'Varies per component (see bpcc box)'
                        res['is_signed'] = None
                    else:
                        res['bit_depth'] = (bpc & 0x7F) + 1
                        res['is_signed'] = bool(bpc & 0x80)
                    res['compression_type'] = c
                    res['compression_name'] = 'JPEG 2000' if c == 7 else f'Unknown ({c})'
                    res['colorspace_unknown'] = bool(unkc)
                    res['ipr_present'] = bool(ipr)

            elif tbox == 'bpcc':
                comp_bpc = []
                for b in payload:
                    comp_bpc.append({
                        'bit_depth': (b & 0x7F) + 1,
                        'is_signed': bool(b & 0x80)
                    })
                res['components'] = comp_bpc

            elif tbox == 'colr':
                if len(payload) >= 3:
                    meth, prec, approx = struct.unpack('>BBB', payload[0:3])
                    res['method_code'] = meth
                    res['method'] = {1: 'Enumerated Colourspace', 2: 'Restricted ICC profile', 3: 'Any ICC profile', 4: 'Vendor'}.get(meth, f'Method {meth}')
                    res['precedence'] = prec
                    res['approximation'] = approx
                    if meth == 1 and len(payload) >= 7:
                        enum_cs = struct.unpack('>I', payload[3:7])[0]
                        res['enum_cs'] = enum_cs
                        res['enum_cs_name'] = ENUM_COLORSPACES.get(enum_cs, f'Custom ({enum_cs})')
                    elif meth in (2, 3) and len(payload) > 3:
                        res['icc_profile_length'] = len(payload) - 3
                        # Try to read ICC profile header
                        icc_data = payload[3:]
                        if len(icc_data) >= 128:
                            icc_profile_size = struct.unpack('>I', icc_data[0:4])[0]
                            icc_cmm = icc_data[4:8].decode('latin1', errors='replace')
                            icc_device_class = icc_data[12:16].decode('latin1', errors='replace')
                            icc_color_space = icc_data[16:20].decode('latin1', errors='replace')
                            res['icc_summary'] = {
                                'profile_size': icc_profile_size,
                                'cmm_type': icc_cmm.strip(),
                                'device_class': icc_device_class.strip(),
                                'color_space': icc_color_space.strip(),
                            }

            elif tbox == 'cdef':
                if len(payload) >= 2:
                    n = struct.unpack('>H', payload[0:2])[0]
                    channels = []
                    type_map = {0: 'Colour', 1: 'Opacity / Alpha', 2: 'Premultiplied Opacity', 65535: 'Unspecified'}
                    for i in range(n):
                        off = 2 + i * 6
                        if off + 6 <= len(payload):
                            cn, typ, asoc = struct.unpack('>HHH', payload[off:off+6])
                            channels.append({
                                'channel_index': cn,
                                'type_code': typ,
                                'type': type_map.get(typ, f'Type {typ}'),
                                'association': 'Whole Image' if asoc == 0 else f'Component {asoc - 1}' if asoc != 65535 else 'None',
                            })
                    res['channels'] = channels

            elif tbox in ('resc', 'resd'):
                if len(payload) >= 10:
                    vr_n, vr_d, hr_n, hr_d, vr_e, hr_e = struct.unpack('>HHHHbb', payload[0:10])
                    vres = (vr_n / vr_d) * (10 ** vr_e) if vr_d != 0 else 0
                    hres = (hr_n / hr_d) * (10 ** hr_e) if hr_d != 0 else 0
                    res['vertical_pixels_per_meter'] = round(vres, 2)
                    res['horizontal_pixels_per_meter'] = round(hres, 2)
                    res['vertical_dpi'] = round(vres * 0.0254, 2)
                    res['horizontal_dpi'] = round(hres * 0.0254, 2)

            elif tbox == 'pclr':
                if len(payload) >= 3:
                    ne, npc = struct.unpack('>HB', payload[0:3])
                    res['num_entries'] = ne
                    res['num_components'] = npc
                    bit_depths = [(b & 0x7F) + 1 for b in payload[3:3+npc]]
                    res['bit_depths'] = bit_depths

            elif tbox == 'cmap':
                mappings = []
                for i in range(0, len(payload), 4):
                    if i + 4 <= len(payload):
                        cmp, mtyp, pcol = struct.unpack('>HBB', payload[i:i+4])
                        mappings.append({
                            'component_index': cmp,
                            'mapping_type': 'Palette lookup' if mtyp == 1 else 'Direct component',
                            'palette_column': pcol
                        })
                res['mappings'] = mappings

            elif tbox == 'xml ':
                xml_text = payload.decode('utf-8', errors='replace')
                res['xml_content'] = xml_text
                res['xml_preview'] = xml_text[:500]

            elif tbox == 'cprt':
                res['copyright'] = payload.decode('utf-8', errors='replace').strip()

            elif tbox == 'uuid':
                if len(payload) >= 16:
                    raw_uuid = payload[0:16]
                    uuid_str = (
                        f"{raw_uuid[0:4].hex()}-{raw_uuid[4:6].hex()}-"
                        f"{raw_uuid[6:8].hex()}-{raw_uuid[8:10].hex()}-{raw_uuid[10:16].hex()}"
                    )
                    res['uuid'] = uuid_str
                    # Known UUIDs
                    if uuid_str.lower() == 'b14bf8bd-083d-4b43-a5ae-8cd7d5a6ce03':
                        res['uuid_type'] = 'GeoTIFF / GeoJP2 Box'
                    elif uuid_str.lower() == 'be7acfcb-97a9-42e8-9c71-999491e3afac':
                        res['uuid_type'] = 'Adobe XMP Metadata'
                        res['xmp_text'] = payload[16:].decode('utf-8', errors='replace')
                    else:
                        res['uuid_type'] = 'Custom UUID'
                    res['payload_size'] = len(payload) - 16

        except Exception as e:
            res['parse_error'] = str(e)

        return res

    # ==========================================
    # JPEG 2000 Codestream Parsing
    # ==========================================
    def _parse_codestream(self):
        data = self.data
        cs_start = self.codestream_offset
        cs_end = cs_start + self.codestream_length
        pos = cs_start

        current_tile: Optional[Dict[str, Any]] = None

        while pos < cs_end:
            if pos + 2 > cs_end:
                break

            marker = struct.unpack('>H', data[pos:pos+2])[0]
            if (marker >> 8) != 0xFF:
                pos += 1
                continue

            marker_code, marker_desc = MARKER_NAMES.get(marker, (f'0x{marker:04X}', 'Unknown Marker'))

            # Markers without length:
            # SOC (0xFF4F), SOD (0xFF93), EOC (0xFFD9), EPH (0xFF92)
            if marker in (0xFF4F, 0xFF92, 0xFFD9):
                entry: Dict[str, Any] = {
                    'marker': f'0x{marker:04X}',
                    'code': marker_code,
                    'name': marker_desc,
                    'offset': pos,
                    'length': 2,
                    'decoded': {},
                }
                self.codestream_markers.append(entry)
                pos += 2
                if marker == 0xFFD9:
                    break
                continue

            elif marker == 0xFF93:  # SOD (Start of data)
                entry = {
                    'marker': '0xFF93',
                    'code': 'SOD',
                    'name': 'Start of Data',
                    'offset': pos,
                    'length': 2,
                    'decoded': {'tile_index': current_tile['tile_index'] if current_tile else None},
                }
                self.codestream_markers.append(entry)
                pos += 2

                # If current tile has Psot, the tile-part length includes SOT up to the next tile
                if current_tile and current_tile.get('tile_part_length', 0) > 0:
                    sot_offset = current_tile['sot_offset']
                    psot = current_tile['tile_part_length']
                    tile_end = sot_offset + psot
                    if tile_end <= cs_end:
                        current_tile['data_length'] = tile_end - pos
                        pos = tile_end
                        continue

                # Fallback: scan forward until next SOT (0xFF90) or EOC (0xFFD9)
                data_start = pos
                while pos < cs_end - 1:
                    if data[pos] == 0xFF and data[pos+1] in (0x90, 0xD9):
                        break
                    pos += 1
                if current_tile:
                    current_tile['data_length'] = pos - data_start
                continue

            else:
                # Marker segment with 16-bit length
                if pos + 4 > cs_end:
                    break

                lmarker = struct.unpack('>H', data[pos+2:pos+4])[0]
                marker_length = 2 + lmarker
                param_bytes = data[pos+4 : pos + marker_length]

                entry = {
                    'marker': f'0x{marker:04X}',
                    'code': marker_code,
                    'name': marker_desc,
                    'offset': pos,
                    'length': marker_length,
                    'payload_length': lmarker - 2,
                    'decoded': {},
                }

                # Parse specific markers
                if marker == 0xFF51:  # SIZ
                    entry['decoded'] = self._parse_siz(param_bytes)
                elif marker == 0xFF52:  # COD
                    entry['decoded'] = self._parse_cod(param_bytes)
                elif marker == 0xFF53:  # COC
                    entry['decoded'] = self._parse_coc(param_bytes)
                elif marker == 0xFF5C:  # QCD
                    entry['decoded'] = self._parse_qcd(param_bytes)
                elif marker == 0xFF5D:  # QCC
                    entry['decoded'] = self._parse_qcc(param_bytes)
                elif marker == 0xFF5E:  # RGN
                    entry['decoded'] = self._parse_rgn(param_bytes)
                elif marker == 0xFF5F:  # POC
                    entry['decoded'] = self._parse_poc(param_bytes)
                elif marker == 0xFF64:  # COM
                    entry['decoded'] = self._parse_com(param_bytes)
                elif marker == 0xFF90:  # SOT
                    sot_info = self._parse_sot(param_bytes, pos)
                    entry['decoded'] = sot_info
                    current_tile = {
                        'tile_index': sot_info['tile_index'],
                        'tile_part_index': sot_info['tile_part_index'],
                        'num_tile_parts': sot_info['num_tile_parts'],
                        'tile_part_length': sot_info['tile_part_length'],
                        'sot_offset': pos,
                        'data_length': 0,
                    }
                    self.tiles.append(current_tile)

                self.codestream_markers.append(entry)
                pos += marker_length

    def _parse_siz(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 36:
            return {'error': 'SIZ marker payload too short'}

        rsiz, xsiz, ysiz, xosiz, yosiz, xtsiz, ytsiz, xtosiz, ytosiz, csiz = struct.unpack(
            '>HIIIIIIIIH', data[0:36]
        )

        rsiz_names = {
            0x0000: 'Profile 0 / Baseline (Standard)',
            0x0001: 'Profile 1 (Unrestricted Part 1)',
            0x0002: 'Profile 2',
            0x0003: 'D-Cinema 2K (24 fps)',
            0x0004: 'D-Cinema 4K (24 fps)',
            0x0007: 'D-Cinema 2K (48 fps)',
        }

        width = xsiz - xosiz
        height = ysiz - yosiz
        num_xtiles = math.ceil((xsiz - xtosiz) / xtsiz) if xtsiz > 0 else 1
        num_ytiles = math.ceil((ysiz - ytosiz) / ytsiz) if ytsiz > 0 else 1
        total_tiles = num_xtiles * num_ytiles

        components = []
        for i in range(csiz):
            off = 36 + i * 3
            if off + 3 <= len(data):
                ssiz, xrsiz, yrsiz = struct.unpack('>BBB', data[off:off+3])
                comp_w = math.ceil(xsiz / xrsiz) - math.ceil(xosiz / xrsiz) if xrsiz > 0 else width
                comp_h = math.ceil(ysiz / yrsiz) - math.ceil(yosiz / yrsiz) if yrsiz > 0 else height
                components.append({
                    'index': i,
                    'bit_depth': (ssiz & 0x7F) + 1,
                    'is_signed': bool(ssiz & 0x80),
                    'subsampling_x': xrsiz,
                    'subsampling_y': yrsiz,
                    'width': comp_w,
                    'height': comp_h,
                })

        return {
            'profile_code': rsiz,
            'profile_name': rsiz_names.get(rsiz, f'Profile 0x{rsiz:04X}'),
            'image_width': width,
            'image_height': height,
            'reference_grid_width': xsiz,
            'reference_grid_height': ysiz,
            'image_offset_x': xosiz,
            'image_offset_y': yosiz,
            'tile_width': xtsiz,
            'tile_height': ytsiz,
            'tile_offset_x': xtosiz,
            'tile_offset_y': ytosiz,
            'num_tiles_x': num_xtiles,
            'num_tiles_y': num_ytiles,
            'total_tiles': total_tiles,
            'num_components': csiz,
            'components': components,
        }

    def _parse_cod(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 10:
            return {'error': 'COD marker payload too short'}

        scod = data[0]
        has_precincts = bool(scod & 0x01)
        has_sop = bool(scod & 0x02)
        has_eph = bool(scod & 0x04)

        prog_order = data[1]
        prog_name, prog_desc = PROGRESSION_ORDERS.get(prog_order, (f'Order {prog_order}', 'Unknown'))

        num_layers = struct.unpack('>H', data[2:4])[0]
        mct = data[4]
        mct_name = COLOR_TRANSFORMS.get(mct, f'Transform {mct}')

        num_decomp = data[5]  # NL decomposition levels
        num_res_levels = num_decomp + 1

        cb_w_exp = data[6]
        cb_h_exp = data[7]
        codeblock_width = 2 ** (cb_w_exp + 2)
        codeblock_height = 2 ** (cb_h_exp + 2)

        cb_style = data[8]
        active_modes = []
        for mask, desc in CODEBLOCK_MODES:
            active_modes.append({
                'mask': f'0x{mask:02X}',
                'enabled': bool(cb_style & mask),
                'description': desc
            })

        wavelet_trans = data[9]
        wavelet_name = WAVELET_FILTERS.get(wavelet_trans, f'Transform {wavelet_trans}')
        is_reversible = (wavelet_trans == 1)

        precinct_sizes = []
        if has_precincts and len(data) >= 10 + num_res_levels:
            for r in range(num_res_levels):
                b = data[10 + r]
                ppx = b & 0x0F
                ppy = (b >> 4) & 0x0F
                precinct_sizes.append({
                    'resolution_level': r,
                    'width': 2 ** ppx,
                    'height': 2 ** ppy,
                    'ppx': ppx,
                    'ppy': ppy,
                })
        elif not has_precincts:
            for r in range(num_res_levels):
                precinct_sizes.append({
                    'resolution_level': r,
                    'width': 32768,
                    'height': 32768,
                    'default': True,
                })

        return {
            'scod_raw': scod,
            'has_user_precincts': has_precincts,
            'has_sop': has_sop,
            'has_eph': has_eph,
            'progression_order': prog_name,
            'progression_order_code': prog_order,
            'progression_description': prog_desc,
            'num_layers': num_layers,
            'multiple_component_transform_code': mct,
            'multiple_component_transform': mct_name,
            'decomposition_levels': num_decomp,
            'resolution_levels': num_res_levels,
            'codeblock_width': codeblock_width,
            'codeblock_height': codeblock_height,
            'codeblock_style_raw': cb_style,
            'codeblock_modes': active_modes,
            'wavelet_filter_code': wavelet_trans,
            'wavelet_filter': wavelet_name,
            'is_reversible': is_reversible,
            'precinct_sizes': precinct_sizes,
        }

    def _parse_coc(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 9:
            return {'error': 'COC marker payload too short'}
        # Component index
        comp_idx = data[0]
        scoc = data[1]
        has_precincts = bool(scoc & 0x01)
        num_decomp = data[2]
        cb_w = 2 ** (data[3] + 2)
        cb_h = 2 ** (data[4] + 2)
        cb_style = data[5]
        wavelet = data[6]
        return {
            'component_index': comp_idx,
            'has_user_precincts': has_precincts,
            'decomposition_levels': num_decomp,
            'codeblock_width': cb_w,
            'codeblock_height': cb_h,
            'codeblock_style': cb_style,
            'wavelet_filter': WAVELET_FILTERS.get(wavelet, str(wavelet)),
        }

    def _parse_qcd(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'QCD marker payload too short'}

        sqcd = data[0]
        style = sqcd & 0x1F
        guard_bits = sqcd >> 5
        style_name = QUANT_STYLES.get(style, f'Style {style}')

        subbands: List[Dict[str, Any]] = []

        if style == 0:  # No quantization (Reversible 5/3)
            # 1 byte per subband: bits 3-7 are epsilon_b
            for idx, b in enumerate(data[1:]):
                eps = b >> 3
                subbands.append({
                    'subband_index': idx,
                    'exponent': eps,
                    'mantissa': 0,
                    'dynamic_range_bits': eps,
                    'step_size': 1.0,
                })
        elif style == 1:  # Scalar derived
            if len(data) >= 3:
                val = struct.unpack('>H', data[1:3])[0]
                eps = val >> 11
                mu = val & 0x7FF
                step_norm = (1.0 + mu / 2048.0) * (2.0 ** (-eps))
                subbands.append({
                    'subband_index': 0,
                    'name': 'LL (Base subband)',
                    'exponent': eps,
                    'mantissa': mu,
                    'normalized_step_size': round(step_norm, 8),
                })
        elif style == 2:  # Scalar expounded
            # 2 bytes per subband
            for idx in range(0, (len(data) - 1) // 2):
                off = 1 + idx * 2
                if off + 2 <= len(data):
                    val = struct.unpack('>H', data[off:off+2])[0]
                    eps = val >> 11
                    mu = val & 0x7FF
                    step_norm = (1.0 + mu / 2048.0) * (2.0 ** (-eps))
                    subbands.append({
                        'subband_index': idx,
                        'exponent': eps,
                        'mantissa': mu,
                        'normalized_step_size': round(step_norm, 8),
                    })

        return {
            'sqcd_raw': sqcd,
            'quantization_style_code': style,
            'quantization_style': style_name,
            'guard_bits': guard_bits,
            'subband_count': len(subbands),
            'subbands': subbands,
        }

    def _parse_qcc(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 2:
            return {'error': 'QCC marker payload too short'}
        comp_idx = data[0]
        qcd_res = self._parse_qcd(data[1:])
        qcd_res['component_index'] = comp_idx
        return qcd_res

    def _parse_rgn(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 3:
            return {'error': 'RGN marker payload too short'}
        comp_idx = data[0]
        method = data[1]
        shift = data[2]
        return {
            'component_index': comp_idx,
            'method': 'Maxshift' if method == 0 else f'Method {method}',
            'roi_shift': shift,
        }

    def _parse_poc(self, data: bytes) -> Dict[str, Any]:
        records = []
        record_len = 7
        for i in range(0, len(data), record_len):
            if i + record_len <= len(data):
                rspoc, cspoc, lyepoc, repoc, cepoc, ppoc = struct.unpack('>BBHHBB', data[i:i+record_len])
                records.append({
                    'res_level_start': rspoc,
                    'component_start': cspoc,
                    'layer_end': lyepoc,
                    'res_level_end': repoc,
                    'component_end': cepoc,
                    'progression_order': PROGRESSION_ORDERS.get(ppoc, (f'Order {ppoc}', ''))[0]
                })
        return {'records': records}

    def _parse_com(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 2:
            return {'error': 'COM marker payload too short'}
        rcom = struct.unpack('>H', data[0:2])[0]
        reg_type = 'Latin-1 / UTF-8 Text' if rcom == 1 else 'Binary Data' if rcom == 0 else f'Reserved ({rcom})'
        comment_bytes = data[2:]
        text = comment_bytes.decode('utf-8', errors='replace') if rcom == 1 else comment_bytes.hex()
        return {
            'registration_code': rcom,
            'registration_type': reg_type,
            'comment': text,
        }

    def _parse_sot(self, data: bytes, offset: int) -> Dict[str, Any]:
        if len(data) < 8:
            return {'error': 'SOT marker payload too short'}
        isot, psot, tpsot, tnsot = struct.unpack('>HI2B', data[0:8])
        return {
            'tile_index': isot,
            'tile_part_length': psot,
            'tile_part_index': tpsot,
            'num_tile_parts': tnsot,
            'sot_offset': offset,
        }

    # ==========================================
    # High-level Summary & Wavelet Tree Construction
    # ==========================================
    def _build_summary(self):
        # Extract primary metadata from SIZ and COD markers or IHDR
        siz_marker = next((m for m in self.codestream_markers if m['code'] == 'SIZ'), None)
        cod_marker = next((m for m in self.codestream_markers if m['code'] == 'COD'), None)
        qcd_marker = next((m for m in self.codestream_markers if m['code'] == 'QCD'), None)
        ihdr_box = None
        colr_box = None
        resc_box = None
        cdef_box = None
        xml_box = None

        def search_boxes(boxes_list):
            nonlocal ihdr_box, colr_box, resc_box, cdef_box, xml_box
            for b in boxes_list:
                t = b['type']
                if t == 'ihdr':
                    ihdr_box = b
                elif t == 'colr':
                    colr_box = b
                elif t == 'resc':
                    resc_box = b
                elif t == 'cdef':
                    cdef_box = b
                elif t == 'xml ':
                    xml_box = b
                if 'children' in b:
                    search_boxes(b['children'])

        search_boxes(self.boxes)

        siz_dec = siz_marker['decoded'] if siz_marker else {}
        cod_dec = cod_marker['decoded'] if cod_marker else {}
        qcd_dec = qcd_marker['decoded'] if qcd_marker else {}

        # Dimensions
        width = siz_dec.get('image_width') or (ihdr_box['decoded'].get('width') if ihdr_box else 0)
        height = siz_dec.get('image_height') or (ihdr_box['decoded'].get('height') if ihdr_box else 0)
        num_comps = siz_dec.get('num_components') or (ihdr_box['decoded'].get('num_components') if ihdr_box else 0)

        # Components
        comps = siz_dec.get('components', [])
        primary_bit_depth = comps[0]['bit_depth'] if comps else (ihdr_box['decoded'].get('bit_depth', 8) if ihdr_box else 8)
        primary_signed = comps[0]['is_signed'] if comps else False

        # Colorspace
        colorspace_desc = 'RGB'
        if colr_box and colr_box.get('decoded', {}).get('enum_cs_name'):
            colorspace_desc = colr_box['decoded']['enum_cs_name']
        elif num_comps == 1:
            colorspace_desc = 'Greyscale (1 Component)'
        elif num_comps == 3:
            colorspace_desc = 'RGB (3 Components)'
        elif num_comps == 4:
            colorspace_desc = 'RGBA / CMYK (4 Components)'

        # Wavelet & Compression Mode
        wavelet = cod_dec.get('wavelet_filter', 'Unknown')
        is_reversible = cod_dec.get('is_reversible', False)
        mct = cod_dec.get('multiple_component_transform', 'None')
        quant_style = qcd_dec.get('quantization_style', 'Unknown')

        is_lossless = is_reversible and (qcd_dec.get('quantization_style_code', 0) == 0)
        mode_label = 'Mathematically Lossless' if is_lossless else 'Lossy Compression'

        # Compression Metrics
        bytes_per_sample = math.ceil(primary_bit_depth / 8) if isinstance(primary_bit_depth, int) else 1
        uncompressed_bytes = width * height * max(1, num_comps) * bytes_per_sample
        compression_ratio = round(uncompressed_bytes / self.file_size, 2) if self.file_size > 0 and uncompressed_bytes > 0 else 0
        bpp = round((self.file_size * 8) / (width * height), 3) if width > 0 and height > 0 else 0

        # Wavelet DWT Subband Hierarchy
        num_decomp = cod_dec.get('decomposition_levels', 0)
        num_res = cod_dec.get('resolution_levels', 1)
        subband_tree = self._build_dwt_tree(width, height, num_decomp, qcd_dec.get('subbands', []))

        # Resolution Levels Hierarchy
        resolution_levels_info = []
        for r in range(num_res):
            scale = 2 ** (num_decomp - r)
            rw = math.ceil(width / scale)
            rh = math.ceil(height / scale)
            precinct = next((p for p in cod_dec.get('precinct_sizes', []) if p['resolution_level'] == r), None)
            resolution_levels_info.append({
                'resolution_level': r,
                'width': rw,
                'height': rh,
                'scale_factor': f'1/{scale}' if scale > 1 else '1 (Full Resolution)',
                'precinct_width': precinct['width'] if precinct else 32768,
                'precinct_height': precinct['height'] if precinct else 32768,
            })

        # Comments
        comments = []
        for m in self.codestream_markers:
            if m['code'] == 'COM' and 'comment' in m.get('decoded', {}):
                comments.append(m['decoded']['comment'])

        self.summary = {
            'dimensions': f"{width} × {height}",
            'width': width,
            'height': height,
            'megapixels': round((width * height) / 1_000_000, 2),
            'num_components': num_comps,
            'components_detail': comps,
            'bit_depth': primary_bit_depth,
            'is_signed': primary_signed,
            'colorspace': colorspace_desc,
            'compression_mode': mode_label,
            'is_lossless': is_lossless,
            'wavelet_filter': wavelet,
            'is_reversible': is_reversible,
            'progression_order': cod_dec.get('progression_order', 'N/A'),
            'progression_description': cod_dec.get('progression_description', 'N/A'),
            'num_layers': cod_dec.get('num_layers', 1),
            'multiple_component_transform': mct,
            'decomposition_levels': num_decomp,
            'resolution_levels_count': num_res,
            'codeblock_dimensions': f"{cod_dec.get('codeblock_width', 64)} × {cod_dec.get('codeblock_height', 64)}",
            'codeblock_modes': cod_dec.get('codeblock_modes', []),
            'quantization_style': quant_style,
            'guard_bits': qcd_dec.get('guard_bits', 0),
            'tile_grid': {
                'tile_width': siz_dec.get('tile_width', width),
                'tile_height': siz_dec.get('tile_height', height),
                'tiles_x': siz_dec.get('num_tiles_x', 1),
                'tiles_y': siz_dec.get('num_tiles_y', 1),
                'total_tiles': siz_dec.get('total_tiles', 1),
            },
            'uncompressed_size_bytes': uncompressed_bytes,
            'file_size_bytes': self.file_size,
            'compression_ratio': f"{compression_ratio}:1" if compression_ratio > 0 else 'N/A',
            'bits_per_pixel': bpp,
            'has_sop': cod_dec.get('has_sop', False),
            'has_eph': cod_dec.get('has_eph', False),
            'comments': comments,
            'xml_metadata': xml_box['decoded'].get('xml_content') if xml_box else None,
            'resolution_levels_pyramid': resolution_levels_info,
            'dwt_subband_tree': subband_tree,
        }

    def _build_dwt_tree(self, width: int, height: int, num_decomp: int, qcd_subbands: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Builds the 2D Mallat decomposition tree with calculated coordinates,
        subband dimensions, orientations, and linked quantization parameters.
        """
        if num_decomp <= 0 or width <= 0 or height <= 0:
            return []

        tree: List[Dict[str, Any]] = []
        qcd_map = {sb['subband_index']: sb for sb in qcd_subbands}

        # Resolution level 0 is LL_NL
        ll_scale = 2 ** num_decomp
        ll_w = math.ceil(width / ll_scale)
        ll_h = math.ceil(height / ll_scale)

        ll_q = qcd_map.get(0, {})
        tree.append({
            'name': f'LL_{num_decomp}',
            'band': 'LL',
            'level': 0,
            'decomposition_level': num_decomp,
            'x': 0,
            'y': 0,
            'width': ll_w,
            'height': ll_h,
            'orientation': 'Low-pass Horizontal & Vertical (Approximation)',
            'step_size': ll_q.get('normalized_step_size', ll_q.get('step_size', 1.0)),
            'exponent': ll_q.get('exponent', 0),
            'mantissa': ll_q.get('mantissa', 0),
        })

        subband_idx = 1
        # For each decomposition scale d from num_decomp down to 1
        for d in range(num_decomp, 0, -1):
            curr_scale = 2 ** d
            prev_scale = 2 ** (d - 1)
            # The low-pass block at level d is expanded into HL, LH, HH at scale prev_scale
            w_prev = math.ceil(width / prev_scale)
            h_prev = math.ceil(height / prev_scale)
            w_curr = math.ceil(width / curr_scale)
            h_curr = math.ceil(height / curr_scale)

            hl_w = w_prev - w_curr
            hl_h = h_curr
            lh_w = w_curr
            lh_h = h_prev - h_curr
            hh_w = hl_w
            hh_h = lh_h

            # HL subband (High horizontal, Low vertical)
            hl_q = qcd_map.get(subband_idx, {})
            tree.append({
                'name': f'HL_{d}',
                'band': 'HL',
                'level': num_decomp - d + 1,
                'decomposition_level': d,
                'x': w_curr,
                'y': 0,
                'width': hl_w,
                'height': hl_h,
                'orientation': 'High-pass Horizontal, Low-pass Vertical (Vertical details)',
                'step_size': hl_q.get('normalized_step_size', hl_q.get('step_size', 1.0)),
                'exponent': hl_q.get('exponent', 0),
                'mantissa': hl_q.get('mantissa', 0),
            })
            subband_idx += 1

            # LH subband (Low horizontal, High vertical)
            lh_q = qcd_map.get(subband_idx, {})
            tree.append({
                'name': f'LH_{d}',
                'band': 'LH',
                'level': num_decomp - d + 1,
                'decomposition_level': d,
                'x': 0,
                'y': h_curr,
                'width': lh_w,
                'height': lh_h,
                'orientation': 'Low-pass Horizontal, High-pass Vertical (Horizontal details)',
                'step_size': lh_q.get('normalized_step_size', lh_q.get('step_size', 1.0)),
                'exponent': lh_q.get('exponent', 0),
                'mantissa': lh_q.get('mantissa', 0),
            })
            subband_idx += 1

            # HH subband (High horizontal, High vertical)
            hh_q = qcd_map.get(subband_idx, {})
            tree.append({
                'name': f'HH_{d}',
                'band': 'HH',
                'level': num_decomp - d + 1,
                'decomposition_level': d,
                'x': w_curr,
                'y': h_curr,
                'width': hh_w,
                'height': hh_h,
                'orientation': 'High-pass Horizontal & Vertical (Diagonal details)',
                'step_size': hh_q.get('normalized_step_size', hh_q.get('step_size', 1.0)),
                'exponent': hh_q.get('exponent', 0),
                'mantissa': hh_q.get('mantissa', 0),
            })
            subband_idx += 1

        return tree
