"""Exercise fresh, partial and repeated migration application on an isolated localhost cluster.
Usage: python server/prisma/tests/issue117-migration-recovery.py --pg-bin <PostgreSQL bin>
Never reads DATABASE_URL or touches an existing cluster. Artifacts stay in .audit-local.
"""
import argparse
from pathlib import Path
import socket
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--pg-bin', required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
audit = root / '.audit-local'
audit.mkdir(exist_ok=True)
cluster = Path(tempfile.mkdtemp(prefix='issue117-pg-', dir=audit))
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)

def run(binary, *params, sql=None, ok=True):
    # Background postgres may inherit handles on Windows; files avoid PIPE EOF deadlocks.
    with (cluster / 'command.stdout').open('w') as stdout, (cluster / 'command.stderr').open('w') as stderr:
        result = subprocess.run([str(args.pg_bin / binary), *map(str, params)], input=sql,
                                text=True, stdout=stdout, stderr=stderr, timeout=45, creationflags=flags)
    result.stdout = (cluster / 'command.stdout').read_text()
    result.stderr = (cluster / 'command.stderr').read_text()
    if ok and result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    if not ok and not result.returncode:
        raise AssertionError('Expected SQL to fail safely')
    return result

def query(sql, ok=True):
    return run('psql.exe', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
               '-p', port, '-U', 'issue117_test', '-d', 'postgres', sql=sql, ok=ok)

migration_path = 'server/prisma/migrations/20261020100000_estimate_versions_signatures/migration.sql'
migration = (root / migration_path).read_text()
# Reproduce the old nontransactional duplicate-table failure, retaining its partial prefix.
old = migration.replace('BEGIN;', '', 1).removesuffix('COMMIT;\n').replace(
    'CREATE TABLE IF NOT EXISTS "DocumentTerms"', 'CREATE TABLE "DocumentTerms"')
base = """
CREATE TABLE "Branch" (id TEXT PRIMARY KEY);
CREATE TABLE "User" (id TEXT PRIMARY KEY);
CREATE TABLE "Estimate" (id TEXT PRIMARY KEY, "jobCardId" TEXT, "createdAt" TIMESTAMP NOT NULL, status TEXT NOT NULL);
CREATE TABLE "CustomerApproval" (id TEXT PRIMARY KEY);
INSERT INTO "Estimate" VALUES ('e1','job','2026-01-01','Approved'),('e2','job','2026-01-02','Pending');
INSERT INTO "CustomerApproval" VALUES ('legacy');
"""
terms = """
CREATE TABLE "DocumentTerms" (id TEXT PRIMARY KEY,type TEXT NOT NULL,"branchId" TEXT,terms TEXT[] NOT NULL,footer TEXT,"updatedAt" TIMESTAMP NOT NULL);
INSERT INTO "DocumentTerms" VALUES ('terms','JOB_ESTIMATE',NULL,ARRAY['Keep existing terms'],'Keep footer',now());
"""

def setup(name, existing=''):
    query('CREATE SCHEMA ' + name + '; SET search_path TO ' + name + ';' + base + existing)
    return 'SET search_path TO ' + name + ';'

started = False
try:
    run('initdb.exe', '-D', cluster / 'data', '-A', 'trust', '-U', 'issue117_test', '--encoding=UTF8', '--no-locale')
    run('pg_ctl.exe', '-D', cluster / 'data', '-l', cluster / 'postgres.log', '-o',
        '-h 127.0.0.1 -p ' + str(port), '-w', '-t', '30', 'start')
    started = True
    fresh = setup('fresh')
    query(fresh + migration)
    assert query(fresh + """SELECT string_agg("version"::text,',' ORDER BY "version") FROM "Estimate";""").stdout.strip() == '1,2'
    assert query(fresh + """SELECT "signatureRequired" FROM "CustomerApproval" WHERE id='legacy';""").stdout.strip() == 'f'
    print('PASS fresh installation and legacy approval preservation')

    partial = setup('partial', terms)
    failed = query(partial + old, ok=False)
    assert 'already exists' in failed.stderr
    query(partial + migration)
    assert query(partial + """SELECT terms[1] FROM "DocumentTerms";""").stdout.strip() == 'Keep existing terms'
    assert query(partial + """SELECT count(*) FROM information_schema.columns WHERE table_schema='partial' AND table_name='DocumentTerms' AND column_name LIKE 'company%';""").stdout.strip() == '3'
    print('PASS reported partial failure recovery with existing terms intact')

    query(partial + """
INSERT INTO "CustomerApproval" (id) VALUES ('new');
UPDATE "Estimate" SET version=7,status='Approved' WHERE id='e2';
INSERT INTO "EstimateSignature" (id,"estimateId","approvalId","imageReference","signerName","deviceOrIp","estimateVersion","totalSigned","contentHash") VALUES ('signature','e2','new','private-png','Test signer','local-test',7,100,'test-hash');
""")
    query(partial + migration)
    assert query(partial + """SELECT version FROM "Estimate" WHERE id='e2';""").stdout.strip() == '7'
    assert query(partial + """SELECT "signatureRequired" FROM "CustomerApproval" WHERE id='new';""").stdout.strip() == 't'
    assert query(partial + """SELECT "contentHash" FROM "EstimateSignature";""").stdout.strip() == 'test-hash'
    print('PASS repeated deployment preserves newer versions, signatures and approval requirements')

    incompatible = setup('incompatible', terms.replace('terms TEXT[] NOT NULL', 'terms JSONB NOT NULL').replace("ARRAY['Keep existing terms']", "'[]'::jsonb"))
    failure = query(incompatible + migration, ok=False)
    assert 'incompatible/missing columns: terms' in failure.stderr
    assert query(incompatible + """SELECT count(*) FROM information_schema.columns WHERE table_schema='incompatible' AND table_name='Estimate' AND column_name='version';""").stdout.strip() == '0'
    print('PASS incompatible terms abort before schema or data writes')
finally:
    if started:
        run('pg_ctl.exe', '-D', cluster / 'data', '-w', '-t', '30', 'stop', '-m', 'fast')
