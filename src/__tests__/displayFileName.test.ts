import { displayFileName } from '../lib/display-file-name';

// Copied from the web SDK's display-file-name.test.ts.

describe('displayFileName', () => {
  it('drops names that are a random id', () => {
    expect(displayFileName('940f84e9-18c6-4894-accc-3621f5b1a2c3.jpg')).toBeNull();
    expect(displayFileName('940F84E918C64894ACCC3621F5B1A2C3.PNG')).toBeNull();
    expect(displayFileName('5f2b9c0d8e7a6b5c4d3e2f1a0b9c8d7e')).toBeNull();
  });
  it('keeps ordinary names', () => {
    expect(displayFileName('IMG_1234.jpg')).toBe('IMG_1234.jpg');
    expect(displayFileName('memart.pdf')).toBe('memart.pdf');
    expect(displayFileName('cac-certificate 2024.pdf')).toBe('cac-certificate 2024.pdf');
  });
  it('treats nothing as nothing', () => {
    expect(displayFileName(undefined)).toBeNull();
    expect(displayFileName('')).toBeNull();
  });
});
