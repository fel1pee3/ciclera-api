import {
  hasValidEvidenceFileName,
  hasValidEvidenceSignature,
} from './evidence-file';

describe('evidence file validation', () => {
  it('requires a safe file name with an extension matching the MIME type', () => {
    expect(hasValidEvidenceFileName('inspection.JPG', 'image/jpeg')).toBe(true);
    expect(hasValidEvidenceFileName('../inspection.jpg', 'image/jpeg')).toBe(
      false,
    );
    expect(hasValidEvidenceFileName('inspection.png', 'image/jpeg')).toBe(
      false,
    );
  });

  it('checks basic image signatures instead of trusting Content-Type', () => {
    expect(
      hasValidEvidenceSignature(
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        'image/jpeg',
      ),
    ).toBe(true);
    expect(
      hasValidEvidenceSignature(Buffer.from('not-an-image'), 'image/jpeg'),
    ).toBe(false);
  });
});
