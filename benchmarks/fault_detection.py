"""Frozen, one-at-a-time Rails fault panel. Restores source even on interruption."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent
PANEL = ROOT / 'benchmarks/fault_panel.json'
ENV = os.environ.copy()
ENV.update(RAILS_ENV='test', RBENV_VERSION='3.3.11', PARALLEL_WORKERS='1',
           DATABASE_URL='postgresql:///hyperion_hills_test?gssencmode=disable',
           SKIP_JS_BUILD='1', SKIP_CSS_BUILD='1', SKIP_YARN_INSTALL='1', DISABLE_BOOTSNAP='1', DISABLE_SPRING='1')
ENV['PATH'] = str(Path.home() / '.nvm/versions/node/v26.12.0/bin') + ':' + ENV['PATH']
ENV.pop('COVERAGE', None)
RAILS = ['rbenv', 'exec', 'bundle', 'exec', 'rails']
SEED = '6604'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(command, log, extra=None):
    started = time.monotonic()
    with log.open('w') as output:
        try:
            result = subprocess.run(command, cwd=ROOT, env=ENV | (extra or {}),
                                    stdout=output, stderr=subprocess.STDOUT, timeout=120)
            code = result.returncode
        except subprocess.TimeoutExpired:
            code = 'timeout'
    return dict(exit=code, wall_seconds=time.monotonic() - started, log=str(log.relative_to(ROOT)))

def suite(log, coverage=False):
    result = run(RAILS + ['test', '--seed', SEED], log, {'COVERAGE': '1'} if coverage else {})
    content = log.read_text()
    match = re.search(r'(\d+) runs, (\d+) assertions, (\d+) failures, (\d+) errors, (\d+) skips', content)
    if not match or result['exit'] == 'timeout':
        raise RuntimeError(f'Infrastructure failure: {log}')
    result.update(zip(['tests', 'assertions', 'failures', 'errors', 'skips'], map(int, match.groups())))
    result['detected'] = result['exit'] == 1 and result['failures'] > 0 and result['errors'] == 0 and result['skips'] == 0
    if result['exit'] not in [0, 1] or result['errors'] or result['skips']:
        raise RuntimeError(f'Unscored failure: {log}')
    return result

def main():
    version = os.environ['HILLS_VERSION']
    out = ROOT / os.environ['HILLS_OUTPUT']
    assert not out.exists(), out
    panel = json.loads(PANEL.read_text())
    production = sorted(ROOT.glob('app/**/*.rb')) + sorted(ROOT.glob('lib/**/*.rb'))
    report = dict(recorded_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), version=version,
                  commit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  working_tree=subprocess.check_output(['git', 'status', '--short'], cwd=ROOT, text=True).splitlines(),
                  source_sha256={str(p.relative_to(ROOT)): sha(p) for p in production},
                  test_sha256={str(p.relative_to(ROOT)): sha(p) for p in sorted(ROOT.glob('test/**/*.rb'))},
                  panel_sha256=sha(PANEL), witness_sha256=sha(ROOT / 'benchmarks/fault_witness.rb'),
                  harness_sha256=sha(Path(__file__)), seed=SEED, timeout_seconds=120,
                  environment={key: ENV[key] for key in ['RAILS_ENV', 'RBENV_VERSION', 'PARALLEL_WORKERS', 'DATABASE_URL', 'SKIP_JS_BUILD', 'SKIP_CSS_BUILD', 'DISABLE_BOOTSNAP', 'DISABLE_SPRING']},
                  controls=[], faults=[])
    originals = {f['path']: (ROOT / f['path']).read_bytes() for f in panel}
    try:
        # Confirm required behavior on unaltered production before fault validation.
        for fault in panel:
            witness = run(RAILS + ['runner', 'benchmarks/fault_witness.rb'], out.with_name(out.stem + '-' + fault['id'] + '-control.log'), {'HILLS_FAULT': fault['id']})
            assert witness['exit'] == 0, witness
        # Validate every fault before measuring any suite detection.
        for fault in panel:
            path = ROOT / fault['path']
            source = originals[fault['path']].decode()
            assert source.count(fault['old']) == 1, fault['id']
            path.write_text(source.replace(fault['old'], fault['new']))
            try:
                syntax = run(['rbenv', 'exec', 'ruby', '-c', fault['path']], out.with_name(out.stem + '-' + fault['id'] + '-syntax.log'))
                assert syntax['exit'] == 0, syntax
                witness = run(RAILS + ['runner', 'benchmarks/fault_witness.rb'], out.with_name(out.stem + '-' + fault['id'] + '-witness.log'), {'HILLS_FAULT': fault['id']})
                assert witness['exit'] == 42, witness
                report['faults'].append(dict(id=fault['id'], mutated_sha256=sha(path), syntax=syntax, witness=witness))
            finally:
                path.write_bytes(originals[fault['path']])
        for i in range(3):
            result = suite(out.with_name(out.stem + f'-control-{i + 1}.log'))
            assert result['exit'] == 0, result
            report['controls'].append(result)
            print(version, 'control', i + 1, result, flush=True)
        result = suite(out.with_name(out.stem + '-coverage.log'), coverage=True)
        assert result['exit'] == 0, result
        report['coverage_run'] = result
        report['coverage'] = json.loads((ROOT / 'coverage/rails/coverage.json').read_text())
        for fault, row in zip(panel, report['faults']):
            path = ROOT / fault['path']
            source = originals[fault['path']].decode()
            path.write_text(source.replace(fault['old'], fault['new']))
            try:
                row['suite'] = suite(out.with_name(out.stem + '-' + fault['id'] + '-suite.log'))
                print(version, fault['id'], row['suite'], flush=True)
            finally:
                path.write_bytes(originals[fault['path']])
    finally:
        for path, content in originals.items():
            (ROOT / path).write_bytes(content)
        report['restored'] = all(sha(ROOT / p) == report['source_sha256'][p] for p in originals)
        out.write_text(json.dumps(report, indent=2) + '\n')
    assert report['restored']

if __name__ == '__main__':
    main()
