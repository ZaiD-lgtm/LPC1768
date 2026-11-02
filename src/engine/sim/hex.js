// Intel HEX parsing / generation.

export function parseHex(text) {
  const segs = [];
  let base = 0, cur = null, entry = null, lineNo = 0;
  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    if (line[0] !== ':') throw new Error(`line ${lineNo}: record does not start with ':'`);
    const bytes = [];
    for (let i = 1; i < line.length; i += 2) {
      const b = parseInt(line.substr(i, 2), 16);
      if (isNaN(b)) throw new Error(`line ${lineNo}: invalid hex digits`);
      bytes.push(b);
    }
    const len = bytes[0], addr = (bytes[1] << 8) | bytes[2], type = bytes[3];
    if (bytes.length !== len + 5) throw new Error(`line ${lineNo}: record length mismatch`);
    let sum = 0; for (const b of bytes) sum = (sum + b) & 0xFF;
    if (sum !== 0) throw new Error(`line ${lineNo}: checksum error`);
    const data = bytes.slice(4, 4 + len);
    if (type === 0) {
      const a = base + addr;
      if (cur && cur.addr + cur.data.length === a) cur.data.push(...data);
      else { cur = { addr: a, data: [...data] }; segs.push(cur); }
    } else if (type === 1) break;
    else if (type === 2) { base = ((data[0] << 8) | data[1]) << 4; cur = null; }
    else if (type === 4) { base = (((data[0] << 8) | data[1]) << 16) >>> 0; cur = null; }
    else if (type === 5) entry = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
  }
  return { segments: segs.map(s => ({ addr: s.addr, data: Uint8Array.from(s.data) })), entry };
}

export function toHex(image, base = 0) {
  const out = [];
  const rec = (type, addr, data) => {
    const b = [data.length, (addr >> 8) & 0xFF, addr & 0xFF, type, ...data];
    let sum = 0; for (const x of b) sum = (sum + x) & 0xFF;
    b.push((-sum) & 0xFF);
    out.push(':' + b.map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(''));
  };
  let upper = -1;
  for (let off = 0; off < image.length; off += 16) {
    const a = base + off;
    if ((a >>> 16) !== upper) { upper = a >>> 16; rec(4, 0, [(upper >> 8) & 0xFF, upper & 0xFF]); }
    const chunk = Array.from(image.slice(off, Math.min(off + 16, image.length)));
    if (chunk.every(x => x === 0xFF)) continue;
    rec(0, a & 0xFFFF, chunk);
  }
  rec(1, 0, []);
  return out.join('\r\n') + '\r\n';
}
