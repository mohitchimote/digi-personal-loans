// Picture checks for letters: what a file is (from its own header, not its name) and how big it claims to be.

// A small file can still declare a huge picture, which the PDF renderer would have to expand in memory.
export const MAX_IMAGE_SIDE = 4000;
export const MAX_IMAGE_PIXELS = 8_000_000;

/** Type and pixel size from the file's own header; null when it is neither a PNG nor a JPEG. */
export function sniffImage(b: Uint8Array): { mimeType: "image/png" | "image/jpeg"; width: number; height: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { mimeType: "image/png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; } // fill byte
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mimeType: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      // Markers without a length field (restart markers, TEM, SOI, EOI) are two bytes long.
      if (marker === 0x01 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return { mimeType: "image/jpeg", width: 0, height: 0 };
  }
  return null;
}
