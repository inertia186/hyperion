"""Check the fixed content-sharing workload and isolated FileStore controls."""
from collections import Counter
import gzip
import json
import math
from pathlib import Path
import re
import statistics
import sys


def read(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if path.endswith('.gz') else raw)


def calls(row):
    return Counter((call['method'], tuple(call['identity'])) for call in row['calls'])


def content_count(row):
    return sum(count for (method, _), count in calls(row).items() if method == 'get_content')


def p95(rows):
    return sorted(row['wall_ms'] for row in rows)[math.ceil(len(rows) * .95) - 1]


before, after, file_before, file_after = [read(path) for path in sys.argv[1:5]]
for key in ['commit', 'harness_sha256', 'fixtures_sha256', 'ruby', 'rails', 'postgres', 'frozen_time', 'samples', 'donor_commit']:
    assert before[key] == after[key], key
assert before['samples'] == 20
assert before['source_unchanged'] and after['source_unchanged']
assert before['source_sha256'].keys() == after['source_sha256'].keys()
changed = {path for path, sha in before['source_sha256'].items() if after['source_sha256'][path] != sha}
assert changed == {'app/services/post_chain_payload.rb'}, changed
for key in ['rpc_delay_ms', 'cache', 'ttl_seconds']:
    assert before['content_reuse'][key] == after['content_reuse'][key], key
expected = {'stats_then_payout': (2, 1), 'payout_then_stats': (2, 1), 'warm_revisit': (0, 0),
            'expired': (2, 1), 'forced_refresh': (1, 1), 'different_identity': (4, 2), 'different_account': (0, 0)}
assert before['content_reuse']['cases'].keys() == after['content_reuse']['cases'].keys() == expected.keys()
summary = {'content_reuse': {}, 'file_store': {}}
for name, (old_count, new_count) in expected.items():
    control, candidate = [report['content_reuse']['cases'][name] for report in [before, after]]
    assert len(control['samples']) == len(candidate['samples']) == 20
    assert candidate['p95_ms'] <= control['p95_ms'] * 1.1, name
    for a, b in zip(control['samples'], candidate['samples']):
        assert (content_count(a), content_count(b)) == (old_count, new_count), name
        # Only duplicate content calls may disappear; metadata and identities stay fixed.
        desired = calls(a)
        for key in desired:
            if key[0] == 'get_content':
                desired[key] = 1
        assert calls(b) == desired, name
        value = json.loads(json.dumps(a['value']))
        if name == 'forced_refresh':
            assert value[0] == b['value'][0]
            assert value[1]['payout'] == '1.000 HBD' and value[1]['payout_amount'] == '1.0'
            value[1].update(payout='2.000 HBD', payout_amount='2.0')
        assert value == b['value'], name
    summary['content_reuse'][name] = {
        'content_calls': [old_count, new_count],
        'total_rpc_calls': [len(control['samples'][0]['calls']), len(candidate['samples'][0]['calls'])],
        'p95_ms': [control['p95_ms'], candidate['p95_ms']],
        'p95_reduction_percent': 100 * (1 - candidate['p95_ms'] / control['p95_ms']),
        'median_allocations': [statistics.median(row['allocations'] for row in case['samples']) for case in [control, candidate]]}

# The retained revision and malformed-result behavior must survive this change.
assert before['revisions']['freshness_bodies'] == after['revisions']['freshness_bodies']
assert before['revisions']['cases'].keys() == after['revisions']['cases'].keys()
for name, control in before['revisions']['cases'].items():
    candidate = after['revisions']['cases'][name]
    assert len(control['samples']) == len(candidate['samples']) == 20
    for a, b in zip(control['samples'], candidate['samples']):
        assert all(a[key] == b[key] for key in ['requests', 'status', 'payload_sha256']), name
assert before['response_validation']['cases'] == after['response_validation']['cases']
assert len(after['response_validation']['cases']) == 37
assert after['response_validation']['rejected_malformed'] == 22

for key in ['ruby', 'rails', 'harness_sha256', 'production_config_sha256', 'framework_default_store',
            'scope', 'samples_per_case', 'content_delay_ms', 'other_rpc_delay_ms']:
    assert file_before[key] == file_after[key], key
assert file_after['framework_default_store'] == 'file_store'
assert file_after['samples_per_case'] == 20
for main, file in [(before, file_before), (after, file_after)]:
    assert main['source_sha256']['app/services/post_chain_payload.rb'] == file['source_sha256']
assert file_before['cases'].keys() == file_after['cases'].keys() == {'sequential', 'concurrent'}
for name in ['sequential', 'concurrent']:
    control, candidate = [report['cases'][name] for report in [file_before, file_after]]
    assert len(control) == len(candidate) == 20
    new_count = 1 if name == 'sequential' else 2
    for a, b in zip(control, candidate):
        assert (content_count(a), content_count(b)) == (2, new_count), name
        expected_calls = calls(a)
        for key in expected_calls:
            if key[0] == 'get_content':
                expected_calls[key] = new_count
        assert calls(b) == expected_calls
        # This probe uses wall time, unlike the frozen main persistence workload.
        assert [{k: v for k, v in r.items() if k != 'payout_fetched_at'} for r in a['results']] == [
            {k: v for k, v in r.items() if k != 'payout_fetched_at'} for r in b['results']]
        assert all(r['payout_fetched_at'] for r in b['results'])
    summary['file_store'][name] = {'content_calls': [2, new_count], 'p95_ms': [p95(control), p95(candidate)]}
summary['peak_process_rss_mib'] = []
for path in sys.argv[1:3]:
    log = Path(path.split('.json')[0] + '.log').read_text()
    summary['peak_process_rss_mib'].append(int(re.search(r'(\d+)\s+maximum resident set size', log).group(1)) / 1024**2)
summary['target_met'] = True
summary['concurrent_cold_misses_coalesced'] = False
Path(sys.argv[5]).write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
