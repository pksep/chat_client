const readStickerAnimation = (bytes: Uint8Array) => {
  const ascii = (start: number, count: number) =>
    String.fromCharCode(...bytes.subarray(start, start + count));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let duration = 0;
    let frames = 0;
    for (let pos = 12; pos + 8 <= bytes.length; ) {
      const size = view.getUint32(pos + 4, true);
      if (pos + 8 + size > bytes.length) break;
      if (ascii(pos, 4) === 'ANMF' && size >= 16) {
        duration += Math.max(
          10,
          bytes[pos + 20] + (bytes[pos + 21] << 8) + (bytes[pos + 22] << 16)
        );
        frames += 1;
      }
      if (ascii(pos, 4) === 'ANIM' && size >= 6)
        view.setUint16(pos + 12, 0, true);
      pos += 8 + size + (size % 2);
    }
    return { durationMs: frames > 1 ? Math.min(duration, 600000) : 0 };
  }
  if (ascii(0, 3) === 'GIF' && bytes.length >= 13) {
    let pos = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0);
    let frames = 0;
    let duration = 0;
    let delay = 100;
    let hasGifLoop = false;
    const gifDataOffset = pos;
    const skipBlocks = () => {
      while (pos < bytes.length) {
        const count = bytes[pos++];
        if (!count) return true;
        if (pos + count > bytes.length) return false;
        pos += count;
      }
      return false;
    };
    while (pos < bytes.length) {
      const block = bytes[pos++];
      if (block === 0x3b) break;
      if (block === 0x21) {
        const label = bytes[pos++];
        if (label === 0xf9 && bytes[pos] === 4 && pos + 5 < bytes.length)
          delay = Math.max(20, (bytes[pos + 2] + (bytes[pos + 3] << 8)) * 10);
        if (
          label === 0xff &&
          bytes[pos] === 11 &&
          pos + 17 <= bytes.length &&
          ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(ascii(pos + 1, 11)) &&
          bytes[pos + 12] === 3 &&
          bytes[pos + 13] === 1
        ) {
          bytes[pos + 14] = 0;
          bytes[pos + 15] = 0;
          hasGifLoop = true;
        }
        if (!skipBlocks()) break;
      } else if (block === 0x2c && pos + 9 <= bytes.length) {
        const packed = bytes[pos + 8];
        pos += 9 + (packed & 128 ? 3 * (1 << ((packed & 7) + 1)) : 0);
        pos += 1;
        if (!skipBlocks()) break;
        frames += 1;
        duration += delay;
        delay = 100;
      } else break;
    }
    return {
      durationMs: frames > 1 ? Math.min(duration, 600000) : 0,
      hasGifLoop,
      gifDataOffset
    };
  }
  return { durationMs: 0 };
};

export const inspectStickerAnimation = (bytes: Uint8Array): number =>
  readStickerAnimation(bytes).durationMs;

export const prepareKeyboardSticker = async (file: File) => {
  let bytes = new Uint8Array(await file.arrayBuffer());
  const { durationMs, hasGifLoop, gifDataOffset } = readStickerAnimation(bytes);
  if (durationMs && !hasGifLoop && gifDataOffset !== undefined) {
    const loopExtension = new Uint8Array([
      0x21,
      0xff,
      0x0b,
      ...new TextEncoder().encode('NETSCAPE2.0'),
      0x03,
      0x01,
      0x00,
      0x00,
      0x00
    ]);
    const looped = new Uint8Array(bytes.length + loopExtension.length);
    looped.set(bytes.subarray(0, gifDataOffset));
    looped.set(loopExtension, gifDataOffset);
    looped.set(
      bytes.subarray(gifDataOffset),
      gifDataOffset + loopExtension.length
    );
    bytes = looped;
  }
  return {
    file: new File([bytes], file.name, {
      type: file.type,
      lastModified: file.lastModified
    }),
    durationMs
  };
};
