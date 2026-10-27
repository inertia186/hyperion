"""Score the immutable response panel and its predeclared processing-cost guard."""
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
assert before['source_unchanged'] and after['source_unchanged']
assert before['source_sha256'].keys() == after['source_sha256'].keys()
changed = {path for path, sha in before['source_sha256'].items() if after['source_sha256'][path] != sha}
assert changed == {'app/services/hafbe_post_revisions.rb', 'app/services/post_chain_payload.rb'}
old, new = [report['response_validation'] for report in [before, after]]
assert old['scope'] == new['scope']
assert len(old['cases']) == len(new['cases']) == 37
summary = {'malformed_rejected': [0, 0], 'malformed_total': 22, 'valid_preserved': 0, 'error_controls_preserved': 0, 'large_valid_cost': {}}
for a, b in zip(old['cases'], new['cases']):
    assert {key: a[key] for key in ['id', 'component', 'method', 'kind']} == {key: b[key] for key in ['id', 'component', 'method', 'kind']}
    if a['kind'] == 'malformed':
        summary['malformed_rejected'][0] += a['controlled_rejection']
        summary['malformed_rejected'][1] += b['controlled_rejection']
        assert b['controlled_rejection'], b['id']
    elif a['kind'] == 'valid':
        assert a == b, b['id']
        summary['valid_preserved'] += 1
    else:
        assert a == b and b['controlled_rejection'], b['id']
        summary['error_controls_preserved'] += 1
assert summary['malformed_rejected'][1] == 22
assert summary['valid_preserved'] == 13 and summary['error_controls_preserved'] == 2
assert old['large_valid_boundary_cost'].keys() == new['large_valid_boundary_cost'].keys()
for name, control in old['large_valid_boundary_cost'].items():
    candidate = new['large_valid_boundary_cost'][name]
    assert len(control['samples']) == len(candidate['samples']) == 20
    added_ms = candidate['p95_ms'] - control['p95_ms']
    assert added_ms <= 20, (name, added_ms)
    summary['large_valid_cost'][name] = {'p95_ms': [control['p95_ms'], candidate['p95_ms']], 'added_p95_ms': added_ms}
# Shape validation must not change valid outputs, request accounting, or freshness.
assert before['revisions']['freshness_bodies'] == after['revisions']['freshness_bodies']
for group in ['revisions', 'content_reuse']:
    assert before[group]['cases'].keys() == after[group]['cases'].keys()
    for name, control in before[group]['cases'].items():
        candidate = after[group]['cases'][name]
        assert len(control['samples']) == len(candidate['samples']) == 20
        for a, b in zip(control['samples'], candidate['samples']):
            for key in (['requests', 'status', 'payload_sha256'] if group == 'revisions' else ['calls', 'value']):
                assert a[key] == b[key], (group, name, key)
summary['peak_process_rss_mib'] = []
for path in sys.argv[1:3]:
    log = Path(path.split('.json')[0] + '.log').read_text()
    summary['peak_process_rss_mib'].append(int(re.search(r'(\d+)\s+maximum resident set size', log).group(1)) / 1024**2)
summary['target_met'] = True
Path(sys.argv[3]).write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
