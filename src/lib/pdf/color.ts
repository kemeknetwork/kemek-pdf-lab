// Parse a CSS hex colour (#rrggbb) to pdf-lib's 0–1 RGB triple. The single
// canonical implementation shared by the three export passes — merge annotations
// (operator.ts), watermark, and stamp — which must map a colour identically, so
// it lives in one place rather than copied per module. A malformed value degrades
// to black rather than throwing mid-export.

export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length !== 3) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[0], 16) / 255,
    g: parseInt(m[1], 16) / 255,
    b: parseInt(m[2], 16) / 255
  };
}
