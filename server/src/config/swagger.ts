import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dana Motors Service Workshop API',
      version: '1.0.0',
      description: `
## Dana Motors Service Workshop Platform API

A comprehensive REST API powering the Dana Motors multi-branch vehicle service and workshop management platform.

### Authentication
All protected endpoints require a JWT Bearer token. Obtain tokens via \`POST /auth/login\` or \`POST /auth/refresh\`.

Include the token in the **Authorization** header:
\`\`\`
Authorization: Bearer <your_access_token>
\`\`\`

### Pagination
List endpoints support query parameters: \`page\` (default: 1), \`limit\` (default: 20), \`search\`.

### Error Responses
All errors follow the \`ErrorResponse\` schema with a \`status: "error"\` field and a descriptive \`message\`.
      `.trim(),
      contact: {
        name: 'Dana Motors Engineering',
        email: 'ayeoluwaseyi@gmail.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:8000/api',
        description: 'Local Development Server',
      },
      {
        url: 'https://staging-api.danamotors.com/api',
        description: 'Staging Server',
      },
      {
        url: 'https://api.danamotors.com/api',
        description: 'Production Server',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'API health check endpoint',
      },
      {
        name: 'Auth',
        description: 'Authentication — registration, login, token refresh, password reset, and profile management.',
      },
      {
        name: 'Administration',
        description: 'User management, role definitions, and permission assignments (admin/super-admin only).',
      },
      {
        name: 'Customers',
        description: 'Customer profile records, documents, and service history.',
      },
      {
        name: 'Vehicles',
        description: 'Vehicle registry — VIN, mileage, specifications, images, and ownership history.',
      },
      {
        name: 'Service & Job Cards',
        description: 'Service appointments, job cards, and repair workflow management.',
      },
      {
        name: 'Inspections & Estimates',
        description: 'Vehicle inspection sheets, repair estimates, and customer approval workflows.',
      },
      {
        name: 'Services Catalog',
        description: 'Service catalog management — defining available service types and pricing.',
      },
      {
        name: 'Workshop',
        description: 'Technician management, job assignment, progress tracking, and quality control (QC).',
      },
      {
        name: 'Inventory & Parts',
        description: 'Spare parts registry, branch stock levels, purchase requests, issuances, returns, and inter-branch transfers.',
      },
      {
        name: 'Finance',
        description: 'Invoices, payments, receipts, and financial reports.',
      },
      {
        name: 'Branches',
        description: 'Multi-branch location management and branch settings.',
      },
      {
        name: 'Dashboard',
        description: 'Branch KPIs, stock alerts, revenue summaries, and operational metrics.',
      },
      {
        name: 'Search',
        description: 'Global search across customers, vehicles, job cards, and parts.',
      },
      {
        name: 'Notifications',
        description: 'In-app role-based notification feed with read/unread management.',
      },
      {
        name: 'Customer Portal',
        description: 'Customer-facing self-service endpoints — profile, vehicles, job cards, appointments, invoices, and credit.',
      },
      {
        name: 'Credit',
        description: 'Customer credit accounts, limits, applications, and aging analysis.',
      },
      {
        name: 'Enquiries',
        description: 'Online enquiry submission (public), staff review/approve/reject workflow, and enquiry management.',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token in the format: `Bearer <token>`',
        },
      },
      schemas: {
        // ── Standard Response Wrapper ─────────────────────────────────
        StandardResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['success'],
              example: 'success',
            },
            message: {
              type: 'string',
              example: 'Operation completed successfully',
            },
            data: {
              description: 'Response payload — varies by endpoint',
            },
          },
          required: ['status', 'message'],
        },
        // ── Pagination Meta ──────────────────────────────────────────
        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 120 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            totalPages: { type: 'integer', example: 6 },
          },
          required: ['total', 'page', 'limit', 'totalPages'],
        },
        // ── Error Response ──────────────────────────────────────────
        ErrorResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['error', 'fail'],
              example: 'error',
            },
            message: {
              type: 'string',
              example: 'An unexpected error occurred',
            },
          },
          required: ['status', 'message'],
        },
        // ── Validation Error ────────────────────────────────────────
        ValidationErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['fail'], example: 'fail' },
            message: { type: 'string', example: 'Validation failed' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'Invalid email address' },
                },
              },
            },
          },
          required: ['status', 'message'],
        },
        // ── Auth Tokens DTO ─────────────────────────────────────────
        AuthTokensDTO: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
          required: ['accessToken', 'refreshToken'],
        },
        // ── User DTO ────────────────────────────────────────────────
        UserDTO: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'cuid2...' },
            email: { type: 'string', format: 'email', example: 'tech@danamotors.com' },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            phoneNumber: { type: 'string', example: '+2348012345678', nullable: true },
            role: { type: 'string', example: 'TECHNICIAN' },
            branchId: { type: 'string', nullable: true, example: 'cuid2...' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'email', 'firstName', 'lastName', 'role'],
        },
        // ── Customer DTO ────────────────────────────────────────────
        CustomerDTO: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            firstName: { type: 'string', example: 'Adaeze' },
            lastName: { type: 'string', example: 'Okafor' },
            email: { type: 'string', format: 'email', nullable: true },
            phoneNumber: { type: 'string', example: '+2348012345678' },
            address: { type: 'string', nullable: true },
            branchId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'firstName', 'lastName'],
        },
        // ── Vehicle DTO ─────────────────────────────────────────────
        VehicleDTO: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            vin: { type: 'string', example: '1HGCM82633A123456', nullable: true },
            plateNumber: { type: 'string', example: 'LSD-123-AB' },
            make: { type: 'string', example: 'Toyota' },
            model: { type: 'string', example: 'Camry' },
            year: { type: 'integer', example: 2022 },
            color: { type: 'string', example: 'Silver', nullable: true },
            mileage: { type: 'integer', example: 45000, nullable: true },
            engineNumber: { type: 'string', nullable: true },
            customerId: { type: 'string', nullable: true },
            branchId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'plateNumber', 'make', 'model', 'year'],
        },
        // ── Job Card DTO ────────────────────────────────────────────
        JobCardDTO: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            jobCardNumber: { type: 'string', example: 'JC-2024-0042' },
            vehicleId: { type: 'string' },
            customerId: { type: 'string', nullable: true },
            branchId: { type: 'string' },
            status: {
              type: 'string',
              enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD'],
              example: 'IN_PROGRESS',
            },
            complaint: { type: 'string', example: 'Engine overheating' },
            diagnosis: { type: 'string', nullable: true },
            technicianId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'jobCardNumber', 'vehicleId', 'status'],
        },
        // ── Spare Part DTO ──────────────────────────────────────────
        SparePartDTO: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            partNumber: { type: 'string', example: 'TYT-OIL-5W30' },
            name: { type: 'string', example: 'Toyota 5W-30 Engine Oil (4L)' },
            description: { type: 'string', nullable: true },
            unitPrice: { type: 'number', format: 'float', example: 4500.0 },
            unit: { type: 'string', example: 'Litre', nullable: true },
            categoryId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'partNumber', 'name', 'unitPrice'],
        },
        // ── Invoice DTO ─────────────────────────────────────────────
        InvoiceDTO: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            invoiceNumber: { type: 'string', example: 'INV-2024-0099' },
            jobCardId: { type: 'string', nullable: true },
            customerId: { type: 'string', nullable: true },
            branchId: { type: 'string' },
            status: {
              type: 'string',
              enum: ['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED'],
              example: 'ISSUED',
            },
            totalAmount: { type: 'number', example: 75000.0 },
            paidAmount: { type: 'number', example: 50000.0 },
            dueDate: { type: 'string', format: 'date', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'invoiceNumber', 'status', 'totalAmount'],
        },
        // ── Branch DTO ──────────────────────────────────────────────
        BranchDTO: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Ikeja Branch' },
            address: { type: 'string', example: '14 Allen Avenue, Ikeja, Lagos' },
            phone: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'address'],
        },
      },
    },
    // Apply BearerAuth globally — individual endpoints can override with `security: []` to opt-out.
    security: [{ BearerAuth: [] }],
  },
  apis: [
    // Scan route files and the central routes index for @openapi JSDoc blocks
    // Normalize paths to use forward slashes so glob matching works on Windows.
    path.resolve(__dirname, '../routes/index.ts').replace(/\\/g, '/'),
    path.resolve(__dirname, '../modules/**/*.routes.ts').replace(/\\/g, '/'),
    // Also scan compiled .js equivalents when running from dist/
    path.resolve(__dirname, '../routes/index.js').replace(/\\/g, '/'),
    path.resolve(__dirname, '../modules/**/*.routes.js').replace(/\\/g, '/'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
