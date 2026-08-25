import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ICON_SIZES = [16, 32, 48, 128];

describe('active action icons', () => {
  it('provides a transparent PNG for every Chrome action icon size', () => {
    for (const size of ICON_SIZES) {
      const filePath = `public/icon-active${size}.png`;
      expect(existsSync(filePath)).toBe(true);
      const image = readFileSync(filePath);

      expect(image.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
      expect(image.readUInt32BE(16)).toBe(size);
      expect(image.readUInt32BE(20)).toBe(size);
      expect(image[25]).toBe(6);
    }
  });
});
