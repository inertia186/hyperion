"""Verify completeness and summarize the four borrowed-hill baseline reports."""
import gzip
import json
from pathlib import Path
import sys

def read(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if path.endswith('.gz') else raw)

rails, preview = [read(path) for path in sys.argv[1:3]]
assert rails['commit'] == preview['commit'] and rails['source_unchanged']
assert rails['samples'] == preview['samples_per_case'] == 20
assert len(rails['revisions']['cases']) == 5
assert len(rails['content_reuse']['cases']) == 7
assert len(preview['cases']) == 4
summary = {'commit': rails['commit'], 'revisions': {}, 'content_reuse': {}, 'preview': {}}
for name, case in rails['revisions']['cases'].items():
    rows = case['samples']
    assert len(rows) == 20
    assert len({row['payload_sha256'] for row in rows}) == 1
    count = sorted({len(row['requests']) for row in rows})
    assert len(count) == 1
    summary['revisions'][name] = {'requests': count[0], 'p95_ms': case['p95_ms']}
assert rails['revisions']['freshness_bodies'] == ['Fresh first', 'Fresh second']
for name, case in rails['content_reuse']['cases'].items():
    rows = case['samples']
    assert len(rows) == 20
    calls = sorted({len(row['calls']) for row in rows})
    content = sorted({sum(call['method'] == 'get_content' for call in row['calls']) for row in rows})
    assert len(calls) == len(content) == 1
    summary['content_reuse'][name] = {'rpc_calls': calls[0], 'content_calls': content[0], 'p95_ms': case['p95_ms'],
                                    'payout_values': [value['payout'] for value in rows[0]['value']]}
for name, case in preview['cases'].items():
    rows = case['samples']
    assert len(rows) == 20
    summary['preview'][name] = {'issued_per_trace': sorted({len(row['calls']) for row in rows}),
                              'obsolete_completions_per_trace': sorted({row['completed_obsolete'] for row in rows}),
                              'aborts_per_trace': sorted({row['aborted'] for row in rows}),
                              'peak_in_flight': max(row['peak_in_flight'] for row in rows),
                              'p95_latest_ready_ms': case['p95_latest_ready_ms']}
validation = rails['response_validation']
cases = validation['cases']
assert len(cases) == len({row['id'] for row in cases}) == 37
assert sum(row['kind'] == 'malformed' for row in cases) == validation['malformed'] == 22
assert sum(row['kind'] == 'valid' and row['error'] is None for row in cases) == validation['valid_accepted'] == 13
assert sum(row['kind'] == 'error' and row['controlled_rejection'] for row in cases) == 2
assert all(len(row['samples']) == 20 for row in validation['large_valid_boundary_cost'].values())
summary['response_validation'] = {key: validation[key] for key in ['scope', 'malformed', 'rejected_malformed', 'valid_accepted']}
summary['response_validation']['large_valid_boundary_p95_ms'] = {key: row['p95_ms'] for key, row in validation['large_valid_boundary_cost'].items()}
summary['response_validation']['components'] = {
    component: {'malformed': sum(row['component'] == component and row['kind'] == 'malformed' for row in cases),
                'rejected': sum(row['component'] == component and row['kind'] == 'malformed' and row['controlled_rejection'] for row in cases)}
    for component in ['hafbe', 'condenser']}
Path(sys.argv[3]).write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
