import { verifyDocumentIdentity } from '../capture/documentIdentity';
import { detectDocumentType, hasDocumentSignals } from '../capture/documentSignals';

// A NIN slip had no word list, so auto-capture could not check what was in the
// frame and shot a voter's card held where the slip should be. The lists mirror
// the server's DOCUMENT_SIGNALS (kyc-core src/lib/ocr-parser.ts).

const PAPER_SLIP = [
  'FEDERAL REPUBLIC OF NIGERIA',
  'NATIONAL IDENTITY MANAGEMENT COMMISSION',
  'National Identification Number Slip (NINS)',
  'Tracking ID: ABC123XYZ',
];
const DIGITAL_SLIP = ['FEDERAL REPUBLIC OF NIGERIA', 'DIGITAL NIN SLIP', 'NATIONAL IDENTITY MANAGEMENT SYSTEM'];
const VOTER_CARD = [
  'FEDERAL REPUBLIC OF NIGERIA',
  'INDEPENDENT NATIONAL ELECTORAL COMMISSION',
  "VOTER'S CARD",
  'VIN 90F5 AEF5 1B41 6491 787',
];

const asSlip = { country: 'NG', idType: 'nin-slip' } as const;

describe('NIN slip identity', () => {
  it('has signals to check against', () => {
    expect(hasDocumentSignals('NG', 'nin-slip')).toBe(true);
  });

  it('identifies a paper slip and a digital slip', () => {
    expect(detectDocumentType(PAPER_SLIP, 'NG').type).toBe('nin-slip');
    expect(verifyDocumentIdentity(PAPER_SLIP, asSlip).identified).toBe(true);
    expect(verifyDocumentIdentity(DIGITAL_SLIP, asSlip).identified).toBe(true);
  });

  it("refuses a voter's card held in place of the slip", () => {
    const r = verifyDocumentIdentity(VOTER_CARD, asSlip);
    expect(r.identified).toBe(false);
    expect(r.hint).toBe('wrongDocument');
  });

  it("does not take a driver's licence that prints a NIN field", () => {
    const dl = ['FEDERAL ROAD SAFETY CORPS', 'DRIVING LICENCE', 'NIN 12345678901'];
    expect(verifyDocumentIdentity(dl, asSlip).identified).toBe(false);
  });

  it('does not fire on a text-dense page that names no slip', () => {
    const page = ['FEDERAL REPUBLIC OF NIGERIA', 'SURNAME', 'FIRST NAME', 'DATE OF BIRTH', 'ADDRESS', 'SEX'];
    expect(verifyDocumentIdentity(page, asSlip).identified).toBe(false);
  });
});
