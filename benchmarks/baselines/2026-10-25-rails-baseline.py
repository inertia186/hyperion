import datetime,gzip,hashlib,json,os,platform,re,subprocess,time
from pathlib import Path
root=Path.cwd()
base=root/'benchmarks/baselines'
manifest_paths=sorted(set(root.glob('test/**/*.rb'))|set(root.glob('test/fixtures/**/*.yml'))|set(root.glob('test/fixtures/**/*.json'))|set(root.glob('config/**/*.rb'))|{root/p for p in ['Gemfile','Gemfile.lock','bin/rails','.github/workflows/tests.yml']})
manifest={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in manifest_paths}
report={'recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'working_tree':subprocess.check_output(['git','status','--short'],text=True).splitlines(),'ruby':subprocess.check_output(['rbenv','exec','ruby','--version'],text=True).strip(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'os':platform.platform(),'database':'hyperion_hills_test','workers':1,'skip_yarn_install':True,'test_and_config_sha256':manifest,'harness_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'runs':[]}
app_hashes={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['app','lib'] for p in sorted((root/folder).glob('**/*.rb'))}
report['application_sha256']=app_hashes
for iteration,seed in enumerate([6604,6604,20261025],1):
 versions=[False,True] if iteration%2 else [True,False]
 for coverage in versions:
  name=f'2026-10-25-rails-{"coverage" if coverage else "plain"}-{iteration}'
  log=base/(name+'.log')
  assert not log.exists(),log
  env=os.environ.copy()
  env.update({'RAILS_ENV':'test','DATABASE_URL':'postgresql:///hyperion_hills_test?gssencmode=disable','PARALLEL_WORKERS':'1','SKIP_YARN_INSTALL':'1','RBENV_VERSION':'3.3.11'})
  env.pop('COVERAGE',None)
  if coverage: env['COVERAGE']='1'
  command=['/usr/bin/time','-l','rbenv','exec','bundle','exec','rails','test','--seed',str(seed)]
  started=time.monotonic()
  with log.open('w') as out:
   result=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
  elapsed=time.monotonic()-started
  assert result.returncode==0, f'{name} failed; read {log}'
  text=log.read_text()
  counts=re.search(r'(\d+) runs, (\d+) assertions, (\d+) failures, (\d+) errors, (\d+) skips',text)
  assert counts, name
  counts=dict(zip(['tests','assertions','failures','errors','skips'],map(int,counts.groups())))
  assert counts=={'tests':349,'assertions':2528,'failures':0,'errors':0,'skips':0},counts
  run={'name':name,'seed':seed,'coverage':coverage,'command':command,'test_seconds':float(re.search(r'Finished in ([\d.]+)s',text).group(1)),'process_seconds':round(elapsed,6),'max_rss_bytes':int(re.search(r'(\d+)\s+maximum resident set size',text).group(1)),**counts}
  if coverage:
   raw=(root/'coverage/rails/coverage.json').read_bytes()
   data=json.loads(raw)
   assert data['seed']==seed
   assert data['source_sha256']==app_hashes
   assert set(data['coverage'])==set(app_hashes)
   assert data['summary']['files']==71
   target=base/(name+'.json.gz')
   assert not target.exists()
   target.write_bytes(gzip.compress(raw,mtime=0))
   run['coverage_report']=target.name
   run['summary']=data['summary']
  for path,sha in manifest.items(): assert hashlib.sha256((root/path).read_bytes()).hexdigest()==sha,path
  for path,sha in app_hashes.items(): assert hashlib.sha256((root/path).read_bytes()).hexdigest()==sha,path
  report['runs'].append(run)
  (root/'tmp/hills-rails-test-baseline.json').write_text(json.dumps(report,indent=2)+'\n')
  print(name,counts,'test_seconds',run['test_seconds'],'process_seconds',run['process_seconds'],run.get('summary',''),flush=True)
