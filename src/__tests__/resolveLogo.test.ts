import { resolveLogo } from '../lib/logo';

describe('resolveLogo', () => {
  it("shows the organisation's logo when nothing chooses one, as 'default' does", () => {
    expect(resolveLogo(undefined, 'https://org/logo.png')).toBe('https://org/logo.png');
    expect(resolveLogo('default', 'https://org/logo.png')).toBe('https://org/logo.png');
  });

  it("shows nothing for a workflow's None (an empty logo)", () => {
    expect(resolveLogo('', 'https://org/logo.png')).toBeNull();
  });

  it('shows a chosen image', () => {
    expect(resolveLogo('https://custom/logo.png', 'https://org/logo.png')).toBe('https://custom/logo.png');
  });

  it('shows nothing when the organisation has no logo', () => {
    expect(resolveLogo(undefined, undefined)).toBeNull();
  });
});
