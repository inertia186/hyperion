"""Compare complete runs of the frozen fault panel, including coverage guards."""
import gzip
import json
from pathlib import Path
import statistics
import sys

def read(path):
    return json.loads(gzip.decompress(Path(path).read_bytes()) if path.endswith('.gz') else Path(path).read_bytes())

before, after = [read(p) for p in sys.argv[1:3]]
assert len(before['faults']) == len(after['faults']) == 8
for report in [before, after]:
    assert len(report['controls']) == 3
    assert all(row['exit'] == row['failures'] == row['errors'] == row['skips'] == 0 for row in report['controls'])
    assert len({row['tests'] for row in report['controls']}) == 1
assert before['controls'][0]['tests'] == after['controls'][0]['tests']
for key in ['source_sha256', 'panel_sha256', 'witness_sha256', 'harness_sha256', 'environment', 'seed', 'timeout_seconds']:
    assert before[key] == after[key], key
assert before['restored'] and after['restored']
old = {row['id']: row for row in before['faults']}
new = {row['id']: row for row in after['faults']}
assert old.keys() == new.keys()
for id, row in old.items():
    assert row['mutated_sha256'] == new[id]['mutated_sha256'], id
    assert not row['suite']['detected'] or new[id]['suite']['detected'], id
    assert row['witness']['exit'] == new[id]['witness']['exit'] == 42
lost_lines = lost_branches = 0
assert before['coverage']['coverage'].keys() == after['coverage']['coverage'].keys()
for path, coverage in before['coverage']['coverage'].items():
    candidate = after['coverage']['coverage'][path]
    assert len(coverage['lines']) == len(candidate['lines']), path
    lost_lines += sum(bool(count and count > 0) and not bool(candidate['lines'][i] and candidate['lines'][i] > 0)
                      for i, count in enumerate(coverage['lines']))
    assert coverage['branches'].keys() == candidate['branches'].keys(), path
    for branch, outcomes in coverage['branches'].items():
        assert outcomes.keys() == candidate['branches'][branch].keys(), path
        lost_branches += sum(count > 0 and candidate['branches'][branch][outcome] == 0 for outcome, count in outcomes.items())
assert lost_lines == lost_branches == 0, (lost_lines, lost_branches)
runtime = [statistics.median(row['wall_seconds'] for row in report['controls']) for report in [before, after]]
assert runtime[1] <= runtime[0] * 1.1, runtime
summary = dict(undetected_before=[id for id, row in old.items() if not row['suite']['detected']],
               undetected_after=[id for id, row in new.items() if not row['suite']['detected']],
               runtime_median_seconds=runtime, runtime_change_percent=(runtime[1] / runtime[0] - 1) * 100,
               tests=[report['controls'][0]['tests'] for report in [before, after]],
               coverage=[report['coverage']['summary'] for report in [before, after]],
               lost_lines=lost_lines, lost_branches=lost_branches)
summary['detection_target_met'] = len(summary['undetected_after']) <= len(summary['undetected_before']) / 2
summary['test_count_target_met'] = summary['tests'][1] <= 349
Path(sys.argv[3]).write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
