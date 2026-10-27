"""Check the fixed indexing comparison and resource limits from HILLS.md."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

def read(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if str(path).endswith('.gz') else raw)

before, after = [read(path) for path in sys.argv[1:3]]
for key in ['harness_sha256', 'inbox_sha256', 'commit', 'ruby', 'rails', 'postgres', 'hardware', 'os', 'frozen_time', 'workload', 'indexing_samples']:
    assert before[key] == after[key], key
assert before['workload'] == 'indexing' and before['indexing_samples'] == 10
assert before['checks'] == after['checks'] and len(before['checks']) == 95
assert all(row['passed'] for row in before['checks'])
assert before['indexing']['recovery'] == after['indexing']['recovery']
summary = {'limits': {'peak_rss_mib': 256, 'measured_transaction_seconds': 10}, 'cases': {}}
violations = []
for version, report in [('before', before), ('after', after)]:
    prefix = Path(sys.argv[1 if version == 'before' else 2]).name.split('.json')[0]
    base = Path(sys.argv[1]).parent
    source = gzip.decompress((base / (prefix + '.rb.gz')).read_bytes())
    assert hashlib.sha256(source).hexdigest() == report['indexer_sha256']
    log = (base / (prefix + '.log')).read_text()
    peak_rss = int(re.search(r'(\d+)\s+maximum resident set size', log).group(1)) / 1024**2
    assert peak_rss <= 256, peak_rss
    rows = [row for samples in report['indexing']['samples'].values() for row in samples]
    max_transaction = max(row['transaction_ms'] for row in rows) / 1000
    assert max_transaction <= 10, max_transaction
    summary[version] = {'peak_rss_mib': peak_rss, 'max_measured_transaction_seconds': max_transaction}
for name in ['insert', 'edit_delete', 'replay']:
    controls, candidates = [report['indexing']['samples'][name] for report in [before, after]]
    assert len(controls) == len(candidates) == 10
    assert [(row['source_rows'], row['distinct_synchronized']) for row in controls] == [(row['source_rows'], row['distinct_synchronized']) for row in candidates]
    old, new = [report['indexing']['summary'][name] for report in [before, after]]
    if new['wall_ms']['median'] >= old['wall_ms']['median']:
        violations.append(name + ': median did not improve')
    if new['wall_ms']['p95'] > old['wall_ms']['p95'] * 1.1:
        violations.append(name + ': observed max regressed by over 10%')
    summary['cases'][name] = {
        'median_ms': [old['wall_ms']['median'], new['wall_ms']['median']],
        'observed_max_ms': [old['wall_ms']['max'], new['wall_ms']['max']],
        'sql_calls': [old['sql_calls']['median'], new['sql_calls']['median']],
        'median_allocations': [old['allocations']['median'], new['allocations']['median']],
        'median_time_reduction_percent': (1 - new['wall_ms']['median'] / old['wall_ms']['median']) * 100,
    }
    if name != 'replay':
        summary['cases'][name]['median_posts_per_second'] = [old['posts_per_second']['median'], new['posts_per_second']['median']]
        summary['cases'][name]['throughput_ratio'] = new['posts_per_second']['median'] / old['posts_per_second']['median']
summary['doubling_target_met'] = all(summary['cases'][name]['throughput_ratio'] >= 2 for name in ['insert', 'edit_delete'])
summary['timing_guard_violations'] = violations
Path(sys.argv[3]).write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
assert not violations, violations
