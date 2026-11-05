/**
 * Main Application Controller for JPEG 2000 Inspector Web App.
 */

import { ClientJP2Parser } from './parser.js';
import { DWTVisualizer } from './dwt_visualizer.js';
import { TileVisualizer } from './tile_visualizer.js';

class App {
  constructor() {
    this.currentData = null;
    this.currentRawBytes = null;
    this.hexOffset = 0;
    this.hexHighlightRange = null; // [start, end]
    this.dwtVis = null;
    this.tileVis = null;

    this.initElements();
    this.initVisualizers();
    this.bindEvents();
    this.loadInitialSample();
  }

  initElements() {
    this.sampleSelect = document.getElementById('sample-select');
    this.fileInput = document.getElementById('file-input');
    this.dropOverlay = document.getElementById('drop-overlay');
    this.themeToggle = document.getElementById('theme-toggle');

    this.btnExportJson = document.getElementById('btn-export-json');
    this.btnExportMd = document.getElementById('btn-export-md');
    this.btnCopySummary = document.getElementById('btn-copy-summary');

    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabPanes = document.querySelectorAll('.tab-pane');

    // Hero metrics
    this.fileNameEl = document.getElementById('file-name');
    this.badgeFormatEl = document.getElementById('badge-format');
    this.badgeModeEl = document.getElementById('badge-mode');
    this.badgeSizeEl = document.getElementById('badge-size');
    this.filePathSubEl = document.getElementById('file-path-sub');

    this.metricDim = document.getElementById('metric-dim');
    this.metricMp = document.getElementById('metric-mp');
    this.metricWavelet = document.getElementById('metric-wavelet');
    this.metricWaveletSub = document.getElementById('metric-wavelet-sub');
    this.metricProg = document.getElementById('metric-prog');
    this.metricProgSub = document.getElementById('metric-prog-sub');
    this.metricLayers = document.getElementById('metric-layers');
    this.metricMct = document.getElementById('metric-mct');
    this.metricDecomp = document.getElementById('metric-decomp');
    this.metricScales = document.getElementById('metric-scales');
    this.metricColor = document.getElementById('metric-color');
    this.metricDepth = document.getElementById('metric-depth');
    this.metricTiles = document.getElementById('metric-tiles');
    this.metricTileDim = document.getElementById('metric-tile-dim');
    this.metricRatio = document.getElementById('metric-ratio');
    this.metricBpp = document.getElementById('metric-bpp');

    // Preview
    this.previewImg = document.getElementById('preview-image');
    this.channelCanvas = document.getElementById('channel-canvas');
    this.previewPlaceholder = document.getElementById('preview-placeholder');
    this.chkTileOverlay = document.getElementById('chk-tile-overlay');
    this.channelBtns = document.querySelectorAll('.channel-btn');

    // Hex viewer
    this.hexViewer = document.getElementById('hex-viewer');
    this.hexRangeLabel = document.getElementById('hex-range-label');
    this.btnHexPrev = document.getElementById('btn-hex-prev');
    this.btnHexNext = document.getElementById('btn-hex-next');

    // Tree viewer
    this.treeContainer = document.getElementById('bitstream-tree');
    this.treeSearch = document.getElementById('tree-search');
    this.selectedItemTitle = document.getElementById('selected-item-title');
    this.selectedItemOffset = document.getElementById('selected-item-offset');
    this.selectedItemBody = document.getElementById('selected-item-body');

    // Toast
    this.toast = document.getElementById('toast');
  }

  initVisualizers() {
    const dwtCanvas = document.getElementById('dwt-canvas');
    const dwtInfo = document.getElementById('dwt-subband-info');
    this.dwtVis = new DWTVisualizer(dwtCanvas, dwtInfo);

    const tileCanvas = document.getElementById('tile-canvas');
    const tileInfo = document.getElementById('tile-info');
    this.tileVis = new TileVisualizer(tileCanvas, tileInfo);
  }

  bindEvents() {
    // Tabs
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.tabBtns.forEach(b => b.classList.remove('active'));
        this.tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetTab)?.classList.add('active');
        if (targetTab === 'tab-dwt') this.dwtVis.render();
        if (targetTab === 'tab-tiles') this.tileVis.render();
      });
    });

    // Sample selector
    this.sampleSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) this.loadSample(val);
    });

    // File input
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.loadFile(file);
    });

    // Drag & Drop
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropOverlay.classList.remove('hidden');
    });

    this.dropOverlay.addEventListener('dragleave', (e) => {
      if (e.target === this.dropOverlay) {
        this.dropOverlay.classList.add('hidden');
      }
    });

    this.dropOverlay.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropOverlay.classList.add('hidden');
      const file = e.dataTransfer.files[0];
      if (file) this.loadFile(file);
    });

    // Theme toggle
    this.themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      this.themeToggle.querySelector('.theme-icon').textContent =
        document.body.classList.contains('light-theme') ? '🌙' : '☀️';
    });

    // Export buttons
    this.btnExportJson.addEventListener('click', () => this.exportJson());
    this.btnExportMd.addEventListener('click', () => this.exportMarkdown());
    this.btnCopySummary.addEventListener('click', () => this.copySummary());

    // Hex navigation
    this.btnHexPrev.addEventListener('click', () => {
      this.hexOffset = Math.max(0, this.hexOffset - 1024);
      this.renderHex();
    });
    this.btnHexNext.addEventListener('click', () => {
      if (this.currentRawBytes && this.hexOffset + 1024 < this.currentRawBytes.length) {
        this.hexOffset += 1024;
        this.renderHex();
      }
    });

    // Channel toggles
    this.channelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.channelBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyChannelFilter(btn.getAttribute('data-channel'));
      });
    });

    this.chkTileOverlay.addEventListener('change', () => {
      this.renderPreviewCanvas();
    });

    // Tree search filter
    this.treeSearch.addEventListener('input', (e) => {
      this.filterTree(e.target.value);
    });
  }

  async loadInitialSample() {
    this.sampleSelect.value = 'lossless_5_3';
    await this.loadSample('lossless_5_3');
  }

  async loadSample(sampleId) {
    try {
      // First try to fetch from API
      const metaResp = await fetch(`/api/sample_meta/${sampleId}`);
      if (metaResp.ok) {
        const meta = await metaResp.json();
        // Fetch raw binary for hex inspection
        const binResp = await fetch(`/api/sample/${sampleId}`);
        const buffer = await binResp.arrayBuffer();
        this.currentRawBytes = new Uint8Array(buffer);
        this.applyData(meta);
        return;
      }
    } catch (_) {
      // Offline fallback: fetch directly from static samples folder
    }

    try {
      const sampleNames = {
        'lossless_5_3': 'lossless_5_3.jp2',
        'lossy_9_7_multitile': 'lossy_9_7_multitile.jp2',
        'multilayer_progressive': 'multilayer_progressive.jp2',
        'error_resilient': 'error_resilient.jp2',
        'grayscale_12bit': 'grayscale_12bit.jp2',
        'subsampled_420': 'subsampled_420.jp2',
        'raw_codestream': 'raw_codestream.j2k',
        'xml_and_metadata': 'xml_and_metadata.jp2',
        'metadata_comment': 'metadata_comment.jp2'
      };
      const fname = sampleNames[sampleId] || `${sampleId}.jp2`;
      const resp = await fetch(`/samples/${fname}`);
      const buf = await resp.arrayBuffer();
      this.currentRawBytes = new Uint8Array(buf);
      const parser = new ClientJP2Parser(buf, fname);
      const meta = parser.parse();
      meta.preview_url = `/samples/${fname.rsplit ? fname.rsplit('.', 1)[0] : fname.replace(/\.[^.]+$/, '')}.png`;
      this.applyData(meta);
    } catch (err) {
      this.showToast(`Error loading sample: ${err.message}`, true);
    }
  }

  async loadFile(file) {
    try {
      const buffer = await file.arrayBuffer();
      this.currentRawBytes = new Uint8Array(buffer);

      // Try server upload first for opj_decompress support
      let meta = null;
      try {
        const uploadResp = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Filename': file.name
          },
          body: buffer
        });
        if (uploadResp.ok) {
          meta = await uploadResp.json();
        }
      } catch (_) {}

      // Fallback to client-side parse
      if (!meta || meta.error) {
        const parser = new ClientJP2Parser(buffer, file.name);
        meta = parser.parse();
      }

      this.sampleSelect.value = '';
      this.applyData(meta);
      this.showToast(`Successfully analyzed ${file.name}`);
    } catch (err) {
      this.showToast(`Failed to parse file: ${err.message}`, true);
    }
  }

  applyData(meta) {
    this.currentData = meta;
    const s = meta.summary;

    // Header info
    this.fileNameEl.textContent = meta.filename;
    this.badgeFormatEl.textContent = meta.format;
    this.badgeModeEl.textContent = s.compression_mode;
    this.badgeModeEl.className = `badge ${s.is_lossless ? 'badge-lossless' : 'badge-lossy'}`;
    this.badgeSizeEl.textContent = this.formatBytes(meta.file_size);

    const socMarker = meta.codestream_markers?.find(m => m.code === 'SOC');
    this.filePathSubEl.textContent = socMarker ?
      `Codestream SOC at offset 0x${socMarker.offset.toString(16).toUpperCase().padStart(4, '0')}` :
      'Container encapsulated codestream';

    // 8 Metrics Grid
    this.metricDim.textContent = s.dimensions;
    this.metricMp.textContent = `${s.megapixels} MP`;

    this.metricWavelet.textContent = s.is_reversible ? '5/3 Reversible' : '9/7 Irreversible';
    this.metricWaveletSub.textContent = s.wavelet_filter?.split('(')[0]?.trim() || '';

    this.metricProg.textContent = s.progression_order;
    this.metricProgSub.textContent = s.progression_description?.split('(')[0]?.trim() || '';

    this.metricLayers.textContent = `${s.num_layers} ${s.num_layers === 1 ? 'Layer' : 'Layers'}`;
    this.metricMct.textContent = s.multiple_component_transform;

    this.metricDecomp.textContent = `${s.decomposition_levels} Levels`;
    this.metricScales.textContent = `${s.resolution_levels_count} Resolution Scales`;

    this.metricColor.textContent = s.colorspace;
    this.metricDepth.textContent = `${s.bit_depth}-bit ${s.is_signed ? 'Signed' : 'Unsigned'}`;

    this.metricTiles.textContent = `${s.tile_grid.total_tiles} ${s.tile_grid.total_tiles === 1 ? 'Tile' : 'Tiles'}`;
    this.metricTileDim.textContent = `${s.tile_grid.tile_width} × ${s.tile_grid.tile_height} px`;

    this.metricRatio.textContent = s.compression_ratio;
    this.metricBpp.textContent = `${s.bits_per_pixel} bpp`;

    // Render Tab 1: DWT
    this.dwtVis.setData(s.dwt_subband_tree, s.width, s.height);
    this.renderResScalesTable(s.resolution_levels_pyramid);

    // Render Tab 2: Tile Grid
    this.tileVis.setData(s.tile_grid, meta.tiles, s.width, s.height);
    this.renderTilesList(meta.tiles);

    // Render Tab 3: Coding Styles & Modes
    this.renderCodingStyles(s);

    // Render Tab 4: Quantization
    this.renderQuantization(s);

    // Render Tab 5: Image preview
    this.renderPreview(meta);

    // Render Tab 6: Box & Marker Tree
    this.renderTree(meta);

    // Render Tab 7: Hex dump
    this.hexOffset = 0;
    this.renderHex();

    // Render Tab 8: Comments & XML
    this.renderMetadata(s);
  }

  renderResScalesTable(pyramid) {
    const tbody = document.querySelector('#table-res-scales tbody');
    tbody.innerHTML = '';
    if (!pyramid || !pyramid.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="placeholder-text">No scales available</td></tr>';
      return;
    }
    for (const r of pyramid) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Level ${r.resolution_level}</td>
        <td>${r.width} × ${r.height}</td>
        <td>${r.scale_factor}</td>
        <td>${r.precinct_width || 32768} × ${r.precinct_height || 32768}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  renderTilesList(tiles) {
    const tbody = document.querySelector('#table-tiles-list tbody');
    tbody.innerHTML = '';
    if (!tiles || !tiles.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">Single tile image (Default)</td></tr>';
      return;
    }
    for (const t of tiles) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Tile #${t.tile_index}</td>
        <td>Part ${t.tile_part_index} / ${t.num_tile_parts}</td>
        <td>${t.tile_part_length ? t.tile_part_length.toLocaleString() + ' B' : 'N/A'}</td>
        <td>0x${t.sot_offset.toString(16).toUpperCase().padStart(4, '0')}</td>
        <td>${t.data_length ? t.data_length.toLocaleString() + ' B' : 'In tile'}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  renderCodingStyles(s) {
    document.getElementById('cb-dims-text').textContent = `${s.codeblock_dimensions} px`;
    document.getElementById('cb-sop-text').textContent = s.has_sop ? '✅ Enabled (Start of Packet)' : '❌ Disabled';
    document.getElementById('cb-eph-text').textContent = s.has_eph ? '✅ Enabled (End of Packet Header)' : '❌ Disabled';
    document.getElementById('cb-mct-text').textContent = s.multiple_component_transform;
    document.getElementById('cb-prog-text').textContent = `${s.progression_order} — ${s.progression_description}`;

    const modesGrid = document.getElementById('modes-list');
    modesGrid.innerHTML = '';
    for (const m of s.codeblock_modes || []) {
      const card = document.createElement('div');
      card.className = `mode-card ${m.enabled ? 'active' : ''}`;
      card.innerHTML = `
        <span class="mode-status-pill ${m.enabled ? 'on' : 'off'}">${m.enabled ? 'ACTIVE' : 'OFF'}</span>
        <div class="mode-info">
          <span class="mode-title">${m.mask} ${m.description.split('(')[0]}</span>
          <span class="mode-desc">${m.description}</span>
        </div>
      `;
      modesGrid.appendChild(card);
    }
  }

  renderQuantization(s) {
    document.getElementById('badge-quant-style').textContent = s.quantization_style;
    document.getElementById('badge-guard-bits').textContent = `${s.guard_bits} Guard Bits`;

    const tbody = document.querySelector('#table-quant-subbands tbody');
    tbody.innerHTML = '';
    const subbands = s.dwt_subband_tree || [];
    if (!subbands.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="placeholder-text">No quantization subband data</td></tr>';
      return;
    }

    subbands.forEach((sb, idx) => {
      const tr = document.createElement('tr');
      const stepStr = sb.step_size ? Number(sb.step_size).toFixed(8) : '1.0';
      tr.innerHTML = `
        <td>${idx}</td>
        <td><strong>${sb.name}</strong></td>
        <td>${sb.orientation.split('(')[0]}</td>
        <td>${sb.exponent}</td>
        <td>${sb.mantissa}</td>
        <td>${stepStr}</td>
        <td>${sb.exponent || 8} bits</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderPreview(meta) {
    const previewUrl = meta.preview_url;
    if (previewUrl) {
      this.previewImg.src = previewUrl;
      this.previewImg.classList.remove('hidden');
      this.channelCanvas.classList.add('hidden');
      this.previewPlaceholder.classList.add('hidden');
    } else {
      this.previewImg.classList.add('hidden');
      this.channelCanvas.classList.remove('hidden');
      this.renderSyntheticPreview(meta.summary);
    }

    // Component details
    const compContainer = document.getElementById('components-summary');
    compContainer.innerHTML = '';
    for (const c of meta.summary.components_detail || []) {
      const item = document.createElement('div');
      item.className = 'prop-row';
      item.innerHTML = `
        <span class="prop-name">Component #${c.index}</span>
        <span class="prop-val">${c.width} × ${c.height} px | ${c.bit_depth}-bit | Subsample (${c.subsampling_x}x, ${c.subsampling_y}y)</span>
      `;
      compContainer.appendChild(item);
    }
  }

  renderSyntheticPreview(s) {
    const ctx = this.channelCanvas.getContext('2d');
    const w = this.channelCanvas.width;
    const h = this.channelCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Gradient background representation
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`JPEG 2000 ${s.dimensions}`, w / 2, h / 2 - 10);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText(`${s.compression_mode} | ${s.colorspace}`, w / 2, h / 2 + 15);
  }

  applyChannelFilter(channel) {
    if (!this.previewImg.src) return;
    const img = this.previewImg;
    const canvas = this.channelCanvas;
    const ctx = canvas.getContext('2d');

    if (channel === 'rgb') {
      img.classList.remove('hidden');
      canvas.classList.add('hidden');
      return;
    }

    img.classList.add('hidden');
    canvas.classList.remove('hidden');

    canvas.width = img.naturalWidth || 256;
    canvas.height = img.naturalHeight || 256;
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (channel === 'r') {
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else if (channel === 'g') {
        data[i] = 0;
        data[i + 2] = 0;
      } else if (channel === 'b') {
        data[i] = 0;
        data[i + 1] = 0;
      } else if (channel === 'gray') {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = lum;
        data[i + 1] = lum;
        data[i + 2] = lum;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    if (this.chkTileOverlay.checked) {
      this.drawTileOverlay(ctx, canvas.width, canvas.height);
    }
  }

  renderPreviewCanvas() {
    const activeBtn = document.querySelector('.channel-btn.active');
    const channel = activeBtn ? activeBtn.getAttribute('data-channel') : 'rgb';
    this.applyChannelFilter(channel);
  }

  drawTileOverlay(ctx, w, h) {
    const tg = this.currentData?.summary?.tile_grid;
    if (!tg) return;
    const numX = tg.tiles_x || 1;
    const numY = tg.tiles_y || 1;
    const tileW = tg.tile_width || w;
    const tileH = tg.tile_height || h;

    const sx = w / (this.currentData.summary.width || w);
    const sy = h / (this.currentData.summary.height || h);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);

    for (let ty = 0; ty < numY; ty++) {
      for (let tx = 0; tx < numX; tx++) {
        const rx = tx * tileW * sx;
        const ry = ty * tileH * sy;
        const rw = tileW * sx;
        const rh = tileH * sy;
        ctx.strokeRect(rx, ry, rw, rh);
      }
    }
    ctx.setLineDash([]);
  }

  renderTree(meta) {
    this.treeContainer.innerHTML = '';

    // If JP2 container format, render boxes
    if (meta.boxes && meta.boxes.length) {
      for (const box of meta.boxes) {
        this.renderBoxNode(box, this.treeContainer);
      }
    } else {
      // Direct codestream markers
      for (const m of meta.codestream_markers || []) {
        this.renderMarkerNode(m, this.treeContainer);
      }
    }
  }

  renderBoxNode(box, parentEl) {
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.innerHTML = `
      <span class="tree-offset">0x${box.offset.toString(16).toUpperCase().padStart(6, '0')}</span>
      <span class="tree-tag tag-box">${box.type}</span>
      <span class="tree-name">${box.name} (${box.length} B)</span>
    `;

    node.addEventListener('click', () => {
      document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('selected'));
      node.classList.add('selected');
      this.selectTreeItem(box, 'box');
    });

    parentEl.appendChild(node);

    if (box.children && box.children.length) {
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      for (const child of box.children) {
        this.renderBoxNode(child, childContainer);
      }
      parentEl.appendChild(childContainer);
    } else if (box.type === 'jp2c') {
      // Under jp2c, show the codestream markers!
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      for (const m of this.currentData.codestream_markers || []) {
        this.renderMarkerNode(m, childContainer);
      }
      parentEl.appendChild(childContainer);
    }
  }

  renderMarkerNode(marker, parentEl) {
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.innerHTML = `
      <span class="tree-offset">0x${marker.offset.toString(16).toUpperCase().padStart(6, '0')}</span>
      <span class="tree-tag tag-marker">${marker.code}</span>
      <span class="tree-name">${marker.name} (${marker.length} B)</span>
    `;

    node.addEventListener('click', () => {
      document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('selected'));
      node.classList.add('selected');
      this.selectTreeItem(marker, 'marker');
    });

    parentEl.appendChild(node);
  }

  selectTreeItem(item, kind) {
    this.selectedItemTitle.textContent = `${item.name || item.code} (${item.type || item.marker})`;
    this.selectedItemOffset.textContent = `Offset 0x${item.offset.toString(16).toUpperCase().padStart(6, '0')} | Length ${item.length} B`;

    // Highlight in Hex Viewer
    this.hexHighlightRange = [item.offset, item.offset + item.length];
    this.hexOffset = Math.floor(item.offset / 1024) * 1024;
    this.renderHex();

    // Show decoded properties
    const details = item.decoded || {};
    this.selectedItemBody.innerHTML = `
      <pre class="json-view"><code>${JSON.stringify(details, null, 2)}</code></pre>
    `;
  }

  filterTree(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('.tree-node').forEach(node => {
      const text = node.textContent.toLowerCase();
      node.style.display = text.includes(q) ? 'flex' : 'none';
    });
  }

  renderHex() {
    if (!this.currentRawBytes) return;
    const start = this.hexOffset;
    const end = Math.min(start + 1024, this.currentRawBytes.length);
    this.hexRangeLabel.textContent = `Bytes ${start.toLocaleString()} – ${end.toLocaleString()} of ${this.currentRawBytes.length.toLocaleString()}`;

    let html = '';
    const slice = this.currentRawBytes.slice(start, end);

    for (let i = 0; i < slice.length; i += 16) {
      const lineOffset = start + i;
      const chunk = slice.slice(i, i + 16);

      let hexParts = [];
      let asciiParts = '';

      for (let j = 0; j < 16; j++) {
        if (j < chunk.length) {
          const byteVal = chunk[j];
          const globalOffset = lineOffset + j;
          const isHighlighted = this.hexHighlightRange &&
            globalOffset >= this.hexHighlightRange[0] &&
            globalOffset < this.hexHighlightRange[1];

          const hexStr = byteVal.toString(16).padStart(2, '0').toUpperCase();
          hexParts.push(`<span class="hex-byte ${isHighlighted ? 'highlighted' : ''}" data-offset="${globalOffset}">${hexStr}</span>`);

          const charCode = (byteVal >= 32 && byteVal <= 126) ? String.fromCharCode(byteVal) : '·';
          asciiParts += charCode;
        } else {
          hexParts.push('  ');
          asciiParts += ' ';
        }
      }

      html += `
        <div class="hex-line">
          <span class="hex-offset">0x${lineOffset.toString(16).padStart(6, '0').toUpperCase()}</span>
          <span class="hex-bytes">${hexParts.join(' ')}</span>
          <span class="hex-ascii">${this.escapeHtml(asciiParts)}</span>
        </div>
      `;
    }

    this.hexViewer.innerHTML = html;
  }

  renderMetadata(s) {
    const commentsEl = document.getElementById('comments-container');
    commentsEl.innerHTML = '';
    if (s.comments && s.comments.length) {
      for (const c of s.comments) {
        const bubble = document.createElement('div');
        bubble.className = 'comment-bubble';
        bubble.textContent = c;
        commentsEl.appendChild(bubble);
      }
    } else {
      commentsEl.innerHTML = '<p class="placeholder-text">No comments found in codestream.</p>';
    }

    const xmlEl = document.getElementById('xml-content');
    if (s.xml_metadata) {
      xmlEl.textContent = s.xml_metadata;
    } else {
      xmlEl.textContent = 'No XML metadata box present in this file.';
    }
  }

  exportJson() {
    if (!this.currentData) return;
    const blob = new Blob([JSON.stringify(this.currentData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentData.filename.replace(/\.[^.]+$/, '')}_metadata.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('JSON exported successfully');
  }

  exportMarkdown() {
    if (!this.currentData) return;
    const s = this.currentData.summary;
    const md = `
# JPEG 2000 Encoding Analysis: \`${this.currentData.filename}\`

- **Container:** ${this.currentData.format}
- **Dimensions:** ${s.dimensions} (${s.megapixels} MP)
- **Compression:** ${s.compression_mode}
- **Wavelet Filter:** ${s.wavelet_filter}
- **Progression Order:** ${s.progression_order} (${s.progression_description})
- **Quality Layers:** ${s.num_layers}
- **Decomposition Levels:** ${s.decomposition_levels}
- **Compression Ratio:** ${s.compression_ratio}
- **Bitrate:** ${s.bits_per_pixel} bpp
- **Spatial Tiles:** ${s.tile_grid.total_tiles} (${s.tile_grid.tile_width} × ${s.tile_grid.tile_height})

## Coding Style & Modes
- Codeblock: ${s.codeblock_dimensions}
- Quantization: ${s.quantization_style} (${s.guard_bits} guard bits)
- SOP Markers: ${s.has_sop ? 'Enabled' : 'Disabled'}
- EPH Markers: ${s.has_eph ? 'Enabled' : 'Disabled'}
    `.trim();

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentData.filename.replace(/\.[^.]+$/, '')}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Markdown report exported');
  }

  copySummary() {
    if (!this.currentData) return;
    const s = this.currentData.summary;
    const text = `JPEG 2000 File: ${this.currentData.filename}
Dimensions: ${s.dimensions} (${s.megapixels} MP)
Compression: ${s.compression_mode} (${s.wavelet_filter})
Progression: ${s.progression_order} | Layers: ${s.num_layers}
Decomposition: ${s.decomposition_levels} levels | Tiles: ${s.tile_grid.total_tiles}
Ratio: ${s.compression_ratio} | Bitrate: ${s.bits_per_pixel} bpp`;

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Summary copied to clipboard!');
    });
  }

  showToast(msg, isError = false) {
    this.toast.textContent = msg;
    this.toast.style.borderColor = isError ? 'var(--rose)' : 'var(--emerald)';
    this.toast.style.color = isError ? 'var(--rose)' : 'var(--emerald)';
    this.toast.classList.remove('hidden');
    setTimeout(() => {
      this.toast.classList.add('hidden');
    }, 2800);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
