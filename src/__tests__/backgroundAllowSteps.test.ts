import { backgroundAllowSteps, backgroundSettingsSteps } from '../presence/background-allow-steps';

describe('backgroundAllowSteps', () => {
  it('names the iOS upgrade prompt', () => {
    const steps = backgroundAllowSteps({ platform: 'ios', foregroundGranted: true });
    expect(steps.tap).toBe('Change to Always Allow');
    expect(steps.lead).toBe('Next, your phone will ask. Tap:');
  });

  it('warns of the first iOS prompt when location is not allowed yet', () => {
    const steps = backgroundAllowSteps({ platform: 'ios', foregroundGranted: false });
    expect(steps.lead).toContain('Allow While Using App');
    expect(steps.tap).toBe('Change to Always Allow');
  });

  it('sends Android 11 and later to the settings page', () => {
    const steps = backgroundAllowSteps({ platform: 'android', androidApi: 34, foregroundGranted: true });
    expect(steps.lead).toContain('location settings');
    expect(steps.tap).toBe('Allow all the time');
  });

  it('warns of the first Android prompt when location is not allowed yet', () => {
    const steps = backgroundAllowSteps({ platform: 'android', androidApi: 30, foregroundGranted: false });
    expect(steps.lead).toContain('While using the app');
    expect(steps.tap).toBe('Allow all the time');
  });

  it('keeps Android 10 in a dialog, not settings', () => {
    const steps = backgroundAllowSteps({ platform: 'android', androidApi: 29, foregroundGranted: true });
    expect(steps.lead).toBe('Next, your phone will ask. Tap:');
    expect(steps.tap).toBe('Allow all the time');
  });

  it('never names "all the time" before Android 10, which has no such option', () => {
    const steps = backgroundAllowSteps({ platform: 'android', androidApi: 28, foregroundGranted: false });
    expect(steps.tap).toBe('Allow');
  });

  it('reads an unknown Android version as a current phone', () => {
    const steps = backgroundAllowSteps({ platform: 'android', foregroundGranted: true });
    expect(steps.tap).toBe('Allow all the time');
    expect(steps.lead).toContain('location settings');
  });
});

describe('backgroundSettingsSteps', () => {
  it('names the option each platform has in Settings', () => {
    expect(backgroundSettingsSteps('ios').tap).toBe('Always');
    expect(backgroundSettingsSteps('android').tap).toBe('Allow all the time');
  });
});
