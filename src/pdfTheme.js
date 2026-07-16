// Centralized theme + helpers for PDF layout (jsPDF can't use CSS directly)
// Adjust values here to tweak look across all PDF generators.

export const pdfTheme = {
  colors: {
    headerBar: '#0084aa',
    dateBarBg: '#f0f8fb',
    zebra: '#fafcfd',
    border: '#000000',
    danger: '#ff4d4f',
    text: '#000000',
  },
  fonts: {
    family: 'helvetica',
    size: {
      base: 10.5,
      header: 11,
      date: 12,
      section: 13,
    },
  },
  table: {
    rowHeight: 16,
    headerHeight: 18,
    paddingX: 4,
    paddingY: 3,
    borderWidth: 0.7,
    headerBorderWidth: 0.8,
    outerBorderWidth: 0.9,
  }
};

// Utility to right-align text inside a column given x + width.
export function drawRight(doc, text, xRight, y, opts = {}) {
  doc.text(text, xRight, y, { align: 'right', ...opts });
}

export function formatCurrency(amount, currency='K') {
  const v = Math.round(Number(amount || 0));
  return `${currency} ${v.toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:0})}`;
}

// Draw a faint watermark grid across the page with the provided text (usually company name)
export function drawWatermarkGrid(doc, text, opts = {}) {
  try {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const angle = opts.angle ?? 30;
    // Much softer by default to avoid overlapping readability issues
    const opacity = opts.opacity ?? 0.06;
    const font = { family: pdfTheme.fonts.family, style: 'bold', size: 36 };

    doc.saveGraphicsState && doc.saveGraphicsState();
    if (doc.GState) {
      try { doc.setGState(new doc.GState({ opacity })); } catch {}
    }
    // Use a very light gray; fallback for environments without GState opacity
    const lightGray = typeof opts.gray === 'number' ? opts.gray : 215;
    doc.setTextColor(lightGray);
    doc.setFont(font.family, font.style);
    doc.setFontSize(font.size);

    const wm = text || '';
    const wmW = doc.getTextWidth(wm);
    const wmH = font.size + 4;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const rotW = Math.abs(wmW * cos) + Math.abs(wmH * sin);
    const rotH = Math.abs(wmW * sin) + Math.abs(wmH * cos);
    // Increase spacing so fewer watermarks appear across content
    const stepX = Math.max(260, rotW * 1.85);
    const stepY = Math.max(200, rotH * 2.1);
    for (let y = -rotH; y < pageHeight + rotH; y += stepY) {
      for (let x = -rotW; x < pageWidth + rotW; x += stepX) {
        doc.text(wm, x, y, { angle });
      }
    }
    doc.restoreGraphicsState && doc.restoreGraphicsState();
    doc.setTextColor(0);
  } catch {}
}

// Render standard header with title, company sub-header, and optional logo image.
// Returns the y coordinate where content can begin.
export function renderStandardHeader(doc, { title, subTitle, margin = 40, logoImg = null, logoMaxW = 100, logoMaxH = 100 } = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerFont = { family: pdfTheme.fonts.family, style: 'bold', size: 22 };
  const subFont = { family: pdfTheme.fonts.family, style: 'bold', size: 16 };

  // Title
  doc.setFont(headerFont.family, headerFont.style);
  doc.setFontSize(headerFont.size);
  const headerY = margin;
  doc.text(title || '', pageWidth / 2, headerY, { align: 'center' });

  // Sub-title (company name)
  doc.setFont(subFont.family, subFont.style);
  doc.setFontSize(subFont.size);
  const subY = headerY + headerFont.size + 10;
  doc.text(subTitle || '', pageWidth / 2, subY, { align: 'center' });

  // Logo (top-left)
  let reservedLogoBottom = margin;
  if (logoImg) {
    try {
      let w = logoImg.width, h = logoImg.height;
      const scale = Math.min(logoMaxW / w, logoMaxH / h, 1);
      w = Math.max(24, w * scale);
      h = Math.max(24, h * scale);
      const CM = 28.346; const lift = 2 * CM;
      const logoY = Math.max(6, (margin - 18) - lift);
      const logoX = margin;
      reservedLogoBottom = logoY + h;
      try { doc.addImage(logoImg, 'PNG', logoX, logoY, w, h); } catch {}
    } catch {}
  }

  const afterHeadersY = margin + 30;
  const contentStartY = Math.max(subY + 2, reservedLogoBottom + 8, afterHeadersY);
  return { contentStartY };
}
