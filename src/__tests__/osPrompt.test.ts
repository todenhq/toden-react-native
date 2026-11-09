import { afterAllow, needsSettings, osShowedPrompt } from '../presence/os-prompt-rule';

describe('osShowedPrompt', () => {
  it('reads a prompt from the app leaving the active state', () => {
    expect(osShowedPrompt({ platform: 'ios', leftActive: true, elapsedMs: 900 })).toBe(true);
  });

  it('reads none on iOS when the app stayed active, however long it took', () => {
    expect(osShowedPrompt({ platform: 'ios', leftActive: false, elapsedMs: 1500 })).toBe(false);
  });

  it('reads an instant Android answer as no prompt', () => {
    expect(osShowedPrompt({ platform: 'android', leftActive: false, elapsedMs: 40 })).toBe(false);
  });

  it('reads a slower Android answer as a person', () => {
    expect(osShowedPrompt({ platform: 'android', leftActive: false, elapsedMs: 2000 })).toBe(true);
  });
});

describe('needsSettings', () => {
  it('sends someone to Settings when iOS showed nothing', () => {
    expect(needsSettings({ reason: 'background_denied', osPrompted: false })).toBe(true);
    expect(needsSettings({ reason: 'foreground_denied', osPrompted: false })).toBe(true);
  });

  it('takes a real answer as final', () => {
    expect(needsSettings({ reason: 'background_denied', osPrompted: true })).toBe(false);
  });

  it('leaves every other failure alone', () => {
    expect(needsSettings({ reason: 'no_pin', osPrompted: false })).toBe(false);
    expect(needsSettings({ reason: 'start_failed' })).toBe(false);
    expect(needsSettings(null)).toBe(false);
  });
});

describe('afterAllow', () => {
  it('goes on once the permission is held', () => {
    expect(afterAllow({ enabled: true, reason: 'enabled' })).toBe('on');
  });

  it('takes a real answer as final', () => {
    expect(afterAllow({ enabled: false, reason: 'background_denied', osPrompted: true })).toBe('off');
  });

  it('offers Settings, never opening it, when no answer could be seen', () => {
    expect(afterAllow({ enabled: false, reason: 'background_denied', osPrompted: false })).toBe('offer');
  });

  it('moves on from a failure Settings cannot help', () => {
    expect(afterAllow({ enabled: false, reason: 'no_pin' })).toBe('off');
    expect(afterAllow(null)).toBe('off');
  });
});
