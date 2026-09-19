// S3 (ARCHITECTURE_REVIEW_GAPS.md) — before this, nothing checked a file's actual content, only
// trusted whatever Content-Type the client claimed. Magic-byte detection against the first few
// bytes, matching the allowlist the product's own upload pages accept (verify-id,
// guarantor-details, documents.component.html's `accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"`).
//
// This is NOT malware scanning — a real AV engine can't run in the Workers sandbox (no
// filesystem, no subprocess, no persistent virus-definition state); it's the same
// magic-byte/file-signature check as document-service's Tika-based one, just hand-rolled since
// there's no equivalent lightweight signature library available at the edge.

export type DetectedFileType = "application/pdf" | "image/jpeg" | "image/png" | "application/msword-or-docx" | null;

function bytesStartWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

export function detectFileType(buffer: ArrayBuffer): DetectedFileType {
  const bytes = new Uint8Array(buffer);
  // "%PDF-"
  if (bytesStartWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  // JPEG: FF D8 FF
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // .docx (a zip container): PK\x03\x04. Legacy .doc (OLE compound file): D0 CF 11 E0 A1 B1 1A E1.
  if (bytesStartWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "application/msword-or-docx";
  if (bytesStartWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "application/msword-or-docx";
  return null;
}

export function isAllowedUpload(buffer: ArrayBuffer): boolean {
  return detectFileType(buffer) !== null;
}
