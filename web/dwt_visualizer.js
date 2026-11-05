/**
 * Interactive Mallat Wavelet Decomposition (DWT) Visualizer.
 * Renders the 2D octave pyramid subbands with interactive inspection.
 */

export class DWTVisualizer {
  constructor(canvasElement, infoElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.infoEl = infoElement;
    this.tree = [];
    this.hoveredSubband = null;
    this.selectedSubband = null;
    this.imgWidth = 1;
    this.imgHeight = 1;

    this.colors = {
      LL: '#10b981', // Emerald green
      HL: '#3b82f6', // Bright blue
      LH: '#8b5cf6', // Violet
      HH: '#ec4899', // Pink
      border: '#334155',
      hoverBorder: '#f8fafc',
      text: '#f8fafc',
      subText: '#94a3b8'
    };

    this.setupListeners();
  }

  setupListeners() {
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  setData(dwtTree, imgWidth, imgHeight) {
    this.tree = dwtTree || [];
    this.imgWidth = imgWidth || 1;
    this.imgHeight = imgHeight || 1;
    this.selectedSubband = this.tree[0] || null;
    this.render();
    if (this.selectedSubband) {
      this.updateInfo(this.selectedSubband);
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!this.tree.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No DWT subbands available (Decomposition levels = 0)', w / 2, h / 2);
      return;
    }

    // Scale factors from reference grid (imgWidth, imgHeight) to canvas size
    const sx = w / this.imgWidth;
    const sy = h / this.imgHeight;

    for (const sb of this.tree) {
      const rx = sb.x * sx;
      const ry = sb.y * sy;
      const rw = sb.width * sx;
      const rh = sb.height * sy;

      const isHovered = this.hoveredSubband && this.hoveredSubband.name === sb.name;
      const isSelected = this.selectedSubband && this.selectedSubband.name === sb.name;

      // Fill
      ctx.fillStyle = this.colors[sb.band] || '#6366f1';
      ctx.globalAlpha = isSelected ? 0.9 : isHovered ? 0.75 : 0.45;
      ctx.fillRect(rx, ry, rw, rh);

      // Stroke
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2 : 1;
      ctx.strokeStyle = isSelected ? '#38bdf8' : isHovered ? '#f1f5f9' : '#1e293b';
      ctx.strokeRect(rx, ry, rw, rh);

      // Text label
      if (rw > 28 && rh > 20) {
        ctx.fillStyle = '#ffffff';
        ctx.font = rw > 60 && rh > 40 ? 'bold 13px Inter, monospace' : '10px Inter, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sb.name, rx + rw / 2, ry + rh / 2);

        if (rw > 70 && rh > 55) {
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '9px monospace';
          ctx.fillText(`${sb.width}×${sb.height}`, rx + rw / 2, ry + rh / 2 + 15);
        }
      }
    }
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

    const sx = this.canvas.width / this.imgWidth;
    const sy = this.canvas.height / this.imgHeight;

    let found = null;
    for (const sb of this.tree) {
      const rx = sb.x * sx;
      const ry = sb.y * sy;
      const rw = sb.width * sx;
      const rh = sb.height * sy;

      if (mouseX >= rx && mouseX <= rx + rw && mouseY >= ry && mouseY <= ry + rh) {
        found = sb;
        break;
      }
    }

    if (this.hoveredSubband !== found) {
      this.hoveredSubband = found;
      this.render();
      if (found && !this.selectedSubband) {
        this.updateInfo(found);
      }
    }
  }

  handleMouseLeave() {
    this.hoveredSubband = null;
    this.render();
    if (this.selectedSubband) {
      this.updateInfo(this.selectedSubband);
    }
  }

  handleClick(e) {
    if (this.hoveredSubband) {
      this.selectedSubband = this.hoveredSubband;
      this.render();
      this.updateInfo(this.selectedSubband);
    }
  }

  updateInfo(sb) {
    if (!this.infoEl) return;
    const stepStr = sb.step_size ? Number(sb.step_size).toFixed(8) : '1.0';

    this.infoEl.innerHTML = `
      <div class="subband-card band-${sb.band}">
        <div class="subband-header">
          <span class="subband-tag">${sb.band} Band</span>
          <h4>${sb.name}</h4>
          <span class="subband-scale">Decomp Scale ${sb.decomposition_level}</span>
        </div>
        <p class="subband-desc">${sb.orientation}</p>
        <div class="subband-props-grid">
          <div class="prop-item">
            <span class="label">Dimensions</span>
            <span class="value">${sb.width} × ${sb.height} px</span>
          </div>
          <div class="prop-item">
            <span class="label">Total Coefficients</span>
            <span class="value">${(sb.width * sb.height).toLocaleString()}</span>
          </div>
          <div class="prop-item">
            <span class="label">Step Size (Δb)</span>
            <span class="value code">${stepStr}</span>
          </div>
          <div class="prop-item">
            <span class="label">Exponent (εb) / Mantissa</span>
            <span class="value code">ε=${sb.exponent}, μ=${sb.mantissa}</span>
          </div>
        </div>
      </div>
    `;
  }
}
