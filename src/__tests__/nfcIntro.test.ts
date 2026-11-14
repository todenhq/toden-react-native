import { isPassportId, nfcIntroCopy } from '../lib/nfcIntro';

describe('the chip intro', () => {
  it('tells a passport holder to put the phone on the front cover, then try the back', () => {
    const copy = nfcIntroCopy({ passport: true, platform: 'ios', needsCode: false });
    expect(copy.title).toBe('Your passport has a chip');
    expect(copy.rows.map((r) => [r.icon, r.title, r.caption, r.done === true])).toEqual([
      ['camera', 'Photo page scanned', 'Its printed code unlocks the chip.', true],
      ['passport', 'Close your passport', 'Lay it on a flat surface.', false],
      ['phone', 'Place your phone on the front cover', 'Rest the top of your iPhone on it.', false],
      ['hold', 'Hold still for a few seconds', 'If nothing happens, try the back cover.', false],
    ]);
    expect(copy.before).toEqual({ lead: 'Before you start', tap: 'Take off a thick phone case' });
  });

  it('names where the reader is on each phone', () => {
    const card = nfcIntroCopy({ passport: false, platform: 'android', needsCode: false });
    expect(card.rows[2]).toEqual({
      icon: 'phone',
      title: 'Place your phone on the card',
      caption: 'Rest the middle of the back of your phone on it.',
    });
  });

  it('leaves the photo-page scan to do, with no check, when its code is still needed', () => {
    const copy = nfcIntroCopy({ passport: true, platform: 'android', needsCode: true });
    expect(copy.rows).toHaveLength(4);
    expect(copy.rows[0]).toEqual({
      icon: 'camera',
      title: 'Scan the photo page',
      caption: 'Its printed code unlocks the chip.',
    });
  });

  it('knows a passport by its key', () => {
    expect(isPassportId('passport')).toBe(true);
    expect(isPassportId('international-passport')).toBe(true);
    expect(isPassportId('voters-card')).toBe(false);
    expect(isPassportId(null)).toBe(false);
  });
});
