import { z } from "zod";

/** Whole numbers typed in a text box, with a message that names the field and the fix. */
const whole = (name: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${name}`)
    .regex(/^\d+$/, `Enter the ${name} as a whole number`)
    .refine((value) => Number(value) >= min, `Enter ${min.toLocaleString("en-NG")} or more for the ${name}`)
    .refine((value) => Number(value) <= max, `Enter ${max.toLocaleString("en-NG")} or less for the ${name}`);

export const SERVICES_PER_YEAR = ["1", "2", "3", "4", "6", "12"] as const;

/** Warranty settings, Service history rule. Mirrors the server's serviceRuleBody. */
export const serviceRuleSchema = z.object({
  serviceIntervalMonths: whole("months between services", 1, 24),
  serviceIntervalKm: whole("km between services", 500, 100_000),
  servicesPerYear: z.enum(SERVICES_PER_YEAR, { errorMap: () => ({ message: "Choose the services per year" }) }),
  serviceGraceKm: whole("grace km", 0, 10_000),
  serviceGraceDays: whole("grace days", 0, 90),
});
export type ServiceRuleValues = z.infer<typeof serviceRuleSchema>;
