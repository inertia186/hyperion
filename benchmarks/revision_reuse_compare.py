"""Compare the frozen revision matrix while guarding all other measured behavior."""
from collections import Counter
import gzip
import json
from pathlib import Path
import re
import sys

def read(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if path.endswith('.gz') else raw)

before, after = [read(path) for path in sys.argv[1:3]]
for key in ['commit', 'harness_sha256', 'fixtures_sha256', 'ruby', 'rails', 'postgres', 'frozen_time', 'samples', 'donor_commit']:
    assert before[key] == after[key], key
assert before['samples'] == 20 and before['source_unchanged'] and after['source_unchanged']
assert before['source_sha256'].keys() == after['source_sha256'].keys()
assert {p for p, sha in before['source_sha256'].items() if after['source_sha256'][p] != sha} == {
    'app/controllers/api/v1/posts_controller.rb', 'app/services/hafbe_post_revisions.rb'}
old, new = [report['revisions'] for report in [before, after]]
assert old['upstream_delay_ms'] == new['upstream_delay_ms'] == 10
assert old['freshness_bodies'] == new['freshness_bodies'] == ['Fresh first', 'Fresh second']
assert old['cases'].keys() == new['cases'].keys()
summary = {'cases': {}, 'harness_unchanged': True, 'payloads_unchanged': True}
total_old = total_new = 0
for name, control in old['cases'].items():
    candidate = new['cases'][name]
    assert len(control['samples']) == len(candidate['samples']) == 20
    for a, b in zip(control['samples'], candidate['samples']):
        assert a['payload_sha256'] == b['payload_sha256'] and a['status'] == b['status'], name
        assert set(a['requests']) == set(b['requests']), name
        assert max(Counter(b['requests']).values()) == 1, name
        total_old += len(a['requests'])
        total_new += len(b['requests'])
    assert candidate['p95_ms'] <= control['p95_ms'] * 1.1, name
    if name in ['full', 'cross_post']:
        assert candidate['p95_ms'] < control['p95_ms'], name
    summary['cases'][name] = {
        'requests': [len(control['samples'][0]['requests']), len(candidate['samples'][0]['requests'])],
        'p95_ms': [control['p95_ms'], candidate['p95_ms']],
        'p95_reduction_percent': (1 - candidate['p95_ms'] / control['p95_ms']) * 100,
        'median_allocations': [sorted(row['allocations'] for row in case['samples'])[9] for case in [control, candidate]]}
assert before['response_validation']['cases'] == after['response_validation']['cases']
for name, control in before['content_reuse']['cases'].items():
    candidate = after['content_reuse']['cases'][name]
    assert len(control['samples']) == len(candidate['samples']) == 20
    for a, b in zip(control['samples'], candidate['samples']):
        assert a['calls'] == b['calls'] and a['value'] == b['value'], name
summary['total_measured_hafbe_fetches'] = [total_old, total_new]
summary['peak_process_rss_mib'] = []
for path in sys.argv[1:3]:
    log = Path(path.split('.json')[0] + '.log').read_text()
    summary['peak_process_rss_mib'].append(int(re.search(r'(\d+)\s+maximum resident set size', log).group(1)) / 1024**2)
summary['target_met'] = True
Path(sys.argv[3]).write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
