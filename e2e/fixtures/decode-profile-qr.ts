export const decodeProfileQr = async (
  selector = '.profile-qr-login__code img'
): Promise<string> => {
  const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
    'html5-qrcode'
  );
  const image = document.querySelector<HTMLImageElement>(selector)!;
  const blob = image.src.startsWith('data:')
    ? new Blob(
        [
          Uint8Array.from(atob(image.src.split(',')[1]), char =>
            char.charCodeAt(0)
          )
        ],
        { type: 'image/png' }
      )
    : await (await fetch(image.src)).blob();
  const container = document.createElement('div');
  container.id = 'qr-decoder';
  document.body.append(container);
  const scanner = new Html5Qrcode(container.id, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false
  });
  try {
    try {
      return await scanner.scanFile(new File([blob], 'qr.png'), false);
    } catch {
      // Как при повороте камеры: ZXing иначе выбирает ориентиры узора.
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(image, 0, 0);
      const rotated = await new Promise<Blob>(resolve =>
        canvas.toBlob(resolve)
      );
      return await scanner.scanFile(new File([rotated], 'qr.png'), false);
    }
  } finally {
    scanner.clear();
    container.remove();
  }
};
