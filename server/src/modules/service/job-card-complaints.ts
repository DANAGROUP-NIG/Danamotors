import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';

type RequestInput = { complaintCodeId?: string; defectCode?: string; description?: string; spare?: number; oil?: number; labour?: number };

// Batch lookups, regardless of how many customer requests were entered.
export async function resolveJobComplaints(db: Prisma.TransactionClient, requests: RequestInput[]) {
  const ids = [...new Set(requests.flatMap(row => row.complaintCodeId ? [row.complaintCodeId] : []))];
  const codes = [...new Set(requests.flatMap(row => row.defectCode ? [row.defectCode] : []))];
  const [complaints, defects] = await Promise.all([
    ids.length ? db.workshopMaster.findMany({ where: { id: { in: ids }, kind: 'COMPLAINT', active: true }, select: { id: true, code: true, description: true } }) : [],
    codes.length ? db.warrantyDefectCode.findMany({ where: { code: { in: codes } }, select: { code: true, description: true, isActive: true } }) : [],
  ]);
  const complaintMap = new Map(complaints.map(row => [row.id, row]));
  const defectMap = new Map(defects.map(row => [row.code, row]));
  return requests.map(row => {
    const complaint = row.complaintCodeId ? complaintMap.get(row.complaintCodeId) : undefined;
    if (row.complaintCodeId && !complaint) throw new BadRequestError('Select an active complaint code');
    const defect = row.defectCode ? defectMap.get(row.defectCode) : undefined;
    if (defect && !defect.isActive) throw new BadRequestError('Select an active defect code');
    const description = row.description?.trim() || defect?.description || complaint?.description;
    if (!description) throw new BadRequestError('Enter a customer request description');
    return { complaintCodeId: complaint?.id, defectCode: defect?.code ?? complaint?.code ?? row.defectCode,
      description, spare: row.spare ?? 0, oil: row.oil ?? 0, labour: row.labour ?? 0 };
  });
}
