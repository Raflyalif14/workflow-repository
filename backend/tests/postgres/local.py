"""Isolated PostgreSQL 16 adapter for the existing SQL harness, no live URLs."""
import json
import os
import pathlib
import re
import shutil
import socket
import subprocess
import tempfile
import uuid
from harness import Database, HERE, MIGRATIONS


class LocalDatabase(Database):
    def __init__(self):
        self.run = uuid.uuid4().hex
        self.workspace = HERE.parents[2].resolve()
        temporary = self.workspace / '.tmp'
        temporary.mkdir(exist_ok=True)
        self.root = pathlib.Path(tempfile.mkdtemp(prefix='pg_pic_' + self.run + '_', dir=temporary)).resolve()
        self.data = self.root / 'data'
        self.bin = pathlib.Path('C:/Program Files/PostgreSQL/16/bin')
        version = self.command('postgres', '--version')
        assert version.returncode == 0 and re.search(r'PostgreSQL\) 16\.', version.stdout)
        (self.root / 'identity.json').write_text(json.dumps({'run': self.run}), encoding='utf-8')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = str(sock.getsockname()[1])
        self.name = 'workflow_test_' + self.run
        self.started = False
        try:
            result = self.command('initdb', '-D', str(self.data), '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale')
            if result.returncode: raise RuntimeError('Isolated initdb failed')
            self.started = True
            result = self.command('pg_ctl', '-D', str(self.data), '-l', str(self.root / 'server.log'),
                '-o', '-h 127.0.0.1 -p ' + self.port, '-w', 'start')
            if result.returncode: raise RuntimeError('Isolated PostgreSQL start failed')
            self.identity('postgres')
            result = self.psql('postgres', 'create database ' + self.name + ';')
            if result.returncode: raise RuntimeError('Isolated test database creation failed')
            self.verify()
        except Exception:
            self.close()
            raise

    def command(self, tool, *args, data=None):
        env = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
        if tool == 'pg_ctl':
            # Windows server children can inherit capture pipes and prevent EOF.
            with (self.root / 'control.log').open('a', encoding='utf-8') as log:
                return subprocess.run([str(self.bin / 'pg_ctl.exe'), *args],
                    stdin=subprocess.DEVNULL, stdout=log, stderr=log, timeout=60, env=env,
                    creationflags=subprocess.CREATE_NO_WINDOW)
        return subprocess.run([str(self.bin / (tool + '.exe')), *args], input=data,
            text=True, encoding='utf-8', capture_output=True, timeout=60, env=env,
            creationflags=subprocess.CREATE_NO_WINDOW)

    def check_paths(self):
        assert self.root.parent == (self.workspace / '.tmp').resolve()
        assert self.root.name.startswith('pg_pic_' + self.run + '_')
        assert re.fullmatch('[0-9a-f]{32}', self.run)
        assert json.loads((self.root / 'identity.json').read_text(encoding='utf-8')) == {'run': self.run}
        assert self.data.resolve() == self.root / 'data'

    def psql(self, database, sql):
        return self.command('psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', self.port,
            '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-f', '-', data=sql)

    def identity(self, database):
        self.check_paths()
        result = self.psql(database, "select current_database(),current_setting('data_directory'),current_setting('server_version_num'),current_setting('listen_addresses');")
        assert result.returncode == 0
        name, directory, version, listen = result.stdout.strip().split('|')
        assert name == database and pathlib.Path(directory).resolve() == self.data.resolve()
        assert 160000 <= int(version) < 170000 and listen == '127.0.0.1'

    def verify(self):
        self.identity(self.name)

    def process(self, sql):
        self.verify()
        return self.psql(self.name, sql)

    def prepare(self):
        self.execute((HERE / 'bootstrap.sql').read_text(encoding='utf-8'), 'platform bootstrap')
        for name in ['phase1.sql', 'phase2.sql', 'phase3.sql', 'phase4.sql', 'phase5.sql']:
            self.execute((MIGRATIONS / name).read_text(encoding='utf-8'), name)
        self.execute((HERE / 'historical-prerequisites.sql').read_text(encoding='utf-8'), 'historical prerequisites')
        names = [p.name for p in MIGRATIONS.glob('phase*.sql')
            if not any(word in p.name for word in ['preflight', 'verify'])
            and 8 <= int(re.match(r'phase(\d+)', p.name)[1]) <= 33]
        for name in sorted(names, key=lambda name: (int(re.match(r'phase(\d+)', name)[1]), name)):
            self.execute((MIGRATIONS / name).read_text(encoding='utf-8'), name)
        # Phase34 is unrelated to plan review and intentionally not repeated.

    def close(self):
        self.check_paths()
        if self.started:
            self.identity('postgres')
            result = self.command('pg_ctl', '-D', str(self.data), '-m', 'fast', '-w', 'stop')
            if result.returncode: raise RuntimeError('Owned PostgreSQL stop failed; preserve its test directory')
            self.started = False
        self.check_paths()
        shutil.rmtree(self.root)
