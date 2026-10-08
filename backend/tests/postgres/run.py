"""Run from the repository root: python backend/tests/postgres/run.py."""
import sys
import time
sys.dont_write_bytecode = True
from harness import Database, HERE, docker
from cases import Cases


def main():
    db = Database()
    try:
        deadline = time.monotonic() + 30
        while docker('exec', db.target['id'], 'pg_isready', '-U', 'postgres', '-d', db.target['database']).returncode:
            if time.monotonic() > deadline:
                raise RuntimeError('Owned PostgreSQL test did not become ready')
            time.sleep(.1)
        print('ISOLATED PostgreSQL 16: verified ID/label/database, no network/ports/host volumes', flush=True)
        db.prepare()
        db.execute((HERE / 'fixtures.sql').read_text(encoding='utf-8'), 'synthetic fixtures')
        cases = Cases(db)
        cases.run()
        print('PASS all PostgreSQL behavior groups: ' + str(len(cases.passed)), flush=True)
    finally:
        db.close()
        print('CLEANED owned ephemeral PostgreSQL container', flush=True)


if __name__ == '__main__':
    main()
