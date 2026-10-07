import { FILTER_LABELS } from './core/labels';
import { MAX_RANGE_DAYS } from './core/filters';
import { MAX_REPORT_ROWS } from './core/shape';
import type { ReportDefinition, ReportParamDoc } from './core/types';
import { LOOKUP_SOURCES } from './lookups';

const idListParam = (name: string, label: string): ReportParamDoc => ({
  name,
  description: `${label} ids, comma separated. Omit for All.`,
  schema: { type: 'string', example: '3f6d0f9e-1b2c-4d5e-8f90-1234567890ab' },
});

const SHARED_PARAMS: ReportParamDoc[] = [
  {
    name: 'branchId',
    description: 'Admin and SuperAdmin only: a branch id or ALL. Other users always get their own branch.',
    schema: { type: 'string' },
  },
  {
    name: 'mode',
    description: 'both (detail with summary, default), summary (totals only, no rows) or detail.',
    schema: { type: 'string', enum: ['both', 'summary', 'detail'], default: 'both' },
  },
];

function dateParams(definition: ReportDefinition): ReportParamDoc[] {
  if (definition.period === 'date') return [{ name: 'date', required: true, description: 'Report date (YYYY-MM-DD, branch local time).', schema: { type: 'string', format: 'date' } }];
  return [
    { name: 'from', required: true, description: 'First day (YYYY-MM-DD, branch local time).', schema: { type: 'string', format: 'date' } },
    { name: 'to', required: true, description: `Last day, inclusive. At most ${MAX_RANGE_DAYS} days after from.`, schema: { type: 'string', format: 'date' } },
  ];
}

const responseSchema = (example?: Record<string, unknown>) => ({
  type: 'object',
  properties: {
    status: { type: 'string', example: 'success' },
    statusCode: { type: 'integer', example: 200 },
    data: {
      type: 'object',
      description: `report, filters (query and applied labels), rows (omitted in summary mode, at most ${MAX_REPORT_ROWS}), groups with subtotals, totals, summary and meta.`,
      ...(example ? { example } : {}),
    },
  },
});

/** OpenAPI paths for /reports/*, built from the registry so the docs always match the routes. */
export function buildReportPaths(reports: ReportDefinition[]): Record<string, unknown> {
  const paths: Record<string, unknown> = {
    '/reports/lookups/{source}': {
      get: {
        tags: ['Reports'],
        summary: 'Dropdown options for the report filters',
        description: 'Masters, labour operations and staff (branch-scoped). Requires any report permission. Inactive entries are included and flagged.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'source', required: true, schema: { type: 'string', enum: [...LOOKUP_SOURCES] } },
          { in: 'query', name: 'branchId', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Options', content: { 'application/json': { schema: responseSchema({ status: 'success', data: [{ id: 'uuid', label: 'Sportage', code: 'SPG', parentId: null, active: true }] }) } } },
          403: { description: 'No report permission' },
        },
      },
    },
  };

  paths['/reports/settings'] = {
    get: {
      tags: ['Reports'],
      summary: 'Report settings: mileage bands and the due-soon threshold',
      description: 'Requires any report permission.',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Settings',
          content: { 'application/json': { schema: responseSchema({ mileageBands: [{ id: 'uuid', fromKm: 0, toKm: 1000, label: '0–1,000 km', active: true, sortOrder: 1 }], dueSoonHours: 2 }) } },
        },
      },
    },
    put: {
      tags: ['Reports'],
      summary: 'Save report settings',
      description: 'Requires `report:settings`. mileageBands replaces the whole list (ascending, no overlaps, only the last open-ended).',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                mileageBands: { type: 'array', items: { type: 'object', properties: { fromKm: { type: 'integer' }, toKm: { type: 'integer', nullable: true }, label: { type: 'string' }, active: { type: 'boolean' } } } },
                dueSoonHours: { type: 'integer', minimum: 0, maximum: 72 },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Saved settings' }, 400: { description: 'Overlapping or out-of-order bands' }, 403: { description: 'Missing report:settings' } },
    },
  };

  for (const definition of reports) {
    const params = [
      ...dateParams(definition),
      ...definition.filterKeys.map((key) => idListParam(key, FILTER_LABELS[key])),
      ...(definition.params ?? []),
      ...SHARED_PARAMS,
    ];
    paths[`/reports/${definition.slug}`] = {
      get: {
        tags: ['Reports'],
        summary: `${definition.title} (${definition.width} column)`,
        description: `${definition.summary}\n\nRequires \`${definition.permission}\`. Cancelled jobs and bills are excluded.`,
        security: [{ BearerAuth: [] }],
        parameters: params.map((param) => ({ in: 'query', name: param.name, required: Boolean(param.required), description: param.description, schema: param.schema })),
        responses: {
          200: { description: 'Report', content: { 'application/json': { schema: responseSchema(definition.example) } } },
          400: { description: 'Invalid filters (bad date, range over 366 days, unknown parameter)' },
          403: { description: 'Missing permission, or another branch requested by a non-admin' },
        },
      },
    };
  }
  return paths;
}
