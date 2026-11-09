import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8');

describe('icon choices', () => {
  it('draws every location pin as the pin with a house', () => {
    const map = source('components/icons/map.ts');
    expect(map).toContain("'map-pin': MapPinHouseIcon");
    expect(map).toContain("'map-pinned': MapPinHouseIcon");
  });

  it('keeps sparkles, which reads as AI, off the glare line', () => {
    const glare = source('components/readyPrimerContent.ts')
      .split('\n')
      .find((line) => line.includes('Keep glare'));
    expect(glare).toContain("'zap-off'");
  });
});
