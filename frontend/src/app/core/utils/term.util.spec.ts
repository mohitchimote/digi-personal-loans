import { initialTerm } from './term.util';

describe('initialTerm', () => {
  it('keeps the requested term when the product allows it (60 on a 24-60 product)', () => {
    expect(initialTerm(60, 24, 60)).toBe(60);
  });
  it('does not default to the product minimum', () => {
    expect(initialTerm(48, 24, 60)).toBe(48);
  });
  it('clamps up to the product minimum', () => {
    expect(initialTerm(12, 24, 60)).toBe(24);
  });
  it('clamps down to the product maximum', () => {
    expect(initialTerm(84, 6, 36)).toBe(36);
  });
  it('falls back to the minimum when nothing was requested', () => {
    expect(initialTerm(undefined, 12, 84)).toBe(12);
    expect(initialTerm(0, 12, 84)).toBe(12);
  });
});
