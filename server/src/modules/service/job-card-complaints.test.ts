import { Prisma } from '@prisma/client';
import { resolveJobComplaints } from './job-card-complaints';

const defects = jest.fn();
const complaints = jest.fn();
const db = { warrantyDefectCode: { findMany: defects }, workshopMaster: { findMany: complaints } } as unknown as Prisma.TransactionClient;
beforeEach(() => { jest.clearAllMocks(); defects.mockResolvedValue([]); complaints.mockResolvedValue([]); });
it('fills a database defect description and keeps it separate from workshop complaint foreign keys', async () => {
  defects.mockResolvedValue([{ code: 'D07', description: 'Internal short', isActive: true }]);
  expect(await resolveJobComplaints(db, [{ defectCode: 'D07' }])).toEqual([
    { complaintCodeId: undefined, defectCode: 'D07', description: 'Internal short', spare: 0, oil: 0, labour: 0 },
  ]);
  expect(complaints).not.toHaveBeenCalled();
});
it('deduplicates repeated defect selections into one lookup and preserves entered details', async () => {
  defects.mockResolvedValue([{ code: 'D07', description: 'Internal short', isActive: true }]);
  const result = await resolveJobComplaints(db, Array.from({ length: 100 }, () => ({ defectCode: 'D07', description: 'Customer details', labour: 50 })));
  expect(defects).toHaveBeenCalledTimes(1);
  expect(defects.mock.calls[0][0].where.code.in).toEqual(['D07']);
  expect(result[0]).toMatchObject({ description: 'Customer details', labour: 50 });
});
it('rejects inactive defects and unknown codes without a description', async () => {
  defects.mockResolvedValue([{ code: 'D07', description: 'Internal short', isActive: false }]);
  await expect(resolveJobComplaints(db, [{ defectCode: 'D07' }])).rejects.toThrow('active defect');
  await expect(resolveJobComplaints(db, [{ defectCode: 'UNKNOWN' }])).rejects.toThrow('description');
});
it('preserves legacy/imported request descriptions and existing complaint links', async () => {
  complaints.mockResolvedValue([{ id: 'legacy', code: 'C01', description: 'Noise' }]);
  expect(await resolveJobComplaints(db, [{ complaintCodeId: 'legacy' }, { defectCode: '9999999', description: 'Imported estimate' }])).toMatchObject([
    { complaintCodeId: 'legacy', defectCode: 'C01', description: 'Noise' }, { defectCode: '9999999', description: 'Imported estimate' },
  ]);
});
