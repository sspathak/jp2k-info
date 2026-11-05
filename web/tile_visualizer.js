/**
 * Interactive JPEG 2000 Tile Grid Visualizer.
 * Renders the reference grid, image offsets, and tile-part layout.
 */

export class TileVisualizer {
  constructor(canvasElement, infoElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.infoEl = infoElement;
    this.tileGrid = null;
    this.tiles = [];
    this.hoveredTile = null;
    this.selectedTile = null;

    this.setupListeners();
  }

  setupListeners() {
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  setData(tileGrid, tilesList, imgWidth, imgHeight) {
    this.tileGrid = tileGrid || {};
    this.tiles = tilesList || [];
    this.imgWidth = imgWidth || 1;
    this.imgHeight = imgHeight || 1;
    this.selectedTile = this.tiles[0] || null;
    this.render();
    if (this.selectedTile) {
      this.updateInfo(this.selectedTile);
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!this.tileGrid || !this.tileGrid.total_tiles) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No tile information available', w / 2, h / 2);
      return;
    }

    const tg = this.tileGrid;
    const numX = tg.tiles_x || 1;
    const numY = tg.tiles_y || 1;
    const tileW = tg.tile_width || this.imgWidth;
    const tileH = tg.tile_height || this.imgHeight;

    const pad = 24;
    const renderW = w - pad * 2;
    const renderH = h - pad * 2;

    const sx = renderW / this.imgWidth;
    const sy = renderH / this.imgHeight;

    // Draw reference canvas background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pad, pad, renderW, renderH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, renderW, renderH);

    // Render each tile
    for (let ty = 0; ty < numY; ty++) {
      for (let tx = 0; tx < numX; tx++) {
        const tileIdx = ty * numX + tx;
        const x0 = tx * tileW;
        const y0 = ty * tileH;
        const x1 = Math.min(x0 + tileW, this.imgWidth);
        const y1 = Math.min(y0 + tileH, this.imgHeight);

        const rx = pad + x0 * sx;
        const ry = pad + y0 * sy;
        const rw = (x1 - x0) * sx;
        const rh = (y1 - y0) * sy;

        const tileData = this.tiles.find(t => t.tile_index === tileIdx) || {
          tile_index: tileIdx,
          tx: tx,
          ty: ty,
          width: x1 - x0,
          height: y1 - y0,
          x0: x0,
          y0: y0,
          x1: x1,
          y1: y1
        };
        tileData.tx = tx;
        tileData.ty = ty;
        tileData.x0 = x0;
        tileData.y0 = y0;
        tileData.x1 = x1;
        tileData.y1 = y1;
        tileData.width = x1 - x0;
        tileData.height = y1 - y0;

        const isHovered = this.hoveredTile && this.hoveredTile.tile_index === tileIdx;
        const isSelected = this.selectedTile && this.selectedTile.tile_index === tileIdx;

        // Tile fill
        ctx.fillStyle = isSelected ? '#0284c7' : isHovered ? '#3b82f6' : (tx + ty) % 2 === 0 ? '#1e293b' : '#1e2538';
        ctx.globalAlpha = isSelected ? 0.75 : isHovered ? 0.6 : 0.4;
        ctx.fillRect(rx, ry, rw, rh);

        // Border
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = isSelected ? 3 : isHovered ? 2 : 1;
        ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#93c5fd' : '#475569';
        ctx.strokeRect(rx, ry, rw, rh);

        // Tile label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Tile #${tileIdx}`, rx + rw / 2, ry + rh / 2 - 8);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`${x1 - x0} × ${y1 - y0}`, rx + rw / 2, ry + rh / 2 + 10);
      }
    }
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

    const pad = 24;
    const renderW = this.canvas.width - pad * 2;
    const renderH = this.canvas.height - pad * 2;

    const sx = renderW / this.imgWidth;
    const sy = renderH / this.imgHeight;

    const tg = this.tileGrid;
    const numX = tg.tiles_x || 1;
    const numY = tg.tiles_y || 1;
    const tileW = tg.tile_width || this.imgWidth;
    const tileH = tg.tile_height || this.imgHeight;

    let found = null;
    for (let ty = 0; ty < numY; ty++) {
      for (let tx = 0; tx < numX; tx++) {
        const tileIdx = ty * numX + tx;
        const x0 = tx * tileW;
        const y0 = ty * tileH;
        const x1 = Math.min(x0 + tileW, this.imgWidth);
        const y1 = Math.min(y0 + tileH, this.imgHeight);

        const rx = pad + x0 * sx;
        const ry = pad + y0 * sy;
        const rw = (x1 - x0) * sx;
        const rh = (y1 - y0) * sy;

        if (mouseX >= rx && mouseX <= rx + rw && mouseY >= ry && mouseY <= ry + rh) {
          found = this.tiles.find(t => t.tile_index === tileIdx) || {
            tile_index: tileIdx,
            tx: tx,
            ty: ty,
            width: x1 - x0,
            height: y1 - y0,
            x0: x0,
            y0: y0,
            x1: x1,
            y1: y1
          };
          break;
        }
      }
      if (found) break;
    }

    if (this.hoveredTile !== found) {
      this.hoveredTile = found;
      this.render();
      if (found && !this.selectedTile) {
        this.updateInfo(found);
      }
    }
  }

  handleMouseLeave() {
    this.hoveredTile = null;
    this.render();
    if (this.selectedTile) {
      this.updateInfo(this.selectedTile);
    }
  }

  handleClick() {
    if (this.hoveredTile) {
      this.selectedTile = this.hoveredTile;
      this.render();
      this.updateInfo(this.selectedTile);
    }
  }

  updateInfo(tile) {
    if (!this.infoEl) return;
    const bytesLen = tile.tile_part_length ? `${tile.tile_part_length.toLocaleString()} B` : 'Unknown (Single tile)';
    const dataLen = tile.data_length ? `${tile.data_length.toLocaleString()} B` : 'In codestream';

    this.infoEl.innerHTML = `
      <div class="tile-info-card">
        <div class="tile-header">
          <span class="tile-tag">Tile #${tile.tile_index}</span>
          <h4>Tile (${tile.tx ?? 0}, ${tile.ty ?? 0})</h4>
          <span class="tile-part-tag">Part ${tile.tile_part_index ?? 0} of ${tile.num_tile_parts ?? 1}</span>
        </div>
        <div class="tile-props-grid">
          <div class="prop-item">
            <span class="label">Bounding Box</span>
            <span class="value">[${tile.x0 ?? 0}, ${tile.y0 ?? 0}] → [${tile.x1 ?? tile.width ?? 0}, ${tile.y1 ?? tile.height ?? 0}]</span>
          </div>
          <div class="prop-item">
            <span class="label">Dimensions</span>
            <span class="value">${tile.width ?? 'Full'} × ${tile.height ?? 'Full'} px</span>
          </div>
          <div class="prop-item">
            <span class="label">Tile-part Length (Psot)</span>
            <span class="value code">${bytesLen}</span>
          </div>
          <div class="prop-item">
            <span class="label">Bitstream Payload (SOD)</span>
            <span class="value code">${dataLen}</span>
          </div>
        </div>
      </div>
    `;
  }
}
