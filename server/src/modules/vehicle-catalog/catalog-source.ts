import { z } from 'zod';
import { normalizeCatalogName, catalogAliases } from './catalog-normalization';
const integer = z.number().int().nonnegative().nullable();
const numeric = z.number().finite().nonnegative().nullable();
const text = z.string().nullable();
const name = z.string().min(1).max(200).refine(value => value.trim().length > 0);
const engine = z.object({
  label: name, fuelType: text, cylinders: integer, displacementCc: integer,
  powerHp: numeric, torqueNm: numeric, transmission: text, drivetrain: text,
  zeroToHundredKmhS: numeric, topSpeedKmh: numeric, fuelEconomyCombinedL100: numeric,
  lengthMm: integer, widthMm: integer, heightMm: integer, wheelbaseMm: integer, curbWeightKg: integer,
  specs: z.record(z.string()),
}).strict();
export const catalogSourceSchema = z.object({ group: z.literal('kia'), makes: z.array(z.object({
  name, models: z.array(z.object({ name, yearStart: z.number().int(), yearEnd: z.number().int().nullable(),
    generations: z.array(z.object({ name, yearStart: z.number().int(), yearEnd: z.number().int().nullable(), bodyType: text, engines: z.array(engine) }).strict()).min(1),
  }).strict()).min(1),
}).strict()).min(1) }).strict();
export type CatalogSource = z.infer<typeof catalogSourceSchema>;
export const KIA_COUNTS = { makes: 1, models: 47, generations: 141, engines: 629 };
export function parseCatalog(input: unknown) {
  const data = catalogSourceSchema.parse(input);
  const counts = { makes: data.makes.length, models: 0, generations: 0, engines: 0 };
  const makeNames = new Set<string>();
  for (const make of data.makes) {
    if (makeNames.has(make.name)) throw new Error(`Duplicate make: ${make.name}`);
    makeNames.add(make.name);
    const modelNames = new Set<string>();
    for (const model of make.models) {
      if (modelNames.has(model.name) || !normalizeCatalogName(model.name)) throw new Error(`Invalid or duplicate model: ${model.name}`);
      modelNames.add(model.name); counts.models++;
      if (model.yearEnd !== null && model.yearEnd < model.yearStart) throw new Error(`Invalid model years: ${model.name}`);
      for (const generation of model.generations) {
        counts.generations++; counts.engines += generation.engines.length;
        if (generation.yearEnd !== null && generation.yearEnd < generation.yearStart) throw new Error(`Invalid generation years: ${generation.name}`);
      }
    }
  }
  for (const key of Object.keys(KIA_COUNTS) as (keyof typeof KIA_COUNTS)[]) {
    if (counts[key] !== KIA_COUNTS[key]) throw new Error(`Kia ${key}: expected ${KIA_COUNTS[key]}, received ${counts[key]}`);
  }
  return { data, counts };
}
export { normalizeCatalogName, catalogAliases };
