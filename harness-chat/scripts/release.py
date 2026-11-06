"""Create a deterministic ZIP with a SHA-256 manifest (no secrets or generated caches)."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / 'NVIDIA_Harness_Studio_v0.11_Reliability.zip'
ignore_parts = {'.git', '__pycache__', 'node_modules', 'dist', '.venv', 'coverage', '.cache', '.pytest_cache'}
ignore_names = {'.env', '.DS_Store', 'RELEASE_MANIFEST.json', '.npmrc', '.pypirc', 'id_rsa', 'id_ed25519'}
files = [p for p in root.rglob('*') if p.is_file() and p.name not in ignore_names
         and not any(part in ignore_parts for part in p.relative_to(root).parts)
         and not any((part.startswith('.env.') and part != '.env.example') for part in p.relative_to(root).parts)
         and p.suffix.lower() not in {'.pem', '.key', '.p12', '.pfx'}]
files.sort(key=lambda p: p.relative_to(root).as_posix())
assert (root/'.env.example') in files, 'Arquivo de configuração de exemplo ausente do ZIP'
manifest = {
    'product': 'NVIDIA Harness Studio', 'version': '0.11.0',
    'generated_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
    'validation': {
        'status': 'Ver resultados reais de ./check.sh e docs/QUALIDADE.md.',
        'not_executed_here': ['real Docker build', 'real NVIDIA API', 'real Lean/Mathlib', 'React/Vite production build']
    },
    'files': [{'path': p.relative_to(root).as_posix(), 'size': p.stat().st_size,
               'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
}
(root/'RELEASE_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in files+[root/'RELEASE_MANIFEST.json']:
        info=zipfile.ZipInfo('nvidia-harness-studio/'+p.relative_to(root).as_posix(),date_time=(2026,11,4,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=((0o755 if p.suffix=='.sh' else 0o644)<<16)
        z.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
print(json.dumps({'zip':str(out),'files':len(files)+1,'size':out.stat().st_size},ensure_ascii=False))
