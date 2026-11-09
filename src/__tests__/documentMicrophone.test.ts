import { askForMicrophone } from '../services/device-intel/microphone';

describe('askForMicrophone', () => {
  const ask = (over: Partial<Parameters<typeof askForMicrophone>[0]>) =>
    askForMicrophone({ hasPermission: false, declared: () => true, request: async () => true, ...over });

  it('asks nothing when it is already granted', async () => {
    const request = jest.fn();
    await expect(ask({ hasPermission: true, request })).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('NEVER asks when the host did not declare it: iOS would close the app', async () => {
    const request = jest.fn();
    await expect(ask({ declared: () => false, request })).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('reports the answer', async () => {
    await expect(ask({})).resolves.toBe(true);
    await expect(ask({ request: async () => false })).resolves.toBe(false);
  });

  it('treats a failed request as a silent clip', async () => {
    await expect(ask({ request: () => Promise.reject(new Error('nope')) })).resolves.toBe(false);
  });
});
