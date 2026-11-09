import { recordsLivenessAudio } from '../config/livenessAudio';

describe('recordsLivenessAudio', () => {
  it('stays off unless the workflow asked', () => {
    expect(recordsLivenessAudio({})).toBe(false);
    expect(recordsLivenessAudio({ livenessAudio: false })).toBe(false);
    expect(recordsLivenessAudio({ livenessAudio: true })).toBe(true);
  });

  it('needs a liveness recording to put sound on', () => {
    expect(recordsLivenessAudio({ livenessAudio: true, enableLiveness: false })).toBe(false);
    expect(recordsLivenessAudio({ livenessAudio: true, enableSelfie: false })).toBe(false);
    expect(recordsLivenessAudio({ livenessAudio: true, subjectType: 'business' })).toBe(false);
  });

  it('follows the scope on a scoped flow', () => {
    expect(recordsLivenessAudio({ livenessAudio: true, scope: 'biometric-authentication' })).toBe(true);
    expect(recordsLivenessAudio({ livenessAudio: true, scope: 'biometric-enrollment' })).toBe(true);
    expect(recordsLivenessAudio({ livenessAudio: true, scope: 'address' })).toBe(false);
  });
});
