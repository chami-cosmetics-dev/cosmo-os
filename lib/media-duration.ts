/**
 * Read a video's length from an MP4 / MOV file without decoding it: the
 * `moov > mvhd` box holds a timescale and a duration. Used when migrating old
 * uploads, where the browser never measured the length. Returns null for any
 * other container (e.g. WebM) or a malformed file.
 */
export function readMp4DurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const findBox = (type: string, start: number, end: number): { start: number; end: number } | null => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      const boxType = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7],
      );
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) return null;
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header) return null;
      if (boxType === type) return { start: offset + header, end: Math.min(offset + size, end) };
      offset += size;
    }
    return null;
  };

  const moov = findBox("moov", 0, bytes.byteLength);
  if (!moov) return null;
  const mvhd = findBox("mvhd", moov.start, moov.end);
  if (!mvhd) return null;

  const version = bytes[mvhd.start];
  let timescale: number;
  let duration: number;
  if (version === 1) {
    if (mvhd.start + 32 > mvhd.end) return null;
    timescale = view.getUint32(mvhd.start + 20);
    duration = Number(view.getBigUint64(mvhd.start + 24));
  } else {
    if (mvhd.start + 20 > mvhd.end) return null;
    timescale = view.getUint32(mvhd.start + 12);
    duration = view.getUint32(mvhd.start + 16);
  }
  if (!timescale) return null;
  return Math.round(duration / timescale);
}
