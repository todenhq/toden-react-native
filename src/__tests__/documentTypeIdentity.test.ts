import { verifyDocumentIdentity } from '../capture/documentIdentity';
import { countSignalHits, foldAccents } from '../capture/documentSignals';
import { documentHintText } from '../capture/hints';

// Every document type's front, as it is actually printed (accents included),
// must identify as that document, or the camera holds at "move closer" for
// good. Mirrors the Flutter SDK's document_type_gates_test.dart, whose texts
// these are: a Ghana Card, a Nigerian or Ghanaian driver's licence and a Côte
// d'Ivoire CNI or residence card failed before.

const FRONTS: [string, string, string, string[]][] = [
  ["NG driver's licence", 'NG', 'drivers-license', ['FEDERAL REPUBLIC OF NIGERIA', "NATIONAL DRIVER'S LICENCE", 'LIC NO ABC12345AA12', 'SURNAME OKAFOR', 'CLASS B']],
  ["NG voter's card", 'NG', 'pvc', ['INDEPENDENT NATIONAL ELECTORAL COMMISSION', "VOTER'S CARD", 'VIN 90F5B1C2D3E4']],
  ['NG NIN slip', 'NG', 'nin-slip', ['NATIONAL IDENTITY MANAGEMENT SYSTEM', 'NATIONAL IDENTIFICATION NUMBER SLIP (NINS)', 'TRACKING ID ABC123XYZ']],
  ['GH Ghana Card', 'GH', 'ghana-card', ['ECOWAS IDENTITY CARD', 'REPUBLIC OF GHANA', 'PERSONAL ID NUMBER', 'GHA-123456789-0', 'SURNAME MENSAH']],
  ["GH voter's card", 'GH', 'voters', ['ELECTORAL COMMISSION OF GHANA', 'VOTER ID CARD']],
  ["GH driver's licence", 'GH', 'drivers-license', ['REPUBLIC OF GHANA', 'DRIVER AND VEHICLE LICENSING AUTHORITY', 'DRIVING LICENCE', 'SURNAME MENSAH']],
  ['GH SSNIT', 'GH', 'ssnit', ['SOCIAL SECURITY AND NATIONAL INSURANCE TRUST', 'SSNIT BIOMETRIC CARD']],
  ['KE national ID', 'KE', 'national-id', ['JAMHURI YA KENYA', 'REPUBLIC OF KENYA', 'ID NUMBER 12345678']],
  ['ZA national ID', 'ZA', 'national-id', ['REPUBLIC OF SOUTH AFRICA', 'NATIONAL IDENTITY CARD', 'IDENTITY NUMBER 9001155800085']],
  ['CI CNI', 'CI', 'cni', ["RÉPUBLIQUE DE CÔTE D'IVOIRE", "CARTE NATIONALE D'IDENTITÉ", 'NOM KOUASSI', 'PRÉNOMS AYA']],
  ['CI residence card', 'CI', 'residence-card', ["RÉPUBLIQUE DE CÔTE D'IVOIRE", 'CARTE DE SÉJOUR', 'TITRE DE SÉJOUR', 'NOM DIALLO']],
  ['Global documents ID (FR)', 'FR', 'national-id', ['RÉPUBLIQUE FRANÇAISE', "CARTE NATIONALE D'IDENTITÉ"]],
];

describe('every document front identifies as itself', () => {
  it.each(FRONTS)('%s', (_name, country, idType, lines) => {
    const result = verifyDocumentIdentity(lines, { country, idType });
    expect(result).toEqual(expect.objectContaining({ identified: true }));
  });

  it('still refuses a different document', () => {
    const pvc = ['INDEPENDENT NATIONAL ELECTORAL COMMISSION', "VOTER'S CARD", 'VIN 90F5B1C2D3E4'];
    expect(verifyDocumentIdentity(pvc, { country: 'NG', idType: 'drivers-license' })).toEqual({
      identified: false,
      hint: 'wrongDocument',
    });
  });
});

describe('foldAccents', () => {
  it('reads accented capitals as the plain keywords', () => {
    expect(foldAccents("RÉPUBLIQUE DE CÔTE D'IVOIRE")).toBe("REPUBLIQUE DE COTE D'IVOIRE");
    expect(countSignalHits("CARTE NATIONALE D'IDENTITÉ", ['IDENTITE'])).toBe(1);
  });
});

describe('the wrong-document hint', () => {
  it('reads as English whatever the label starts with', () => {
    expect(documentHintText('wrongDocument', 'International Passport')).toBe(
      "That doesn't look like your International Passport",
    );
    expect(documentHintText('wrongDocument', 'NIN (Slip)')).toBe("That doesn't look like your NIN (Slip)");
  });

  it('has no em dash in any hint', () => {
    for (const hint of ['searching', 'moreLight', 'wrongDocument', 'showMrz', 'moveCloser', 'moveBack', 'centre'] as const) {
      expect(documentHintText(hint, 'ID card')).not.toContain('—');
    }
  });
});
