import { clampProfile, DEFAULT_PROFILE, displayMode, type Profile } from '../profile';

describe('display mode', () => {
  it('defaults to simple for beginners and detailed otherwise', () => {
    expect(displayMode({ ...DEFAULT_PROFILE, experience: 'new' })).toBe('simple');
    expect(displayMode({ ...DEFAULT_PROFILE, experience: 'some' })).toBe('detailed');
    expect(displayMode({ ...DEFAULT_PROFILE, experience: 'experienced' })).toBe('detailed');
  });

  it("keeps the user's choice over the default", () => {
    expect(displayMode({ ...DEFAULT_PROFILE, experience: 'new', display: 'detailed' })).toBe('detailed');
    expect(displayMode({ ...DEFAULT_PROFILE, experience: 'experienced', display: 'simple' })).toBe('simple');
  });

  it('drops an invalid stored value', () => {
    expect(clampProfile({ ...DEFAULT_PROFILE, display: 'fancy' } as unknown as Profile).display).toBeUndefined();
  });
});
