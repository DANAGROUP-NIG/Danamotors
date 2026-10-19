import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const date = z.coerce.date().nullable().optional();
const masterId = z.string().uuid().nullable().optional();

export const employeeBody = z.object({
  code: z.string().trim().min(1).max(20).transform(value => value.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  branchId: z.string().uuid(),
  designationId: masterId,
  departmentId: masterId,
  teamId: masterId,
  employeeType: z.enum(['OWN', 'CONTRACT']).optional(),
  grade: z.enum(['SENIOR', 'JUNIOR']).nullable().optional(),
  dateOfBirth: date,
  qualification: text(150),
  bloodGroup: text(5),
  experienceYears: z.number().min(0).max(80).nullable().optional(),
  block: text(150),
  street: text(150),
  district: text(100),
  city: text(100),
  state: text(100),
  pin: text(20),
  phone: text(30),
  joinDate: date,
  leftDate: date,
  userId: z.string().uuid().nullable().optional(),
}).strict();

const datesInOrder = (body: { joinDate?: Date | null; leftDate?: Date | null }) =>
  !body.joinDate || !body.leftDate || body.leftDate >= body.joinDate;
const datesMessage = { message: 'Left date cannot be before the join date', path: ['leftDate'] };

export const createEmployeeSchema = z.object({
  body: employeeBody.refine(datesInOrder, datesMessage),
});

export const updateEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),

  // The branch and code identify the employee on legacy documents, so they never change.
  body: employeeBody.omit({
    code: true,
    branchId: true,
  }).partial().strict().refine(datesInOrder, datesMessage),
});

export const employeeIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const listEmployeeSchema = z.object({
  query: z.object({
    search: z.string().trim().max(100).optional(),
    branchId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
    designationId: z.string().uuid().optional(),
    status: z.enum(['CURRENT', 'LEFT', 'ALL']).default('CURRENT'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export type EmployeeInput = z.infer<typeof employeeBody>;
export type EmployeeUpdate = Partial<Omit<EmployeeInput, 'code' | 'branchId'>>;
