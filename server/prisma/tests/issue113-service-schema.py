"""Verify P1 on a disposable localhost PostgreSQL cluster; never reads DATABASE_URL.

Usage: python server/prisma/tests/issue113-service-schema.py --pg-bin <PostgreSQL bin>
Optional --baseline-sql validates the migration against a full pre-P1 schema too.
"""
import argparse
from pathlib import Path
import socket
import subprocess
import tempfile
import os

parser = argparse.ArgumentParser()
parser.add_argument('--pg-bin', required=True, type=Path)
parser.add_argument('--baseline-sql', type=Path)
parser.add_argument('--prisma-node', type=Path, help='Also check full-schema drift using this Node executable')
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
audit = root / '.audit-local'
audit.mkdir(exist_ok=True)
cluster = Path(tempfile.mkdtemp(prefix='issue113-pg-', dir=audit))
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


def run(binary, *params, sql=None, ok=True):
    with (cluster / 'command.stdout').open('w') as stdout, (cluster / 'command.stderr').open('w') as stderr:
        result = subprocess.run([str(args.pg_bin / binary), *map(str, params)], input=sql,
                                text=True, stdout=stdout, stderr=stderr, timeout=60, creationflags=flags)
    output = (cluster / 'command.stdout').read_text()
    error = (cluster / 'command.stderr').read_text()
    if ok and result.returncode:
        raise AssertionError(error or output)
    if not ok and not result.returncode:
        raise AssertionError('Expected invalid SQL to be rejected')
    return output.strip()


def query(sql, ok=True):
    return run('psql.exe', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
               '-p', port, '-U', 'issue113_test', '-d', 'postgres', sql=sql, ok=ok)


def check(scope, sql, expected):
    result = query(scope + sql)
    assert result == expected, (sql, expected, result)


migration = (root / 'server/prisma/migrations/20261021100000_service_transaction_documents/migration.sql').read_text()
base = '''
CREATE TYPE "ChargeType" AS ENUM ('CUSTOMER', 'WARRANTY', 'FREE', 'GOODWILL');
CREATE TABLE "Branch" (id TEXT PRIMARY KEY);
CREATE TABLE "User" (id TEXT PRIMARY KEY);
CREATE TABLE "WorkshopMaster" (id TEXT PRIMARY KEY);
CREATE TABLE "SparePart" (id TEXT PRIMARY KEY);
CREATE TABLE "JobCard" (id TEXT PRIMARY KEY);
CREATE TABLE "ServiceAppointment" (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'Pending');
CREATE TABLE "Estimate" (id TEXT PRIMARY KEY, amount DOUBLE PRECISION NOT NULL);
CREATE TABLE "PartIssuance" (id TEXT PRIMARY KEY, quantity INTEGER NOT NULL);
CREATE TABLE "PartReturn" (id TEXT PRIMARY KEY, "partIssuanceId" TEXT NOT NULL REFERENCES "PartIssuance"(id), quantity INTEGER NOT NULL, status TEXT NOT NULL);
CREATE TABLE "JobCardLabour" (id TEXT PRIMARY KEY, hours DOUBLE PRECISION NOT NULL);
CREATE TABLE "JobCardLine" (id TEXT PRIMARY KEY, "partIssuanceId" TEXT UNIQUE REFERENCES "PartIssuance"(id), amount DOUBLE PRECISION NOT NULL);
INSERT INTO "Branch" VALUES ('branch1'), ('branch2');
INSERT INTO "User" VALUES ('actor');
INSERT INTO "SparePart" VALUES ('part');
INSERT INTO "JobCard" VALUES ('job');
INSERT INTO "ServiceAppointment" VALUES ('booking', 'Pending');
INSERT INTO "Estimate" VALUES ('estimate', 123.45);
INSERT INTO "PartIssuance" VALUES ('oldissue', 2), ('splitissue', 3);
INSERT INTO "PartReturn" VALUES ('oldreturn', 'oldissue', 1, 'Completed');
INSERT INTO "JobCardLabour" VALUES ('labour', 2.5);
INSERT INTO "JobCardLine" VALUES ('oldcharge', 'oldissue', 123.45);
'''
# Indexes reference these existing columns, omitted from the minimal data fixture above.
base += '''ALTER TABLE "ServiceAppointment" ADD COLUMN "branchId" TEXT, ADD COLUMN "scheduledAt" TIMESTAMP;
'''
started = False
try:
    run('initdb.exe', '-D', cluster / 'data', '-A', 'trust', '-U', 'issue113_test', '--encoding=UTF8', '--no-locale')
    run('pg_ctl.exe', '-D', cluster / 'data', '-l', cluster / 'postgres.log', '-o',
        f'-h 127.0.0.1 -p {port}', '-w', 'start')
    started = True
    for name, partial in [('existing', ''), ('partial', '''
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CONVERTED', 'CANCELLED', 'NO_SHOW');
ALTER TABLE "ServiceAppointment" ADD COLUMN "bookingNumber" TEXT;
ALTER TABLE "JobCardLabour" ADD COLUMN "standardHours" DOUBLE PRECISION;
''')]:
        scope = 'SET search_path TO ' + name + ';'
        query('CREATE SCHEMA ' + name + ';' + scope + base + partial)
        query(scope + migration)
        query(scope + migration)
        check(scope, '''SELECT amount FROM "Estimate" WHERE id='estimate';''', '123.45')
        check(scope, '''SELECT hours FROM "JobCardLabour" WHERE id='labour';''', '2.5')
        check(scope, '''SELECT quantity FROM "PartReturn" WHERE id='oldreturn' AND "returnSlipId" IS NULL;''', '1')
        check(scope, '''SELECT "bookingStatus" FROM "ServiceAppointment" WHERE id='booking';''', 'BOOKED')
        query(scope + '''UPDATE "ServiceAppointment" SET "bookingStatus"='CANCELLED';''', ok=False)
        query(scope + '''UPDATE "ServiceAppointment" SET "bookingStatus"='CANCELLED', "cancelReason"='Customer cancelled';''')
        query(scope + '''
INSERT INTO "PartRequisition" (id,"requisitionNumber","branchId","jobCardId","chargeType","createdById","updatedAt")
VALUES ('req','R1','branch1','job','GOODWILL','actor',now()), ('other','R1','branch2','job','CUSTOMER','actor',now());
INSERT INTO "PartRequisitionLine" (id,"requisitionId","sparePartId","partIssuanceId","partSource",description,"quantityRequired","quantityIssued",rate,amount,"approvalPercent","customerPercent","approvedAmount","customerAmount")
VALUES ('line','req','part','splitissue','O','Snapshot',3,3,100.01,300.03,30,70,90.01,210.02);
INSERT INTO "JobCardLine" (id,"partIssuanceId",amount,"requisitionLineId") VALUES ('approved','splitissue',90.01,'line'),('customer',NULL,210.02,'line');
INSERT INTO "PartReturnSlip" (id,"returnNumber","branchId","jobCardId","requisitionId","createdById","updatedAt")
VALUES ('slip','RET1','branch1','job','req','actor',now());
INSERT INTO "PartReturn" (id,"partIssuanceId",quantity,status,"returnSlipId","requisitionLineId",rate,amount)
VALUES ('return','splitissue',1,'Completed','slip','line',100.01,100.01);
INSERT INTO "LabourSlip" (id,"slipNumber","branchId","jobCardId","createdById","updatedAt") VALUES ('labourslip','L1','branch1','job','actor',now());
UPDATE "JobCardLabour" SET "labourSlipId"='labourslip',"standardHours"=1.5 WHERE id='labour';
''')
        check(scope, '''SELECT "approvedAmount" + "customerAmount" = amount FROM "PartRequisitionLine" WHERE id='line';''', 't')
        check(scope, '''SELECT count(*) FROM "JobCardLine" WHERE "requisitionLineId"='line';''', '2')
        check(scope, '''SELECT hours || '/' || "standardHours" FROM "JobCardLabour" WHERE id='labour';''', '2.5/1.5')
        for sql in [
            '''UPDATE "PartRequisitionLine" SET "customerPercent"=60 WHERE id='line';''',
            '''UPDATE "PartRequisitionLine" SET "customerPercent"=NULL WHERE id='line';''',
            '''UPDATE "PartRequisitionLine" SET rate=-1 WHERE id='line';''',
            '''UPDATE "PartRequisitionLine" SET "quantityIssued"=-1 WHERE id='line';''',
            '''UPDATE "PartRequisitionLine" SET "sparePartId"='missing' WHERE id='line';''',
            '''UPDATE "PartRequisition" SET "branchId"='branch1' WHERE id='other';''',
            '''UPDATE "PartRequisition" SET status='CANCELLED' WHERE id='req';''',
            '''UPDATE "PartReturnSlip" SET status='CANCELLED' WHERE id='slip';''',
            '''UPDATE "PartReturn" SET rate=NULL WHERE id='return';''',
            '''UPDATE "JobCardLabour" SET "standardHours"=-1 WHERE id='labour';''',
            '''UPDATE "JobCardLabour" SET "standardHours"='NaN' WHERE id='labour';''',
            '''DELETE FROM "PartRequisition" WHERE id='req';''',
        ]:
            query(scope + sql, ok=False)
        query(scope + '''UPDATE "PartRequisition" SET status='CANCELLED',"cancelledAt"=now(),"cancelledById"='actor',"cancelReason"='Correction' WHERE id='req';''')
        query(scope + migration)
        check(scope, '''SELECT rate FROM "PartRequisitionLine" WHERE id='line';''', '100.01')
        print('PASS: ' + name + ' schema, reapply, legacy data, snapshots, split links, hours, constraints')

    if args.baseline_sql:
        scope = 'SET search_path TO full_schema;'
        query('CREATE SCHEMA full_schema;' + scope + args.baseline_sql.read_text())
        query(scope + migration)
        query(scope + migration)
        print('PASS: full pre-P1 schema migration and reapply')
        if args.prisma_node:
            local_url = f'postgresql://issue113_test@127.0.0.1:{port}/postgres?schema=full_schema'
            environment = dict(os.environ, DATABASE_URL=local_url)
            result = subprocess.run([
                str(args.prisma_node), str(root / 'server/node_modules/prisma/build/index.js'),
                'migrate', 'diff', '--from-url', local_url,
                '--to-schema-datamodel', str(root / 'server/prisma/schema.prisma'), '--exit-code',
            ], capture_output=True, text=True, timeout=60, env=environment, creationflags=flags)
            assert result.returncode == 0, result.stdout + result.stderr
            print('PASS: migrated full schema matches Prisma (no drift)')
    print('PASS: P1 migration checks (isolated localhost only)')
finally:
    if started:
        run('pg_ctl.exe', '-D', cluster / 'data', '-m', 'immediate', '-w', 'stop')
