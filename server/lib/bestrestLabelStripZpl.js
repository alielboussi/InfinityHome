/** Right 10 mm brand strip — logo mark + vertical company name (ZPL). */

const LOGO_W = 40;
const LOGO_H = 40;

export function appendBestrestStripZpl(lines, { widthDots, heightDots, stripDots }) {
  const stripX = widthDots - stripDots;
  lines.push(`^FO${stripX},4^GB2,${heightDots - 8},2^FS`);
  const logoX = stripX + Math.max(6, Math.floor((stripDots - LOGO_W) / 2));
  lines.push(`^FO${logoX},10^GB${LOGO_W},${LOGO_H},3^FS`);
  lines.push(`^FO${logoX + 6},22^A0N,18,18^FDBR^FS`);
  const textX = stripX + Math.floor(stripDots / 2) + 8;
  const textY = Math.min(heightDots - 16, 58);
  lines.push(`^FO${textX},${textY}^A0R,15,13^FDBestrest Furniture^FS`);
}
