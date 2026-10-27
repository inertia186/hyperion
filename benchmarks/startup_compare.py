import datetime
import gzip
import hashlib
import json
import math
from pathlib import Path
import platform
import statistics
import subprocess
import tarfile

root = Path.cwd()
base = root / 'benchmarks/baselines'
reports = {v: json.loads((root / p).read_text()) for v, p in {
    'before': 'tmp/hills-startup-before-fixed.json', 'after': 'tmp/hills-startup-after.json'}.items()}
assert reports['before']['harnessSha256'] == reports['after']['harnessSha256']
assert reports['before']['browser'] == reports['after']['browser']
for report in reports.values():
    assert len(report['runs']) == 80
    for path, sha in report['harnessSha256'].items():
        assert hashlib.sha256((root / path).read_bytes()).hexdigest() == sha
    for row in report['runs']:
        assert not row['errors']
        assert all(value >= 0 for value in row['cpu'].values())
        scripts = {Path(r['name'].split('?', 1)[0]).name for r in row['resources'] if r['name'].split('?', 1)[0].endswith('.js')}
        assert scripts == {Path(p).name for p in report['build']['initialScripts']}
        if row['cache'] == 'revisit':
            assert row['jsCompressedBytes'] == 0
            assert all(row['guards'][key] for key in ['sanitized', 'headingLink', 'signingApproval'])

def p95(values):
    return sorted(values)[math.ceil(len(values) * .95) - 1]

summary = {'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
           'working_tree': subprocess.check_output(['git', 'status', '--short'], text=True).splitlines(),
           'platform': platform.platform(), 'browser': reports['after']['browser'], 'groups': []}
for profile in ['desktop', 'mobile']:
    for cache in ['cold', 'revisit']:
        group = {'profile': profile, 'cache': cache}
        for version, report in reports.items():
            rows = [r for r in report['runs'] if r['profile'] == profile and r['cache'] == cache]
            assert len(rows) == 20
            group[version] = {'samples': len(rows), 'p50_ms': statistics.median(r['readyMs'] for r in rows),
                              'p95_ms': p95([r['readyMs'] for r in rows]),
                              'js_compressed_bytes': rows[0]['jsCompressedBytes'],
                              'cpu_median_ms': {key: statistics.median(r['cpu'][key] * 1000 for r in rows) for key in rows[0]['cpu']}}
            if cache == 'revisit':
                group[version]['first_action_p95_ms'] = {key: p95([r['guards']['timings'][key] for r in rows]) for key in rows[0]['guards']['timings']}
        group['p95_reduction_percent'] = (1 - group['after']['p95_ms'] / group['before']['p95_ms']) * 100
        if cache == 'revisit':
            for key, value in group['after']['first_action_p95_ms'].items():
                assert value <= group['before']['first_action_p95_ms'][key] + 1, key
        summary['groups'].append(group)

summary['byte_reduction_percent'] = (1 - reports['after']['build']['compressedJsBytes'] / reports['before']['build']['compressedJsBytes']) * 100
assert summary['byte_reduction_percent'] >= 25
summary['desktop_latency_target_met'] = summary['groups'][0]['p95_reduction_percent'] >= 20
summary['mobile_latency_target_met'] = summary['groups'][2]['p95_reduction_percent'] >= 20
summary['source_sha256'] = {}
for version in reports:
    entry = root / ('tmp/hills-startup-before-entry.jsx' if version == 'before' else 'app/frontend/entrypoints/application.jsx')
    layout = root / f'tmp/hills-startup-{version}-layout.haml'
    summary['source_sha256'][version] = {'entrypoint': hashlib.sha256(entry.read_bytes()).hexdigest(), 'layout': hashlib.sha256(layout.read_bytes()).hexdigest()}
    output = base / f'2026-10-25-startup-{version}.json.gz'
    assert not output.exists()
    output.write_bytes(gzip.compress(json.dumps(reports[version], indent=2).encode(), mtime=0))
    log = root / ('tmp/hills-startup-before-fixed.log' if version == 'before' else 'tmp/hills-startup-after.log')
    output.with_suffix('').with_suffix('.log').write_bytes(log.read_bytes())
    archive = base / f'2026-10-25-startup-{version}-assets.tar.gz'
    assert not archive.exists()
    directory = root / f'tmp/hills-startup-{version}-build'
    with tarfile.open(archive, 'w:gz') as tar:
        for p in sorted(directory.rglob('*')):
            if p.is_file() and p.suffix in ['.json', '.js', '.css']:
                tar.add(p, arcname=p.relative_to(root / 'tmp'))
        tar.add(layout, arcname=layout.name)
        tar.add(entry, arcname=f'hills-startup-{version}-entry.jsx')
output = base / '2026-10-25-startup-summary.json'
assert not output.exists()
output.write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
