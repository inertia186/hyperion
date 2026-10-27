"""Local warm-dependency experiment; not a hosted CI turnaround benchmark."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import subprocess
import time

root = Path.cwd()
out = root / 'benchmarks/baselines'
prefix = '2026-10-25-ci-asset-hooks-clean'
env = os.environ.copy()
env.update(RAILS_ENV='test', RBENV_VERSION='3.3.11', PARALLEL_WORKERS='1',
           DATABASE_URL='postgresql:///hyperion_hills_test?gssencmode=disable',
           SKIP_YARN_INSTALL='1')
env['PATH'] = str(Path.home() / '.nvm/versions/node/v26.12.0/bin') + ':' + env['PATH']
for key in ['COVERAGE', 'SKIP_JS_BUILD', 'SKIP_CSS_BUILD', 'RUBYOPT']:
    env.pop(key, None)
rails = ['rbenv', 'exec', 'bundle', 'exec', 'rails']
paths = sorted(set(root.glob('app/**/*')) | set(root.glob('lib/**/*')) |
               set(root.glob('test/**/*')) | set(root.glob('config/**/*')) |
               {root / name for name in ['Gemfile', 'Gemfile.lock', 'package.json', 'package-lock.json', 'bin/rails']})
paths = [p for p in paths if p.is_file() and 'app/assets/builds' not in str(p)]

def hashes(files):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}

sources = hashes(paths)
report = dict(recorded_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              commit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              working_tree=subprocess.check_output(['git', 'status', '--short'], text=True).splitlines(),
              source_sha256=sources, harness_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              environment={k: env[k] for k in ['RAILS_ENV', 'RBENV_VERSION', 'PARALLEL_WORKERS', 'DATABASE_URL', 'SKIP_YARN_INSTALL']},
              node=subprocess.check_output(['node', '--version'], env=env, text=True).strip(),
              browser='/Applications/Chromium.app/Contents/MacOS/Chromium', runs=[])
browser_shim = root / 'tmp/hills-local-chromium.rb'
browser_shim.write_text('''require 'bundler/setup'
require 'capybara/playwright'
module HillsLocalChromium
  def initialize(app, **options)
    super(app, **options, executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium')
  end
end
Capybara::Playwright::Driver.prepend(HillsLocalChromium)
''')
report['browser_shim'] = browser_shim.read_text()
assert not (root / 'public/assets').exists(), 'Set aside precompiled Sprockets assets before measuring'
covered = None

def run(name, command, extra=None):
    log = out / (prefix + '-' + name + '.log')
    assert not log.exists(), log
    started = time.monotonic()
    with log.open('w') as stream:
        result = subprocess.run(command, env=env | (extra or {}), stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        report['failure'] = dict(name=name, log=log.name, exit_code=result.returncode)
        (root / 'tmp/hills-ci-asset-hooks.json').write_text(json.dumps(report, indent=2) + '\n')
        raise AssertionError(f'{name} failed: {log}')
    return dict(command=command, seconds=time.monotonic() - started, log=log.name), log.read_text()

def coverage_set(data):
    return {path: {'lines': [i for i, hits in enumerate(c['lines']) if hits and hits > 0],
                   'branches': {key: [branch for branch, hits in outcomes.items() if hits > 0]
                                for key, outcomes in c.get('branches', {}).items()}}
            for path, c in data['coverage'].items()}

for iteration, seed in enumerate([6604, 20261025, 6604], 1):
    for candidate in ([False, True] if iteration % 2 else [True, False]):
        name = f'{iteration}-' + ('candidate' if candidate else 'control')
        stages = {}
        # Rebuild explicit assets for every trial; never rely on an old bundle.
        for stage, command in [('javascript', ['npm', 'run', 'build']),
                               ('css', ['npm', 'run', 'build:css']),
                               ('vite', rails + ['vite:build'])]:
            stages[stage], _ = run(name + '-' + stage, command)
        assets = list((root / 'app/assets/builds').glob('application.*'))
        assets += [p for p in (root / 'public/vite-test').rglob('*') if p.is_file()]
        asset_hashes = hashes(assets)
        assert any(p.suffix == '.js' for p in assets)
        assert any(p.suffix == '.css' for p in assets)
        flags = dict(SKIP_JS_BUILD='1', SKIP_CSS_BUILD='1') if candidate else {}
        stages['rails'], output = run(name + '-rails', rails + ['test', '--seed', str(seed)], flags | {'COVERAGE': '1'})
        counts = re.search(r'(\d+) runs, (\d+) assertions, (\d+) failures, (\d+) errors, (\d+) skips', output)
        assert counts and tuple(map(int, counts.groups())) == (349, 2528, 0, 0, 0), output[-3000:]
        data = json.loads((root / 'coverage/rails/coverage.json').read_text())
        current = coverage_set(data)
        if covered is None:
            covered = current
        assert current == covered, 'Covered lines or branch outcomes changed'
        coverage_path = out / (prefix + '-' + name + '-coverage.json.gz')
        assert not coverage_path.exists()
        coverage_path.write_bytes(gzip.compress(json.dumps(data).encode(), mtime=0))
        stages['system'], output = run(name + '-system', rails + ['test:system', '--seed', str(seed)],
                                        flags | {'RUBYOPT': '-r' + str(browser_shim)})
        system_counts = re.search(r'(\d+) runs, (\d+) assertions, (\d+) failures, (\d+) errors, (\d+) skips', output)
        assert system_counts and int(system_counts[1]) == 7 and tuple(map(int, system_counts.groups()[2:])) == (0, 0, 0), output[-3000:]
        assert hashes(assets) == asset_hashes, 'Test hooks changed explicitly built assets'
        assert hashes(paths) == sources, 'Source changed during experiment'
        trial = dict(name=name, seed=seed, candidate=candidate, stages=stages,
                     seconds=sum(s['seconds'] for s in stages.values()), asset_sha256=asset_hashes,
                     coverage=coverage_path.name, system_counts=list(map(int, system_counts.groups())))
        report['runs'].append(trial)
        (root / 'tmp/hills-ci-asset-hooks.json').write_text(json.dumps(report, indent=2) + '\n')
        print(name, round(trial['seconds'], 3), trial['system_counts'], flush=True)

for candidate in [False, True]:
    print('candidate' if candidate else 'control', 'median', statistics.median(r['seconds'] for r in report['runs'] if r['candidate'] == candidate), flush=True)
target = out / (prefix + '.json.gz')
assert not target.exists()
target.write_bytes(gzip.compress(json.dumps(report, indent=2).encode(), mtime=0))
