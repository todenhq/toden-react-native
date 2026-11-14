import { describeSendError } from '../services/contactErrors';
import { VerificationApiError } from '../services/api';

// A work-address-only workflow refuses a free-provider email with the usual
// invalid_destination and a reason. Every other refusal keeps its copy.
const refusal = (body: Record<string, unknown>): VerificationApiError =>
  new VerificationApiError('refused', 400, body.error as string, body);

describe('a refused personal email', () => {
  it('asks for a work address when the server wants one', () => {
    expect(describeSendError(refusal({ error: 'invalid_destination', reason: 'corporate_email_required' }))).toBe(
      'Use your work email address. Personal email services such as Gmail are not accepted here.',
    );
  });

  it('keeps the old copy for any other invalid destination', () => {
    const old = 'That does not look valid. Please check and try again.';
    expect(describeSendError(refusal({ error: 'invalid_destination' }))).toBe(old);
    expect(describeSendError(refusal({ error: 'invalid_destination', reason: 'something_else' }))).toBe(old);
  });
});
