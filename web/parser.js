/**
 * Client-Side Binary JPEG 2000 Parser (ISO/IEC 15444-1 / ITU-T T.800)
 * Parses JP2 Box containers and raw J2K Codestreams directly in the browser.
 */

const BOX_NAMES = {
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
  'free': 'Free Space Box'
};

const MARKER_NAMES = {
  0xFF4F: ['SOC', 'Start of Codestream'],
  0xFF51: ['SIZ', 'Image and Tile Size'],
  0xFF52: ['COD', 'Coding Style Default'],
  0xFF53: ['COC', 'Coding Style Component'],
  0xFF55: ['TLM', 'Tile-part Lengths'],
  0xFF57: ['PLM', 'Packet Length Main Header'],
  0xFF58: ['PLT', 'Packet Length Tile-part Header'],
  0xFF5C: ['QCD', 'Quantization Default'],
  0xFF5D: ['QCC', 'Quantization Component'],
  0xFF5E: ['RGN', 'Region-of-Interest'],
  0xFF5F: ['POC', 'Progression Order Change'],
  0xFF60: ['PPM', 'Packed Packet Headers Main Header'],
  0xFF61: ['PPT', 'Packed Packet Headers Tile-part Header'],
  0xFF63: ['CRG', 'Component Registration'],
  0xFF64: ['COM', 'Comment'],
  0xFF90: ['SOT', 'Start of Tile-part'],
  0xFF91: ['SOP', 'Start of Packet'],
  0xFF92: ['EPH', 'End of Packet Header'],
  0xFF93: ['SOD', 'Start of Data'],
  0xFFD9: ['EOC', 'End of Codestream'],
};

const PROGRESSION_ORDERS = {
  0: ['LRCP', 'Layer-Resolution-Component-Position (Progressive by Quality / SNR)'],
  1: ['RLCP', 'Resolution-Layer-Component-Position (Progressive by Resolution)'],
  2: ['RPCL', 'Resolution-Position-Component-Layer (Progressive by Resolution & Spatial Location)'],
  3: ['PCRL', 'Position-Component-Resolution-Layer (Progressive by Spatial Location / Panning)'],
  4: ['CPRL', 'Component-Position-Resolution-Layer (Progressive by Color Component)'],
};

const ENUM_COLORSPACES = {
  16: 'sRGB (IEC 61966-2-1)',
  17: 'Greyscale (Monochrome)',
  18: 'sYCC (IEC 61966-2-1 Annex Y)',
  20: 'e-sRGB',
  21: 'ROMM-RGB (ProPhoto RGB)',
  24: 'CIE-Lab',
};

const WAVELET_FILTERS = {
  0: '9/7 Irreversible (Daubechies CDF 9/7 floating-point, Lossy)',
  1: '5/3 Reversible (Le Gall 5/3 integer, Lossless bit-exact)',
};

const COLOR_TRANSFORMS = {
  0: 'None / Component-wise array',
  1: 'Reversible Component Transform (RCT, Lossless RGB <-> YUV)',
  2: 'Irreversible Component Transform (ICT, Lossy RGB <-> YCbCr)',
};

const QUANT_STYLES = {
  0: 'No Quantization (Reversible 5/3 wavelet, step sizes = 1.0)',
  1: 'Scalar Derived (Single base step size for LL subband, higher subbands derived)',
  2: 'Scalar Expounded (Explicit independent step size for every subband)',
};

const CODEBLOCK_MODES = [
  [0x01, 'Selective arithmetic coding bypass (Lazy / Bypass mode for high speed)'],
  [0x02, 'Reset context probabilities on coding pass boundaries'],
  [0x04, 'Termination on each coding pass'],
  [0x08, 'Vertically causal context (prevents context model from reading neighboring scan lines)'],
  [0x10, 'Predictable termination (enhanced error detection)'],
  [0x20, 'Segmentation symbols used (0x0A inserted at end of bitplane pass for error resilience)'],
];

export class ClientJP2Parser {
  constructor(arrayBuffer, filename = 'image.jp2') {
    this.buffer = arrayBuffer;
    this.view = new DataView(arrayBuffer);
    this.bytes = new Uint8Array(arrayBuffer);
    this.filename = filename;
    this.fileSize = arrayBuffer.byteLength;
    this.isJP2 = false;
    this.boxes = [];
    this.codestreamOffset = 0;
    this.codestreamLength = 0;
    this.codestreamMarkers = [];
    this.tiles = [];
    this.summary = {};
  }

  parse() {
    if (this.fileSize < 2) {
      throw new Error('File is too short to be a valid JPEG 2000 file.');
    }

    // Check for JP2 Signature (0x0000000C 6A502020 0D0A870A)
    const sigMatches = this.fileSize >= 12 &&
      this.view.getUint32(0) === 12 &&
      this.view.getUint32(4) === 0x6A502020 &&
      this.view.getUint32(8) === 0x0D0A870A;

    if (sigMatches) {
      this.isJP2 = true;
      this.boxes = this.parseBoxes(0, this.fileSize);
      const jp2c = this.boxes.find(b => b.type === 'jp2c');
      if (jp2c) {
        this.codestreamOffset = jp2c.data_offset;
        this.codestreamLength = jp2c.data_length;
      } else {
        const soc = this.findSequence([0xFF, 0x4F]);
        this.codestreamOffset = soc !== -1 ? soc : 0;
        this.codestreamLength = this.fileSize - this.codestreamOffset;
      }
    } else if (this.view.getUint16(0) === 0xFF4F) {
      this.isJP2 = false;
      this.codestreamOffset = 0;
      this.codestreamLength = this.fileSize;
    } else {
      const soc = this.findSequence([0xFF, 0x4F]);
      if (soc !== -1) {
        this.isJP2 = false;
        this.codestreamOffset = soc;
        this.codestreamLength = this.fileSize - soc;
      } else {
        throw new Error('Not a valid JPEG 2000 file (missing JP2 signature and SOC marker 0xFF4F).');
      }
    }

    this.parseCodestream();
    this.buildSummary();

    return {
      filename: this.filename,
      file_size: this.fileSize,
      format: this.isJP2 ? 'JP2 Container' : 'Raw J2K Codestream',
      summary: this.summary,
      boxes: this.boxes,
      codestream_markers: this.codestreamMarkers,
      tiles: this.tiles,
    };
  }

  findSequence(seq, start = 0) {
    const len = seq.length;
    for (let i = start; i <= this.bytes.length - len; i++) {
      let match = true;
      for (let j = 0; j < len; j++) {
        if (this.bytes[i + j] !== seq[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  }

  parseBoxes(startOffset, endOffset) {
    let offset = startOffset;
    const boxes = [];

    while (offset < endOffset) {
      if (offset + 8 > endOffset) break;

      let lbox = this.view.getUint32(offset);
      const tboxBytes = this.bytes.slice(offset + 4, offset + 8);
      const tbox = String.fromCharCode(...tboxBytes);
      let headerLen = 8;

      if (lbox === 1) {
        if (offset + 16 > endOffset) break;
        // BigInt 64-bit length
        const high = this.view.getUint32(offset + 8);
        const low = this.view.getUint32(offset + 12);
        lbox = (high * 4294967296) + low;
        headerLen = 16;
      } else if (lbox === 0) {
        lbox = endOffset - offset;
      }

      const boxEnd = Math.min(offset + lbox, endOffset);
      const dataOffset = offset + headerLen;
      const dataLength = Math.max(0, boxEnd - dataOffset);
      const boxPayload = this.bytes.slice(dataOffset, boxEnd);

      const boxInfo = {
        type: tbox,
        name: BOX_NAMES[tbox] || `Box "${tbox}"`,
        offset: offset,
        length: lbox,
        header_length: headerLen,
        data_offset: dataOffset,
        data_length: dataLength,
        decoded: {},
      };

      if (tbox === 'jp2h' || tbox === 'res ' || tbox === 'uinf') {
        boxInfo.children = this.parseBoxes(dataOffset, boxEnd);
      } else {
        boxInfo.decoded = this.parseLeafBox(tbox, boxPayload);
      }

      boxes.push(boxInfo);
      offset = boxEnd;
    }

    return boxes;
  }

  parseLeafBox(tbox, payload) {
    const res = {};
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

    try {
      if (tbox === 'jP  ') {
        res.valid = payload.length === 4 &&
          payload[0] === 0x0D && payload[1] === 0x0A && payload[2] === 0x87 && payload[3] === 0x0A;
      } else if (tbox === 'ftyp') {
        if (payload.length >= 8) {
          res.brand = String.fromCharCode(...payload.slice(0, 4));
          res.minor_version = view.getUint32(4);
          const compat = [];
          for (let i = 8; i + 4 <= payload.length; i += 4) {
            compat.push(String.fromCharCode(...payload.slice(i, i + 4)));
          }
          res.compatibility_list = compat;
        }
      } else if (tbox === 'ihdr') {
        if (payload.length >= 14) {
          const h = view.getUint32(0);
          const w = view.getUint32(4);
          const nc = view.getUint16(8);
          const bpc = view.getUint8(10);
          const c = view.getUint8(11);
          const unkc = view.getUint8(12);
          const ipr = view.getUint8(13);

          res.height = h;
          res.width = w;
          res.num_components = nc;
          res.bpc_raw = bpc;
          if (bpc === 255) {
            res.bit_depth = 'Varies per component';
          } else {
            res.bit_depth = (bpc & 0x7F) + 1;
            res.is_signed = Boolean(bpc & 0x80);
          }
          res.compression_type = c;
          res.compression_name = c === 7 ? 'JPEG 2000' : `Unknown (${c})`;
          res.colorspace_unknown = Boolean(unkc);
          res.ipr_present = Boolean(ipr);
        }
      } else if (tbox === 'colr') {
        if (payload.length >= 3) {
          const meth = view.getUint8(0);
          res.method_code = meth;
          res.method = { 1: 'Enumerated Colourspace', 2: 'Restricted ICC profile', 3: 'Any ICC profile', 4: 'Vendor' }[meth] || `Method ${meth}`;
          res.precedence = view.getUint8(1);
          res.approximation = view.getUint8(2);

          if (meth === 1 && payload.length >= 7) {
            const enumCS = view.getUint32(3);
            res.enum_cs = enumCS;
            res.enum_cs_name = ENUM_COLORSPACES[enumCS] || `Custom (${enumCS})`;
          } else if ((meth === 2 || meth === 3) && payload.length > 3) {
            res.icc_profile_length = payload.length - 3;
          }
        }
      } else if (tbox === 'cdef') {
        if (payload.length >= 2) {
          const n = view.getUint16(0);
          const channels = [];
          const typeMap = { 0: 'Colour', 1: 'Opacity / Alpha', 2: 'Premultiplied Opacity', 65535: 'Unspecified' };
          for (let i = 0; i < n; i++) {
            const off = 2 + i * 6;
            if (off + 6 <= payload.length) {
              const cn = view.getUint16(off);
              const typ = view.getUint16(off + 2);
              const asoc = view.getUint16(off + 4);
              channels.push({
                channel_index: cn,
                type_code: typ,
                type: typeMap[typ] || `Type ${typ}`,
                association: asoc === 0 ? 'Whole Image' : asoc !== 65535 ? `Component ${asoc - 1}` : 'None'
              });
            }
          }
          res.channels = channels;
        }
      } else if (tbox === 'resc' || tbox === 'resd') {
        if (payload.length >= 10) {
          const vrN = view.getUint16(0);
          const vrD = view.getUint16(2);
          const hrN = view.getUint16(4);
          const hrD = view.getUint16(6);
          const vrE = view.getInt8(8);
          const hrE = view.getInt8(9);
          const vres = vrD !== 0 ? (vrN / vrD) * Math.pow(10, vrE) : 0;
          const hres = hrD !== 0 ? (hrN / hrD) * Math.pow(10, hrE) : 0;
          res.vertical_pixels_per_meter = Math.round(vres * 100) / 100;
          res.horizontal_pixels_per_meter = Math.round(hres * 100) / 100;
          res.vertical_dpi = Math.round(vres * 0.0254 * 100) / 100;
          res.horizontal_dpi = Math.round(hres * 0.0254 * 100) / 100;
        }
      } else if (tbox === 'xml ') {
        const textDecoder = new TextDecoder('utf-8');
        res.xml_content = textDecoder.decode(payload);
      } else if (tbox === 'cprt') {
        const textDecoder = new TextDecoder('utf-8');
        res.copyright = textDecoder.decode(payload).trim();
      } else if (tbox === 'uuid') {
        if (payload.length >= 16) {
          const h = Array.from(payload.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
          const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
          res.uuid = uuid;
          if (uuid.toLowerCase() === 'b14bf8bd-083d-4b43-a5ae-8cd7d5a6ce03') {
            res.uuid_type = 'GeoTIFF / GeoJP2 Box';
          } else if (uuid.toLowerCase() === 'be7acfcb-97a9-42e8-9c71-999491e3afac') {
            res.uuid_type = 'Adobe XMP Metadata';
            res.xmp_text = new TextDecoder('utf-8').decode(payload.slice(16));
          } else {
            res.uuid_type = 'Custom UUID';
          }
        }
      }
    } catch (e) {
      res.parse_error = e.message;
    }

    return res;
  }

  parseCodestream() {
    const csStart = this.codestreamOffset;
    const csEnd = csStart + this.codestreamLength;
    let pos = csStart;
    let currentTile = null;

    while (pos < csEnd) {
      if (pos + 2 > csEnd) break;

      const marker = this.view.getUint16(pos);
      if ((marker >> 8) !== 0xFF) {
        pos += 1;
        continue;
      }

      const markerInfo = MARKER_NAMES[marker] || [`0x${marker.toString(16).toUpperCase()}`, 'Unknown Marker'];
      const [markerCode, markerDesc] = markerInfo;

      if (marker === 0xFF4F || marker === 0xFF92 || marker === 0xFFD9) {
        this.codestreamMarkers.push({
          marker: `0x${marker.toString(16).toUpperCase().padStart(4, '0')}`,
          code: markerCode,
          name: markerDesc,
          offset: pos,
          length: 2,
          decoded: {}
        });
        pos += 2;
        if (marker === 0xFFD9) break;
        continue;
      } else if (marker === 0xFF93) { // SOD
        this.codestreamMarkers.push({
          marker: '0xFF93',
          code: 'SOD',
          name: 'Start of Data',
          offset: pos,
          length: 2,
          decoded: { tile_index: currentTile ? currentTile.tile_index : null }
        });
        pos += 2;

        if (currentTile && currentTile.tile_part_length > 0) {
          const sotOffset = currentTile.sot_offset;
          const psot = currentTile.tile_part_length;
          const tileEnd = sotOffset + psot;
          if (tileEnd <= csEnd) {
            currentTile.data_length = tileEnd - pos;
            pos = tileEnd;
            continue;
          }
        }

        // Scan ahead to next SOT or EOC
        const dataStart = pos;
        while (pos < csEnd - 1) {
          if (this.bytes[pos] === 0xFF && (this.bytes[pos + 1] === 0x90 || this.bytes[pos + 1] === 0xD9)) {
            break;
          }
          pos += 1;
        }
        if (currentTile) currentTile.data_length = pos - dataStart;
        continue;
      } else {
        if (pos + 4 > csEnd) break;
        const lmarker = this.view.getUint16(pos + 2);
        const markerLength = 2 + lmarker;
        const paramBytes = this.bytes.slice(pos + 4, pos + markerLength);

        const entry = {
          marker: `0x${marker.toString(16).toUpperCase().padStart(4, '0')}`,
          code: markerCode,
          name: markerDesc,
          offset: pos,
          length: markerLength,
          payload_length: lmarker - 2,
          decoded: {}
        };

        if (marker === 0xFF51) entry.decoded = this.parseSIZ(paramBytes);
        else if (marker === 0xFF52) entry.decoded = this.parseCOD(paramBytes);
        else if (marker === 0xFF5C) entry.decoded = this.parseQCD(paramBytes);
        else if (marker === 0xFF64) entry.decoded = this.parseCOM(paramBytes);
        else if (marker === 0xFF90) {
          entry.decoded = this.parseSOT(paramBytes, pos);
          currentTile = {
            tile_index: entry.decoded.tile_index,
            tile_part_index: entry.decoded.tile_part_index,
            num_tile_parts: entry.decoded.num_tile_parts,
            tile_part_length: entry.decoded.tile_part_length,
            sot_offset: pos,
            data_length: 0
          };
          this.tiles.push(currentTile);
        }

        this.codestreamMarkers.push(entry);
        pos += markerLength;
      }
    }
  }

  parseSIZ(payload) {
    if (payload.length < 36) return { error: 'Payload too short' };
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const rsiz = view.getUint16(0);
    const xsiz = view.getUint32(2);
    const ysiz = view.getUint32(6);
    const xosiz = view.getUint32(10);
    const yosiz = view.getUint32(14);
    const xtsiz = view.getUint32(18);
    const ytsiz = view.getUint32(22);
    const xtosiz = view.getUint32(26);
    const ytosiz = view.getUint32(30);
    const csiz = view.getUint16(34);

    const width = xsiz - xosiz;
    const height = ysiz - yosiz;
    const numXtiles = xtsiz > 0 ? Math.ceil((xsiz - xtosiz) / xtsiz) : 1;
    const numYtiles = ytsiz > 0 ? Math.ceil((ysiz - ytosiz) / ytsiz) : 1;

    const components = [];
    for (let i = 0; i < csiz; i++) {
      const off = 36 + i * 3;
      if (off + 3 <= payload.length) {
        const ssiz = payload[off];
        const xrsiz = payload[off + 1];
        const yrsiz = payload[off + 2];
        components.push({
          index: i,
          bit_depth: (ssiz & 0x7F) + 1,
          is_signed: Boolean(ssiz & 0x80),
          subsampling_x: xrsiz,
          subsampling_y: yrsiz,
          width: xrsiz > 0 ? Math.ceil(xsiz / xrsiz) - Math.ceil(xosiz / xrsiz) : width,
          height: yrsiz > 0 ? Math.ceil(ysiz / yrsiz) - Math.ceil(yosiz / yrsiz) : height
        });
      }
    }

    return {
      profile_code: rsiz,
      image_width: width,
      image_height: height,
      tile_width: xtsiz,
      tile_height: ytsiz,
      num_tiles_x: numXtiles,
      num_tiles_y: numYtiles,
      total_tiles: numXtiles * numYtiles,
      num_components: csiz,
      components: components
    };
  }

  parseCOD(payload) {
    if (payload.length < 10) return { error: 'Payload too short' };
    const scod = payload[0];
    const hasPrecincts = Boolean(scod & 0x01);
    const hasSop = Boolean(scod & 0x02);
    const hasEph = Boolean(scod & 0x04);

    const progOrder = payload[1];
    const [progName, progDesc] = PROGRESSION_ORDERS[progOrder] || [`Order ${progOrder}`, 'Unknown'];

    const numLayers = (payload[2] << 8) | payload[3];
    const mct = payload[4];
    const mctName = COLOR_TRANSFORMS[mct] || `Transform ${mct}`;

    const numDecomp = payload[5];
    const numResLevels = numDecomp + 1;

    const cbWidth = Math.pow(2, payload[6] + 2);
    const cbHeight = Math.pow(2, payload[7] + 2);

    const cbStyle = payload[8];
    const activeModes = CODEBLOCK_MODES.map(([mask, desc]) => ({
      mask: `0x${mask.toString(16).padStart(2, '0').toUpperCase()}`,
      enabled: Boolean(cbStyle & mask),
      description: desc
    }));

    const wavelet = payload[9];
    const waveletName = WAVELET_FILTERS[wavelet] || `Transform ${wavelet}`;
    const isReversible = (wavelet === 1);

    const precinctSizes = [];
    if (hasPrecincts && payload.length >= 10 + numResLevels) {
      for (let r = 0; r < numResLevels; r++) {
        const b = payload[10 + r];
        const ppx = b & 0x0F;
        const ppy = (b >> 4) & 0x0F;
        precinctSizes.push({
          resolution_level: r,
          width: Math.pow(2, ppx),
          height: Math.pow(2, ppy)
        });
      }
    } else {
      for (let r = 0; r < numResLevels; r++) {
        precinctSizes.push({
          resolution_level: r,
          width: 32768,
          height: 32768,
          default: true
        });
      }
    }

    return {
      has_user_precincts: hasPrecincts,
      has_sop: hasSop,
      has_eph: hasEph,
      progression_order: progName,
      progression_description: progDesc,
      num_layers: numLayers,
      multiple_component_transform: mctName,
      decomposition_levels: numDecomp,
      resolution_levels: numResLevels,
      codeblock_width: cbWidth,
      codeblock_height: cbHeight,
      codeblock_modes: activeModes,
      wavelet_filter: waveletName,
      is_reversible: isReversible,
      precinct_sizes: precinctSizes
    };
  }

  parseQCD(payload) {
    if (payload.length < 1) return { error: 'Payload too short' };
    const sqcd = payload[0];
    const style = sqcd & 0x1F;
    const guardBits = sqcd >> 5;
    const subbands = [];

    if (style === 0) { // Reversible
      for (let i = 1; i < payload.length; i++) {
        const eps = payload[i] >> 3;
        subbands.push({
          subband_index: i - 1,
          exponent: eps,
          mantissa: 0,
          step_size: 1.0
        });
      }
    } else if (style === 1 && payload.length >= 3) { // Derived
      const val = (payload[1] << 8) | payload[2];
      const eps = val >> 11;
      const mu = val & 0x7FF;
      const step = (1.0 + mu / 2048.0) * Math.pow(2, -eps);
      subbands.push({
        subband_index: 0,
        name: 'LL',
        exponent: eps,
        mantissa: mu,
        normalized_step_size: Math.round(step * 100000000) / 100000000
      });
    } else if (style === 2) { // Expounded
      for (let i = 1; i + 1 < payload.length; i += 2) {
        const val = (payload[i] << 8) | payload[i + 1];
        const eps = val >> 11;
        const mu = val & 0x7FF;
        const step = (1.0 + mu / 2048.0) * Math.pow(2, -eps);
        subbands.push({
          subband_index: (i - 1) / 2,
          exponent: eps,
          mantissa: mu,
          normalized_step_size: Math.round(step * 100000000) / 100000000
        });
      }
    }

    return {
      quantization_style: QUANT_STYLES[style] || `Style ${style}`,
      quantization_style_code: style,
      guard_bits: guardBits,
      subbands: subbands
    };
  }

  parseCOM(payload) {
    if (payload.length < 2) return { error: 'Payload too short' };
    const rcom = (payload[0] << 8) | payload[1];
    const textDecoder = new TextDecoder('utf-8');
    const comment = rcom === 1 ? textDecoder.decode(payload.slice(2)) : 'Binary comment';
    return {
      registration_code: rcom,
      comment: comment
    };
  }

  parseSOT(payload, offset) {
    if (payload.length < 8) return { error: 'Payload too short' };
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    return {
      tile_index: view.getUint16(0),
      tile_part_length: view.getUint32(2),
      tile_part_index: view.getUint8(6),
      num_tile_parts: view.getUint8(7),
      sot_offset: offset
    };
  }

  buildSummary() {
    const siz = (this.codestreamMarkers.find(m => m.code === 'SIZ') || {}).decoded || {};
    const cod = (this.codestreamMarkers.find(m => m.code === 'COD') || {}).decoded || {};
    const qcd = (this.codestreamMarkers.find(m => m.code === 'QCD') || {}).decoded || {};

    let ihdrBox = null;
    let colrBox = null;
    let xmlBox = null;

    const findBoxes = (list) => {
      for (const b of list) {
        if (b.type === 'ihdr') ihdrBox = b;
        if (b.type === 'colr') colrBox = b;
        if (b.type === 'xml ') xmlBox = b;
        if (b.children) findBoxes(b.children);
      }
    };
    findBoxes(this.boxes);

    const width = siz.image_width || (ihdrBox ? ihdrBox.decoded.width : 0);
    const height = siz.image_height || (ihdrBox ? ihdrBox.decoded.height : 0);
    const numComps = siz.num_components || (ihdrBox ? ihdrBox.decoded.num_components : 0);
    const comps = siz.components || [];
    const bitDepth = comps[0] ? comps[0].bit_depth : (ihdrBox ? ihdrBox.decoded.bit_depth : 8);
    const isSigned = comps[0] ? comps[0].is_signed : false;

    let colorspace = 'RGB';
    if (colrBox && colrBox.decoded && colrBox.decoded.enum_cs_name) {
      colorspace = colrBox.decoded.enum_cs_name;
    } else if (numComps === 1) colorspace = 'Greyscale (1 Component)';
    else if (numComps === 3) colorspace = 'RGB (3 Components)';

    const isLossless = cod.is_reversible && qcd.quantization_style_code === 0;
    const modeLabel = isLossless ? 'Mathematically Lossless' : 'Lossy Compression';

    const uncompressedBytes = width * height * Math.max(1, numComps) * Math.ceil(bitDepth / 8);
    const compRatio = uncompressedBytes > 0 && this.fileSize > 0 ?
      (uncompressedBytes / this.fileSize).toFixed(1) : '0';
    const bpp = width > 0 && height > 0 ? ((this.fileSize * 8) / (width * height)).toFixed(3) : 0;

    const numDecomp = cod.decomposition_levels || 0;
    const numRes = cod.resolution_levels || 1;
    const subbandsTree = this.buildDwtTree(width, height, numDecomp, qcd.subbands || []);

    const resPyramid = [];
    for (let r = 0; r < numRes; r++) {
      const scale = Math.pow(2, numDecomp - r);
      resPyramid.push({
        resolution_level: r,
        width: Math.ceil(width / scale),
        height: Math.ceil(height / scale),
        scale_factor: scale > 1 ? `1/${scale}` : '1 (Full Resolution)',
      });
    }

    const comments = [];
    for (const m of this.codestreamMarkers) {
      if (m.code === 'COM' && m.decoded && m.decoded.comment) {
        comments.push(m.decoded.comment);
      }
    }

    this.summary = {
      dimensions: `${width} × ${height}`,
      width: width,
      height: height,
      megapixels: ((width * height) / 1000000).toFixed(2),
      num_components: numComps,
      components_detail: comps,
      bit_depth: bitDepth,
      is_signed: isSigned,
      colorspace: colorspace,
      compression_mode: modeLabel,
      is_lossless: isLossless,
      wavelet_filter: cod.wavelet_filter || 'Unknown',
      is_reversible: cod.is_reversible,
      progression_order: cod.progression_order || 'N/A',
      progression_description: cod.progression_description || 'N/A',
      num_layers: cod.num_layers || 1,
      multiple_component_transform: cod.multiple_component_transform || 'None',
      decomposition_levels: numDecomp,
      resolution_levels_count: numRes,
      codeblock_dimensions: `${cod.codeblock_width || 64} × ${cod.codeblock_height || 64}`,
      codeblock_modes: cod.codeblock_modes || [],
      quantization_style: qcd.quantization_style || 'N/A',
      guard_bits: qcd.guard_bits || 0,
      tile_grid: {
        tile_width: siz.tile_width || width,
        tile_height: siz.tile_height || height,
        tiles_x: siz.num_tiles_x || 1,
        tiles_y: siz.num_tiles_y || 1,
        total_tiles: siz.total_tiles || 1
      },
      uncompressed_size_bytes: uncompressedBytes,
      file_size_bytes: this.fileSize,
      compression_ratio: `${compRatio}:1`,
      bits_per_pixel: bpp,
      has_sop: cod.has_sop || false,
      has_eph: cod.has_eph || false,
      comments: comments,
      xml_metadata: xmlBox ? xmlBox.decoded.xml_content : null,
      resolution_levels_pyramid: resPyramid,
      dwt_subband_tree: subbandsTree
    };
  }

  buildDwtTree(width, height, numDecomp, qcdSubbands) {
    if (numDecomp <= 0 || width <= 0 || height <= 0) return [];
    const tree = [];
    const qcdMap = {};
    for (const sb of qcdSubbands) {
      qcdMap[sb.subband_index] = sb;
    }

    const llScale = Math.pow(2, numDecomp);
    const llW = Math.ceil(width / llScale);
    const llH = Math.ceil(height / llScale);
    const llQ = qcdMap[0] || {};

    tree.push({
      name: `LL_${numDecomp}`,
      band: 'LL',
      level: 0,
      decomposition_level: numDecomp,
      x: 0,
      y: 0,
      width: llW,
      height: llH,
      orientation: 'Low-pass Horizontal & Vertical (Approximation)',
      step_size: llQ.normalized_step_size || llQ.step_size || 1.0,
      exponent: llQ.exponent || 0,
      mantissa: llQ.mantissa || 0
    });

    let subbandIdx = 1;
    for (let d = numDecomp; d >= 1; d--) {
      const currScale = Math.pow(2, d);
      const prevScale = Math.pow(2, d - 1);
      const wPrev = Math.ceil(width / prevScale);
      const hPrev = Math.ceil(height / prevScale);
      const wCurr = Math.ceil(width / currScale);
      const hCurr = Math.ceil(height / currScale);

      const hlW = wPrev - wCurr;
      const hlH = hCurr;
      const lhW = wCurr;
      const lhH = hPrev - hCurr;
      const hhW = hlW;
      const hhH = lhH;

      const hlQ = qcdMap[subbandIdx] || {};
      tree.push({
        name: `HL_${d}`,
        band: 'HL',
        level: numDecomp - d + 1,
        decomposition_level: d,
        x: wCurr,
        y: 0,
        width: hlW,
        height: hlH,
        orientation: 'High-pass Horizontal, Low-pass Vertical (Vertical edges)',
        step_size: hlQ.normalized_step_size || hlQ.step_size || 1.0,
        exponent: hlQ.exponent || 0,
        mantissa: hlQ.mantissa || 0
      });
      subbandIdx++;

      const lhQ = qcdMap[subbandIdx] || {};
      tree.push({
        name: `LH_${d}`,
        band: 'LH',
        level: numDecomp - d + 1,
        decomposition_level: d,
        x: 0,
        y: hCurr,
        width: lhW,
        height: lhH,
        orientation: 'Low-pass Horizontal, High-pass Vertical (Horizontal edges)',
        step_size: lhQ.normalized_step_size || lhQ.step_size || 1.0,
        exponent: lhQ.exponent || 0,
        mantissa: lhQ.mantissa || 0
      });
      subbandIdx++;

      const hhQ = qcdMap[subbandIdx] || {};
      tree.push({
        name: `HH_${d}`,
        band: 'HH',
        level: numDecomp - d + 1,
        decomposition_level: d,
        x: wCurr,
        y: hCurr,
        width: hhW,
        height: hhH,
        orientation: 'High-pass Horizontal & Vertical (Diagonal textures)',
        step_size: hhQ.normalized_step_size || hhQ.step_size || 1.0,
        exponent: hhQ.exponent || 0,
        mantissa: hhQ.mantissa || 0
      });
      subbandIdx++;
    }

    return tree;
  }
}
