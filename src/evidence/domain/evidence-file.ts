const extensionsByContentType: Readonly<Record<string, ReadonlySet<string>>> = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
};

export function hasValidEvidenceFileName(
  fileName: string,
  contentType: string,
): boolean {
  const trimmed = fileName.trim();
  if (
    !trimmed ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    return false;
  }
  const extension = trimmed.split('.').pop()?.toLowerCase();
  return extension
    ? (extensionsByContentType[contentType]?.has(extension) ?? false)
    : false;
}

export function hasValidEvidenceSignature(
  content: Buffer,
  contentType: string,
): boolean {
  if (contentType === 'image/jpeg') {
    return (
      content.length >= 3 &&
      content[0] === 0xff &&
      content[1] === 0xd8 &&
      content[2] === 0xff
    );
  }
  if (contentType === 'image/png') {
    return (
      content.length >= 8 &&
      content
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (contentType === 'image/webp') {
    return (
      content.length >= 12 &&
      content.subarray(0, 4).toString('ascii') === 'RIFF' &&
      content.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}
