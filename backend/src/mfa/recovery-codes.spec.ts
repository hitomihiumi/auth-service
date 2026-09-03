import {
  generateRecoveryCode,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-codes';

describe('recovery codes', () => {
  it('are grouped, lowercase, and free of ambiguous characters', () => {
    for (const code of generateRecoveryCodes()) {
      expect(code).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
      // i, l, o, 0 and 1 are the pairs people mistype off a printout.
      expect(code).not.toMatch(/[ilo01]/);
    }
  });

  it('issues a full set', () => {
    expect(generateRecoveryCodes()).toHaveLength(RECOVERY_CODE_COUNT);
    expect(generateRecoveryCodes(3)).toHaveLength(3);
  });

  it('does not repeat itself', () => {
    const codes = Array.from({ length: 500 }, () => generateRecoveryCode());

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('draws on the whole alphabet rather than a biased slice of it', () => {
    const seen = new Set(
      Array.from({ length: 400 }, () => generateRecoveryCode())
        .join('')
        .replace(/-/g, ''),
    );

    expect(seen.size).toBe(31);
  });

  it('compares codes the way a user types them back', () => {
    expect(normalizeRecoveryCode('ABCDE-FGHJK')).toBe('abcdefghjk');
    expect(normalizeRecoveryCode(' abcde fghjk ')).toBe('abcdefghjk');
    expect(normalizeRecoveryCode('abcdefghjk')).toBe('abcdefghjk');
  });
});
