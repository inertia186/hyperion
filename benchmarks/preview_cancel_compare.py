"""Check the frozen cancellation score and native-browser transport guards."""
import gzip
import json
from pathlib import Path
import sys

def read(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if path.endswith('.gz') else raw)

before, after, browser_before, browser_after = [read(path) for path in sys.argv[1:5]]
for key in ['commit', 'node', 'environment', 'harness_sha256', 'config_sha256', 'samples_per_case', 'response_delay_ms', 'rapid_selection_interval_ms']:
    assert before[key] == after[key], key
assert before['samples_per_case'] == 20
assert before['cases'].keys() == after['cases'].keys()
assert before['source_sha256'].keys() == after['source_sha256'].keys()
assert all(before['source_sha256'][path] != sha for path, sha in after['source_sha256'].items())
summary = {'hook_cases': {}, 'obsolete_completions': [0, 0], 'issued_requests': [0, 0], 'aborted_requests': [0, 0]}
for name, control in before['cases'].items():
    candidate = after['cases'][name]
    assert len(control['samples']) == len(candidate['samples']) == 20
    for a, b in zip(control['samples'], candidate['samples']):
        assert [call['id'] for call in a['calls']] == [call['id'] for call in b['calls']], name
        assert [call['started_ms'] for call in a['calls']] == [call['started_ms'] for call in b['calls']], name
        assert b['completed_obsolete'] <= a['completed_obsolete'] * 0.1, name
        if name == 'rapid': assert b['peak_in_flight'] <= 2
        for index, row in enumerate([a, b]):
            summary['obsolete_completions'][index] += row['completed_obsolete']
            summary['issued_requests'][index] += len(row['calls'])
            summary['aborted_requests'][index] += row['aborted']
    if control['p95_latest_ready_ms'] is not None:
        assert candidate['p95_latest_ready_ms'] <= control['p95_latest_ready_ms'] * 1.05
    summary['hook_cases'][name] = {
        'peak_in_flight': [max(row['peak_in_flight'] for row in case['samples']) for case in [control, candidate]],
        'p95_ready_ms': [control['p95_latest_ready_ms'], candidate['p95_latest_ready_ms']]}
assert summary['issued_requests'][1] <= summary['issued_requests'][0]
assert browser_before['harness_sha256'] == browser_after['harness_sha256']
assert browser_before['browser'] == browser_after['browser']
assert browser_before['response_delay_ms'] == browser_after['response_delay_ms'] == 300
assert browser_before['source_sha256'] == before['source_sha256']
assert browser_after['source_sha256'] == after['source_sha256']
assert len(browser_before['cases']) == len(browser_after['cases']) == 6
summary['browser_cases'] = []
for a, b in zip(browser_before['cases'], browser_after['cases']):
    assert a['viewport'] == b['viewport'] and a['scenario'] == b['scenario']
    assert [row['id'] for row in a['records']] == [row['id'] for row in b['records']]
    assert all(row['workFinished'] for row in a['records'] + b['records'])
    expected = 9 if b['scenario'] == 'rapid' else 1
    assert sum(row['disconnected'] for row in a['records']) == 0
    assert sum(row['disconnected'] for row in b['records']) == expected
    if b['scenario'] == 'rapid': assert b['peakSockets'] <= 2
    summary['browser_cases'].append({'viewport': b['viewport'], 'scenario': b['scenario'],
        'disconnected': [0, expected], 'peak_open_connections': [a['peakSockets'], b['peakSockets']],
        'peak_simulated_backend_work': [a['peakWork'], b['peakWork']]})
summary['hook_target_met'] = True
summary['native_transport_guards_pass'] = True
summary['production_backend_savings_measured'] = False
Path(sys.argv[5]).write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
