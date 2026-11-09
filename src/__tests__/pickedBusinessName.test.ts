import { pickedBusinessName } from '../config/businessSearch';

describe('the name kept for a picked search result', () => {
  it('drops the sandbox outcome label, so the documents match the register', () => {
    expect(pickedBusinessName('Transika Sandbox No Key People Ltd')).toBe('Transika Ltd');
    expect(pickedBusinessName('Transika Sandbox Ltd')).toBe('Transika Ltd');
    expect(pickedBusinessName('Transika Sandbox Late Shareholders Ltd')).toBe('Transika Ltd');
  });
  it('leaves a real company name alone', () => {
    expect(pickedBusinessName('Sandbox Holdings Ltd')).toBe('Sandbox Holdings Ltd');
    expect(pickedBusinessName('GCB Bank PLC')).toBe('GCB Bank PLC');
  });
});
