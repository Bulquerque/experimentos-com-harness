"""Small PDF-to-text bridge. Install: pip install pypdf. No OCR/scanned PDF support."""
import io
import sys
from pypdf import PdfReader

try:
    raw = sys.stdin.buffer.read(3_200_000)
    reader = PdfReader(io.BytesIO(raw), strict=False)
    if len(reader.pages) > 150:
        raise ValueError('PDF excede 150 páginas.')
    text = '\n\n'.join((p.extract_text() or '') for p in reader.pages)
    print(text[:150_000])
except Exception as exc:
    print('Falha ao extrair PDF: ' + str(exc), file=sys.stderr)
    sys.exit(1)
