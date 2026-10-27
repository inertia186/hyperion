"""Alternate the frozen pre-change sources and candidate for the single-post guard."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path.cwd()
base = root / 'benchmarks/baselines'
before = json.loads(gzip.decompress((base / '2026-10-25-bulk-read-before.json.gz').read_bytes()))
after = json.loads(gzip.decompress((base / '2026-10-25-bulk-read-after.json.gz').read_bytes()))
paths = [p for p in before['source_sha256'] if before['source_sha256'][p] != after['source_sha256'][p]]
candidate = {p: (root / p).read_bytes() for p in paths}
control = {p: subprocess.check_output(['git', 'show', before['commit'] + ':' + p]) for p in paths}
for p in paths:
    assert hashlib.sha256(control[p]).hexdigest() == before['source_sha256'][p], p
    assert hashlib.sha256(candidate[p]).hexdigest() == after['source_sha256'][p], p
env = os.environ | dict(RAILS_ENV='test', RBENV_VERSION='3.3.11',
                        DATABASE_URL='postgresql:///hyperion_hills_test?gssencmode=disable')
env['PATH'] = str(Path.home() / '.nvm/versions/node/v26.12.0/bin') + ':' + env['PATH']
try:
    for iteration, version in enumerate(['before', 'after', 'after', 'before'], 1):
        for p in paths:
            assert (root / p).read_bytes() in (control[p], candidate[p]), 'Unexpected source edit: ' + p
            (root / p).write_bytes((control if version == 'before' else candidate)[p])
        name = f'2026-10-25-bulk-read-single-{iteration}-{version}'
        output = root / 'tmp' / (name + '.json')
        log = base / (name + '.log')
        assert not output.exists() and not log.exists()
        with log.open('w') as stream:
            result = subprocess.run(['rbenv', 'exec', 'bundle', 'exec', 'rails', 'runner', 'tmp/hills-bulk-single.rb'],
                                    env=env | {'HILLS_OUTPUT': str(output)}, stdout=stream, stderr=subprocess.STDOUT)
        assert result.returncode == 0, log
        target = base / (name + '.json.gz')
        assert not target.exists()
        target.write_bytes(gzip.compress(output.read_bytes(), mtime=0))
        print(name, flush=True)
finally:
    for p in paths:
        assert (root / p).read_bytes() in (control[p], candidate[p]), 'Unexpected source edit: ' + p
        (root / p).write_bytes(candidate[p])
target = base / '2026-10-25-bulk-read-single-driver.rb.gz'
assert not target.exists()
target.write_bytes(gzip.compress((root / 'tmp/hills-bulk-single.rb').read_bytes(), mtime=0))
