function buildQr(content) {
  const text = String(content || '').trim();
  if (!text || typeof window.qrcode !== 'function') return null;
  const code = window.qrcode(0, 'M');
  code.addData(text, 'Byte');
  code.make();
  return code;
}

export function renderQrIntoCanvas(content, canvas) {
  const target = canvas || document.getElementById('cardQrCanvas');
  const context = target?.getContext?.('2d');
  const code = buildQr(content);
  if (!context || !code) return false;

  const modules = code.getModuleCount();
  const quietZone = 4;
  const total = modules + quietZone * 2;
  const size = Math.max(132, Number(target.width || 256));
  const scale = size / total;
  target.width = size;
  target.height = size;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#000000';
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!code.isDark(row, column)) continue;
      const left = Math.floor((column + quietZone) * scale);
      const top = Math.floor((row + quietZone) * scale);
      const right = Math.ceil((column + quietZone + 1) * scale);
      const bottom = Math.ceil((row + quietZone + 1) * scale);
      context.fillRect(left, top, right - left, bottom - top);
    }
  }
  return true;
}

export function qrDataUrl(content, size = 240) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return renderQrIntoCanvas(content, canvas) ? canvas.toDataURL('image/png') : '';
}
