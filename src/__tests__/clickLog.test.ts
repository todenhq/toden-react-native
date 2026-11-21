import { controlFor, logChoice, logControl, logKey, logPress, UNNAMED_CONTROL } from '../lib/click-log';
import { getStepLog, recordClick, recordStep, resetStepLog } from '../lib/step-log';
import { createTextFn } from '../i18n/translate';

const t = createTextFn();

describe('controlFor', () => {
  it('names a button by the catalogue key of its label', () => {
    expect(controlFor(['  Continue '], t)).toEqual({ control: 'common.continue', label: 'Continue' });
  });

  it('matches the workflow’s own words and reports the English default', () => {
    const custom = createTextFn({ en: { 'common.continue': 'Carry on' } });
    expect(controlFor(['Carry on'], custom)).toEqual({ control: 'common.continue', label: 'Continue' });
  });

  it('never records text that is not SDK copy, such as an address', () => {
    expect(controlFor(['12 Admiralty Way, Lekki'], t)).toEqual({ control: UNNAMED_CONTROL, label: '' });
  });

  it('falls back to the accessible name', () => {
    expect(controlFor([undefined, 'Continue'], t).control).toBe('common.continue');
  });
});

describe('recordClick', () => {
  beforeEach(() => resetStepLog());

  it('stamps the step the applicant is on and rides the step log', () => {
    recordStep('consent');
    logPress(['Continue'], t);
    const clicks = getStepLog()?.clicks ?? [];
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({ control: 'common.continue', label: 'Continue', step: 'consent' });
  });

  it('collapses a double tap but keeps a later press, and caps at 60', () => {
    recordStep('consent');
    recordClick('common.continue', 'Continue', new Date('2026-11-19T10:00:00.000Z'));
    recordClick('common.continue', 'Continue', new Date('2026-11-19T10:00:00.200Z'));
    recordClick('common.continue', 'Continue', new Date('2026-11-19T10:00:02.000Z'));
    expect(getStepLog()?.clicks).toHaveLength(2);
    for (let i = 0; i < 80; i++) recordClick(`k${i}`, 'K', new Date(Date.UTC(2026, 10, 19, 11, 0, i)));
    expect(getStepLog()?.clicks).toHaveLength(60);
  });

  it('leaves clicks off when there were none', () => {
    recordStep('consent');
    expect(getStepLog()).not.toHaveProperty('clicks');
  });
});

describe('named controls and choices', () => {
  beforeEach(() => resetStepLog());

  it('records the shutter, a catalogue key, and the kind of a choice, never the value', () => {
    recordStep('id-type');
    logChoice('idType');
    logControl('capture.shutter', 'Take photo');
    logKey('common.retake');
    const clicks = getStepLog()?.clicks ?? [];
    expect(clicks.map((c) => c.control)).toEqual(['choice.idType', 'capture.shutter', 'common.retake']);
    expect(clicks[0]?.label).toBe('an ID type');
    expect(clicks[2]?.label).not.toBe('');
  });
});
