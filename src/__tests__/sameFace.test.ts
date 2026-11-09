import { documentHintIsAction, documentHintText } from '../capture/hints';
import { stillSameFace, wordsOf } from '../capture/sameFace';

const FRONT = ['INDEPENDENT NATIONAL ELECTORAL COMMISSION', 'PERMANENT VOTER CARD', 'NAME ADA OBI', 'OCCUPATION TRADER', 'DELIM 12 03 45'];
const BACK = ['This card is the property of the commission', 'If found return to the nearest office'];

describe('stillSameFace', () => {
  it('recognises the front held up again, misread words and all', () => {
    const reread = ['INDEPENDENT NATI0NAL ELECTORAL COMMISSION', 'PERMANENT VOTER CARD', 'NAME OBI', 'OCCUPATION TRADER'];
    expect(stillSameFace(wordsOf(FRONT), reread)).toBe(true);
  });

  it('lets a back through, even one sharing a word or two with the front', () => {
    expect(stillSameFace(wordsOf(FRONT), BACK)).toBe(false);
  });

  it('says nothing about a front with too little text to judge by', () => {
    expect(stillSameFace(wordsOf(['VOTER CARD']), ['VOTER CARD'])).toBe(false);
    expect(stillSameFace(null, FRONT)).toBe(false);
  });

  it('lets an empty frame through to the ordinary gates', () => {
    expect(stillSameFace(wordsOf(FRONT), [])).toBe(false);
  });
});

describe('the showBack hint', () => {
  it('tells the person what to do, by the name of the document', () => {
    expect(documentHintText('showBack', 'PVC')).toBe("That's still the front. Turn your PVC over");
    expect(documentHintIsAction('showBack')).toBe(true);
  });
});
