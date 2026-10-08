"""Isolated PostgreSQL tests; Python stdlib + existing Docker image only."""
import json
import pathlib
import re
import subprocess
import uuid

HERE = pathlib.Path(__file__).resolve().parent
MIGRATIONS = HERE.parents[1] / 'supabase'


def docker(*args, data=None):
    return subprocess.run(['docker', *args], input=data, text=True,
                          encoding='utf-8', capture_output=True, timeout=60)


class Database:
    def __init__(self, target=None):
        self.owned = target is None
        if target is None:
            run = uuid.uuid4().hex
            target = {'run': run, 'name': 'workflow_pg_test_' + run[:12],
                      'database': 'workflow_test_' + run[:12]}
            result = docker('run', '-d', '--name', target['name'], '--network', 'none',
                            '--read-only', '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
                            '--tmpfs', '/var/run/postgresql:rw', '--tmpfs', '/tmp:rw',
                            '--label', 'codex.workflow.test=' + run,
                            '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
                            '-e', 'POSTGRES_DB=' + target['database'], 'postgres:16-alpine')
            if result.returncode:
                raise RuntimeError('Test container creation failed')
            target['id'] = result.stdout.strip()
        self.target = target
        self.verify()

    def verify(self):
        t = self.target
        result = docker('inspect', t['id'])
        if result.returncode:
            raise RuntimeError('Test target is absent')
        c = json.loads(result.stdout)[0]
        assert re.fullmatch(r'[0-9a-f]{32}', t['run'])
        assert t['name'] == 'workflow_pg_test_' + t['run'][:12]
        assert t['database'] == 'workflow_test_' + t['run'][:12]
        assert c['Id'] == t['id'] and c['Name'] == '/' + t['name']
        assert c['Config']['Labels'].get('codex.workflow.test') == t['run']
        assert c['Config']['Image'] == 'postgres:16-alpine'
        host = c['HostConfig']
        assert host['NetworkMode'] == 'none' and host['ReadonlyRootfs']
        assert not host['Binds'] and not host['PortBindings']
        assert all(m['Type'] == 'tmpfs' for m in c['Mounts'])
        assert '/var/lib/postgresql/data' in host['Tmpfs']

    def process(self, sql):
        self.verify()  # Always verify before SQL; never accept a connection URL.
        identity = docker('exec', self.target['id'], 'psql', '-X', '-U', 'postgres',
                          '-d', self.target['database'], '-Atc',
                          'select current_database(),current_setting(\'server_version_num\');')
        assert identity.returncode == 0
        name, version = identity.stdout.strip().split('|')
        assert name == self.target['database'] and 160000 <= int(version) < 170000
        return docker('exec', '-i', self.target['id'], 'psql', '-X', '-qAt', '-U', 'postgres',
                      '-d', self.target['database'], '-v', 'ON_ERROR_STOP=1',
                      '-v', 'VERBOSITY=sqlstate', '-f', '-', data=sql)

    def execute(self, sql, label='SQL'):
        result = self.process(sql)
        if result.returncode:
            codes = re.findall(r'(?:ERROR|FATAL):\s+([A-Z0-9]{5})', result.stderr)
            raise RuntimeError(label + ' failed SQLSTATE=' + ','.join(codes or ['unknown']))
        return result.stdout.strip()

    def prepare(self):
        self.execute((HERE / 'bootstrap.sql').read_text(encoding='utf-8'), 'platform bootstrap')
        names = ['phase1.sql', 'phase2.sql', 'phase3.sql', 'phase4.sql', 'phase5.sql']
        for name in names:
            self.execute((MIGRATIONS / name).read_text(encoding='utf-8'), name)
        self.execute((HERE / 'historical-prerequisites.sql').read_text(encoding='utf-8'), 'historical prerequisites')
        names = [p.name for p in MIGRATIONS.glob('phase*.sql')
                 if not any(word in p.name for word in ['preflight', 'verify'])
                 and int(re.match(r'phase(\d+)', p.name)[1]) >= 8]
        names.sort(key=lambda name: (int(re.match(r'phase(\d+)', name)[1]), name))
        for name in names:
            self.execute((MIGRATIONS / name).read_text(encoding='utf-8'), name)
            print('APPLIED TEST ONLY ' + name, flush=True)

    def close(self):
        self.verify()
        result = docker('rm', '-f', self.target['id'])
        if result.returncode:
            raise RuntimeError('Owned test container cleanup failed')
