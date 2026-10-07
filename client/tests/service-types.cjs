// Isolated React/DOM checks. Pass a directory containing the UI QA dependencies.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const toolsRoot = path.resolve(process.argv[2]);
const fromTools = createRequire(path.join(toolsRoot, 'test-runtime.cjs'));
const { JSDOM } = fromTools('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window;
global.self = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.MutationObserver = dom.window.MutationObserver;
global.getComputedStyle = dom.window.getComputedStyle;
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const React = fromTools('react');
const { render, screen, waitFor, cleanup, within } = fromTools('@testing-library/react');
const userEvent = fromTools('@testing-library/user-event').default;
const { QueryClient, QueryClientProvider } = fromTools('@tanstack/react-query');
const { build } = fromTools('esbuild');

const paid = { id: 'paid', code: 'RG', description: 'PAID SERVICE', chargedTo: 'CUSTOMER', serviceCharge: 15100 };
const free = { id: 'first', code: '1F', description: 'FIRST SERVICE', chargedTo: 'COMPANY', serviceCharge: 0 };
let reads = [];
let writes = [];
let settings = [];
let client;
let modelConfigured = false;
global.__apiGet = async url => {
  reads.push(url);
  if (url.startsWith('/job-cards/service-types')) {
    const params = new URL(url, 'http://localhost').searchParams;
    if (params.get('vehicleId') === 'missing-model') return { items: [], message: 'Vehicle has no model set; update the vehicle first' };
    if (params.get('vehicleId') === 'other') return { items: [free], message: null };
    if (params.get('vehicleId') === 'awaiting-config' && !modelConfigured) return { items: [], reason: 'MODEL_NOT_CONFIGURED', message: 'No workshop service model is configured for Kia Sportage.' };
    return { items: [{ ...paid, serviceCharge: params.get('vehicleId') === 'repriced' ? 9900 : 15100 }, free], message: null };
  }
  if (url.startsWith('/service-type-model-settings')) return { items: [...settings], meta: { total: settings.length, totalPages: 1 } };
  if (url.startsWith('/job-cards/defect-codes')) return { items: [
    { id: 'defect-one', code: 'D07', description: 'Internal short' }, { id: 'defect-two', code: 'D08', description: 'Loose connection' },
  ] };
  return { items: [{ id: 'rio', code: 'RIO', description: 'Rio' }] };
};
global.__apiPost = async (url, payload) => {
  writes.push({ method: 'POST', url, payload });
  settings = [{ ...payload, id: 'setting', model: { id: 'rio', code: 'RIO', description: 'Rio' } }];
  return { item: settings[0] };
};
global.__apiPut = async (url, payload) => {
  writes.push({ method: 'PUT', url, payload });
  settings = [{ ...settings[0], ...payload }];
  return { item: settings[0] };
};
global.__apiDelete = async url => { writes.push({ method: 'DELETE', url }); settings = []; };

(async () => {
  const clientRoot = path.resolve(__dirname, '..');
  const output = path.join(toolsRoot, 'service-types-ui.cjs');
  await build({
    stdin: { contents: `export { ServiceTypePicker } from './features/job-cards/components/ServiceTypePicker';
      export { ServiceTypeModelSettings } from './features/settings/components/service-type-model-settings';
      import { useForm, FormProvider } from 'react-hook-form';
      import { CustomerRequestsTab, emptyRequest } from './features/job-cards/components/opening/CustomerRequestsTab';
      export function RequestHarness() {
        const form = useForm({defaultValues: {complaints: [{...emptyRequest(), complaintCodeId: 'legacy'}]}});
        return <FormProvider {...form}><CustomerRequestsTab /><output data-testid="request-data">{JSON.stringify(form.watch('complaints'))}</output></FormProvider>;
      }`, resolveDir: clientRoot, loader: 'tsx' },
    outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    tsconfig: path.join(clientRoot, 'tsconfig.json'),
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@tanstack/react-query'],
    plugins: [{ name: 'mock-api', setup(plugin) {
      plugin.onResolve({ filter: /^@\/lib\/api\/apiClient$/ }, () => ({ path: 'mock-api', namespace: 'mock-api' }));
      plugin.onLoad({ filter: /.*/, namespace: 'mock-api' }, () => ({ contents:
        ['Get', 'Post', 'Put', 'Delete'].map(verb => `export const api${verb} = (...args) => globalThis.__api${verb}(...args);`).join('\n'), loader: 'js' }));
    } }],
  });
  const { ServiceTypePicker, ServiceTypeModelSettings, RequestHarness } = require(output);
  const user = userEvent.setup();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  function PickerHarness({ vehicleId }) {
    const [value, setValue] = React.useState('');
    const [charge, setCharge] = React.useState();
    return React.createElement(React.Fragment, null,
      React.createElement(ServiceTypePicker, { vehicleId, date: '2026-10-07', value, serviceCharge: charge, onChange: setValue, onCharge: setCharge, onBlur: () => {}, canConfigure: vehicleId === 'awaiting-config' }),
      React.createElement('output', { 'data-testid': 'charge' }, charge ?? 'unset'),
      React.createElement('output', { 'data-testid': 'selection' }, value),
      React.createElement('button', { onClick: () => setCharge(17) }, 'Override charge'),
    );
  }
  const wrapped = vehicleId => React.createElement(QueryClientProvider, { client }, React.createElement(PickerHarness, { vehicleId }));
  const picker = render(wrapped(undefined));
  assert(screen.getByRole('combobox', { name: 'Service' }).disabled);
  assert.equal(reads.length, 0);
  picker.rerender(wrapped('sold'));
  await waitFor(() => assert(!screen.getByRole('combobox', { name: 'Service' }).disabled));
  await user.click(screen.getByRole('combobox', { name: 'Service' }));
  await user.click(screen.getByRole('option', { name: /PAID SERVICE RG/ }));
  await waitFor(() => assert.equal(screen.getByTestId('charge').textContent, '15100'));
  assert(screen.getByText('Customer'));
  await user.click(screen.getByText('Override charge'));
  assert.equal(screen.getByTestId('charge').textContent, '17');
  const beforeSearch = reads.length;
  await user.click(screen.getByRole('combobox', { name: 'Service' }));
  await user.type(screen.getByRole('combobox', { name: 'Service' }), 'RG');
  assert.equal(screen.getAllByRole('option').length, 1);
  assert.equal(reads.length, beforeSearch, 'Typing must not call the database');
  await user.keyboard('{Escape}');
  picker.rerender(wrapped('repriced'));
  await waitFor(() => assert.equal(screen.getByTestId('charge').textContent, '9900'));
  assert.equal(screen.getByTestId('selection').textContent, 'paid');
  picker.rerender(wrapped('other'));
  await waitFor(() => assert.equal(screen.getByTestId('selection').textContent, ''));
  assert.equal(screen.getByTestId('charge').textContent, 'unset');
  await user.click(screen.getByRole('combobox', { name: 'Service' }));
  await user.keyboard('{ArrowDown}{Enter}');
  await waitFor(() => assert.equal(screen.getByTestId('charge').textContent, '0'));
  assert(screen.getByText('Company'));
  picker.rerender(wrapped('missing-model'));
  await screen.findByText('Vehicle has no model set; update the vehicle first');
  await waitFor(() => assert.equal(screen.getByTestId('selection').textContent, ''));
  picker.rerender(wrapped('awaiting-config'));
  await screen.findByText('No workshop service model is configured for Kia Sportage.');
  assert.equal(screen.getByRole('link', { name: 'Configure model services' }).getAttribute('href'), '/settings/workshop-masters');
  assert.equal(screen.getByTestId('selection').textContent, '', 'Missing configuration must not fall back to unrelated types');
  modelConfigured = true;
  await user.click(screen.getByRole('button', { name: 'Refresh services' }));
  await waitFor(() => assert(!screen.queryByText('No workshop service model is configured for Kia Sportage.')));
  await user.click(screen.getByRole('combobox', { name: 'Service' }));
  await user.click(screen.getByRole('option', { name: /PAID SERVICE RG/ }));
  await waitFor(() => assert.equal(screen.getByTestId('charge').textContent, '15100'));
  cleanup();

  render(React.createElement(QueryClientProvider, { client }, React.createElement(ServiceTypeModelSettings, { serviceTypeId: 'type' })));
  await user.click(screen.getByRole('button', { name: 'Add model' }));
  await user.click(screen.getByRole('combobox', { name: 'Model' }));
  await user.click(await screen.findByRole('option', { name: /RIO.*Rio/ }));
  const form = screen.getByRole('button', { name: 'Save charges' }).closest('form');
  const fields = within(form).getAllByRole('spinbutton');
  await user.clear(fields[0]); await user.type(fields[0], '15100');
  await user.type(fields[1], '12800');
  const dateInput = form.querySelector('input[type="date"]');
  const { fireEvent } = fromTools('@testing-library/react');
  fireEvent.change(dateInput, { target: { value: '2022-04-20' } });
  await user.click(screen.getByRole('button', { name: 'Save charges' }));
  await screen.findByRole('button', { name: 'Edit' });
  assert.deepEqual(writes[0].payload, { serviceTypeId: 'type', modelId: 'rio', serviceCharge: 15100, previousCharge: 12800, effectiveFrom: '2022-04-20T00:00:00.000Z', active: true });
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  assert(screen.getByRole('combobox', { name: 'Model' }).disabled);
  await user.click(screen.getByRole('checkbox', { name: 'Active setting' }));
  await user.click(screen.getByRole('button', { name: 'Save charges' }));
  await waitFor(() => assert.equal(writes[1].payload.active, false));
  assert.equal(writes[1].method, 'PUT');
  assert(!('modelId' in writes[1].payload));
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await user.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => assert.equal(writes[2].method, 'DELETE'));
  cleanup(); client.clear(); reads = [];
  render(React.createElement(QueryClientProvider, { client }, React.createElement(RequestHarness)));
  assert.equal(reads.length, 0, 'Defect queries are lazy');
  await user.click(screen.getByRole('combobox', { name: 'Defect' }));
  await user.click(await screen.findByRole('option', { name: /Internal short/ }));
  assert.equal(screen.getByRole('textbox', { name: 'Request 1 description' }).value, 'Internal short');
  let request = JSON.parse(screen.getByTestId('request-data').textContent)[0];
  assert.equal(request.defectCode, 'D07');
  assert.equal(request.complaintCodeId, '', 'Warranty defect UUID must not become a workshop complaint foreign key');
  await user.click(screen.getByRole('combobox', { name: 'Defect' }));
  await user.click(await screen.findByRole('option', { name: /Loose connection/ }));
  assert.equal(screen.getByRole('textbox', { name: 'Request 1 description' }).value, 'Loose connection');
  request = JSON.parse(screen.getByTestId('request-data').textContent)[0];
  assert.equal(request.defectCode, 'D08');
  assert.equal(reads.length, 1, 'Reopening the defect list reuses the search cache');
  console.log('PASS: service defaults, overrides, model-charge CRUD and database defect selection, description replacement, request persistence and cached lookup');
  cleanup(); client.clear(); dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; cleanup(); client?.clear(); dom.window.close(); });
