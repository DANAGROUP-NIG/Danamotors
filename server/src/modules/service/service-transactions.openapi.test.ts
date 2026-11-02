import swaggerSpec from '../../config/swagger';
import { transactionExamples as examples, serviceTransactionPaths, serviceTransactionSchemas } from './service-transactions.openapi';
import { createAppointmentSchema, updateAppointmentSchema, jobOpeningBody, jobUpdateBody } from './service.validation';
import { requisitionBody, cancelRequisitionSchema } from '../requisition/requisition.validation';
import { returnSlipBody, cancelReturnSlipSchema } from '../requisition/return-slip.validation';
import { labourSlipBody, labourSlipLineBody } from './labour-slip.validation';
import { serviceRemarksSchema } from './service-document.validation';

type Operation = { security: Record<string, string[]>[]; requestBody?: { content: { 'application/json': { schema: { properties?: Record<string, unknown>; required?: string[] }; examples?: Record<string, { value: unknown }> } } }; responses: Record<string, unknown>; parameters?: { name: string; in: string; required?: boolean }[] };
type Path = { parameters?: { name: string; in: string; required?: boolean }[] } & Partial<Record<'get' | 'post' | 'put' | 'delete', Operation>>;
const spec = swaggerSpec as { paths: Record<string, Path>; components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> } };
const id = '11111111-1111-4111-8111-111111111111';

it('validates booking create, update and conversion examples with the actual route bodies', () => {
  for (const body of [examples.booking, examples.minimalBooking]) expect(() => createAppointmentSchema.parse({ body })).not.toThrow();
  for (const body of [examples.reschedule, examples.cancelBooking, examples.noShow]) expect(() => updateAppointmentSchema.parse({ params: { id }, body })).not.toThrow();
  expect(() => jobOpeningBody.parse({ ...examples.conversion, customerId: id, vehicleId: examples.booking.vehicleId, branchName: examples.booking.branchName, description: 'Synthetic opening' })).not.toThrow();
});
it.each(['requisition', 'goodwill', 'warranty', 'free'] as const)('validates the %s requisition example', key => {
  expect(() => requisitionBody.parse(examples[key])).not.toThrow();
});
it('validates returns, cancellation, both mechanic types, remarks and existing job-update examples', () => {
  expect(() => returnSlipBody.parse(examples.returnSlip)).not.toThrow();
  for (const schema of [cancelRequisitionSchema, cancelReturnSlipSchema]) expect(() => schema.parse({ params: { id }, body: examples.cancellation })).not.toThrow();
  expect(() => labourSlipBody.parse(examples.labour)).not.toThrow();
  expect(() => labourSlipLineBody.parse(examples.employeeLabour)).not.toThrow();
  for (const body of [examples.remarks, examples.clearRemarks]) expect(() => serviceRemarksSchema.shape.body.parse(body)).not.toThrow();
  for (const body of [examples.workDone, examples.ready]) expect(() => jobUpdateBody.parse(body)).not.toThrow();
});
it('assembles every transaction path and preserves unrelated methods on shared job routes', () => {
  expect(Object.keys(serviceTransactionPaths)).toHaveLength(21);
  for (const [path, methods] of Object.entries(serviceTransactionPaths)) {
    for (const method of Object.keys(methods).filter(method => method !== 'parameters')) expect(spec.paths[path][method as 'get']).toBeDefined();
  }
  expect(spec.paths['/service/job-cards/{id}'].get).toBeDefined();
  expect(spec.paths['/service/job-cards/{id}'].put?.requestBody?.content['application/json'].examples?.ready.value).toEqual(examples.ready);
});
it('uses the real security scheme, resolves component references and declares every path parameter', () => {
  expect(spec.components.securitySchemes.BearerAuth).toBeDefined();
  const references = JSON.stringify({ paths: serviceTransactionPaths, schemas: serviceTransactionSchemas });
  for (const match of references.matchAll(/#\/components\/schemas\/([^"\s]+)/g)) expect(spec.components.schemas[match[1]]).toBeDefined();
  for (const [path, methods] of Object.entries(serviceTransactionPaths)) {
    const names = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
    for (const method of Object.keys(methods).filter(method => method !== 'parameters')) {
      const operation = spec.paths[path][method as 'get']!;
      expect(operation.security).toEqual([{ BearerAuth: [] }]);
      const params = [...(spec.paths[path].parameters ?? []), ...(operation.parameters ?? [])];
      for (const name of names) expect(params).toContainEqual(expect.objectContaining({ name, in: 'path', required: true }));
    }
  }
});
it('replaces obsolete booking field/status docs and documents only caller-owned body fields', () => {
  const booking = JSON.stringify(spec.paths['/service/appointments']);
  expect(booking).not.toContain('scheduledDate'); expect(booking).not.toContain('CONFIRMED');
  expect(serviceTransactionSchemas.ServiceBookingCreate.required).not.toContain('serviceId');
  expect(serviceTransactionSchemas.ServiceBookingCreate.properties).not.toHaveProperty('bookingNumber');
  expect(serviceTransactionSchemas.ServiceBookingCreate.properties).not.toHaveProperty('createdAt');
  expect(serviceTransactionSchemas.ServiceRequisition.properties).not.toHaveProperty('rate');
  expect(serviceTransactionSchemas.ServiceLabourLine.properties).not.toHaveProperty('standardHours');
  expect(spec.paths['/service/labour-slips/{id}/lines'].post?.responses['200']).toBeDefined();
});
