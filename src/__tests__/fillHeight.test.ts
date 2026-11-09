import { fillHeightOf } from '../components/useFillHeight';

// Mirrors the Flutter SDK's fill_remaining_test.dart: the map and Street View
// fill a tall phone's spare height and keep their usual height on a short one.

describe('the height a map or panorama draws at', () => {
  it('takes what its box measured on a tall screen', () => {
    expect(fillHeightOf(664.4, 300)).toBe(664);
  });

  it('never goes below its usual height', () => {
    expect(fillHeightOf(120, 300)).toBe(300);
  });

  it('uses its usual height before the box has been measured', () => {
    expect(fillHeightOf(null, 300)).toBe(300);
    expect(fillHeightOf(Number.NaN, 300)).toBe(300);
  });
});
