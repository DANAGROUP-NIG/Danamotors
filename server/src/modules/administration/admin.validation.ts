import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    phoneNumber: z.string().optional(),
    roleId: z.string().uuid('Invalid role ID'),
    branchName: z.string().min(1, 'Branch name is required'),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phoneNumber: z.string().optional(),
    roleId: z.string().uuid('Invalid role ID').optional(),
    isActive: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid user ID'),
  }),
});

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Role name is required'),
    description: z.string().optional(),
    permissions: z.array(z.string()).optional(), // array of permission names or IDs
  }),
});

export const updateRolePermissionsSchema = z.object({
  body: z.object({
    permissions: z.array(z.string()), // array of permission names
  }),
  params: z.object({
    id: z.string().uuid('Invalid role ID'),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID'),
  }),
});

export const roleIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid role ID'),
  }),
});
