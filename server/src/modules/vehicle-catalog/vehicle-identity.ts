import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';
export type VehicleIdentity = { modelId?: string | null; generationId?: string | null; engineId?: string | null; customModel?: string | null; customMake?: string | null };
export async function resolveVehicleIdentity(tx: Prisma.TransactionClient, input: VehicleIdentity) {
  if (input.modelId) {
    if (input.customModel?.trim()) throw new BadRequestError('Choose either a catalog model or a custom model');
    const model = await tx.vehicleCatalogModel.findUnique({ where: { id: input.modelId }, include: { make: true } });
    if (!model) throw new BadRequestError('Catalog model not found');
    const generation = input.generationId ? await tx.vehicleCatalogGeneration.findUnique({ where: { id: input.generationId } }) : null;
    if (input.generationId && (!generation || generation.modelId !== model.id)) throw new BadRequestError('Generation does not belong to the selected model');
    const engine = input.engineId ? await tx.vehicleCatalogEngine.findUnique({ where: { id: input.engineId }, select: { id: true, generationId: true, label: true } }) : null;
    if (input.engineId && (!generation || !engine || engine.generationId !== generation.id)) throw new BadRequestError('Engine does not belong to the selected generation');
    return { modelId: model.id, generationId: generation?.id ?? null, engineId: engine?.id ?? null, customMake: null, customModel: null, make: model.make.name, model: model.name, trim: engine?.label ?? generation?.name ?? null, catalogueId: null, colourId: null };
  }
  const customModel = input.customModel?.trim().replace(/\s+/g, ' ');
  if (!customModel || customModel.length > 80) throw new BadRequestError('Enter a custom model (maximum 80 characters)');
  if (input.generationId || input.engineId) throw new BadRequestError('Custom vehicles cannot have catalog generation or engine selections');
  const customMake = input.customMake?.trim().replace(/\s+/g, ' ') || null;
  if (customMake && customMake.length > 80) throw new BadRequestError('Custom make must not exceed 80 characters');
  return { modelId: null, generationId: null, engineId: null, customMake, customModel, make: customMake, model: customModel, trim: null, catalogueId: null, colourId: null };
}
