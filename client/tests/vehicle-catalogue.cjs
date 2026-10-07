// Test the actual catalogue picker and vehicle form with isolated DOM dependencies.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(process.argv[2]);
const deps = createRequire(path.join(root, 'runtime.cjs'));
const { JSDOM } = deps('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
for (const name of ['HTMLElement', 'Element', 'MutationObserver']) global[name] = dom.window[name];
global.getComputedStyle = dom.window.getComputedStyle;
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const React = deps('react');
const { render, screen, waitFor, cleanup } = deps('@testing-library/react');
const userEvent = deps('@testing-library/user-event').default;
const { QueryClient, QueryClientProvider } = deps('@tanstack/react-query');
const { build } = deps('esbuild');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const customerId = id(1), variantId = id(2), colourId = id(3), otherId = id(4);
const first = { id: variantId, code: 'RIO-AT', description: 'Automatic', make: 'Kia', model: 'Rio', active: true,
  colours: [{ id: colourId, code: 'WHITE', description: 'White', active: true }] };
const other = { ...first, id: otherId, code: 'RIO-MT', description: 'Manual', colours: [] };
let reads = [], submitted, client;
global.__apiGet = async (url, options) => {
  reads.push({ url, signal: options?.signal });
  if (url.split('?')[0] === '/vehicle-catalog/models') return [{ id: id(6), make: 'Kia', name: 'Rio / Rio Sedan', searchName: 'rio rio sedan', aliases: ['rio', 'rio sedan'], yearStart: 2000, yearEnd: null }];
  if (url === `/vehicle-catalog/models/${id(6)}/options`) return [{ id: id(7), name: 'UB', yearStart: 2011, yearEnd: 2017, bodyType: 'Sedan', engines: [{ id: id(8), label: '1.4L', fuelType: 'Petrol', transmission: 'Automatic', drivetrain: 'FWD', powerHp: 100, cylinders: 4, displacementCc: 1400 }] }];
  if (url.startsWith('/vehicle-catalog/workshop-variants/')) return { item: url.endsWith(otherId) ? other : first };
  return { items: [first, other] };
};
(async () => {
  const clientRoot = path.resolve(__dirname, '..');
  const output = path.join(root, 'vehicle-catalogue-ui.cjs');
  await build({
    stdin: { contents: `export { VehicleCatalogueFields } from './features/vehicles/components/VehicleCatalogueFields';
      export { VehicleProfileForm } from './features/vehicles/components/VehicleProfileForm';`, resolveDir: clientRoot, loader: 'tsx' },
    outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    tsconfig: path.join(clientRoot, 'tsconfig.json'),
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@tanstack/react-query'],
    plugins: [{ name: 'isolate-api', setup(plugin) {
      plugin.onResolve({ filter: /^@\/lib\/api\/apiClient$/ }, () => ({ path: 'api', namespace: 'test' }));
      plugin.onResolve({ filter: /VehicleCustomerField$/ }, () => ({ path: 'customer', namespace: 'test' }));
      plugin.onResolve({ filter: /\/use-warranty$/ }, () => ({ path: 'warranty', namespace: 'test' }));
      plugin.onLoad({ filter: /.*/, namespace: 'test' }, ({ path: name }) => ({ loader: 'tsx', contents:
        name === 'api' ? 'export const apiGet = (...args) => globalThis.__apiGet(...args);'
          : name === 'warranty' ? 'export const useVehicleModels = () => ({data: []});'
          : `export const VehicleCustomerField = ({onChange,readOnly}) => readOnly ? <p>Linked customer</p> : <button type="button" onClick={() => onChange('${customerId}')}>Select customer</button>;`
      }));
    } }],
  });
  const { VehicleCatalogueFields, VehicleProfileForm } = require(output);
  const user = userEvent.setup();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrap = component => React.createElement(QueryClientProvider, { client }, component);
  function Harness({ saved = false }) {
    const [variant, setVariant] = React.useState(saved ? variantId : null);
    const [colour, setColour] = React.useState(saved ? colourId : null);
    return React.createElement(React.Fragment, null,
      React.createElement(VehicleCatalogueFields, { catalogueId: variant, colourId: colour,
        onChange: (next, paint) => { setVariant(next); setColour(paint); } }),
      React.createElement('output', { 'data-testid': 'colour' }, colour ?? 'unset'));
  }
  render(wrap(React.createElement(Harness)));
  assert.equal(reads.length, 0, 'No catalogue request before opening an empty selector');
  assert(screen.getByRole('combobox', { name: 'Catalogue colour' }).disabled);
  const selector = screen.getByRole('combobox', { name: 'Vehicle catalogue' });
  await user.click(selector);
  await screen.findByRole('option', { name: /Automatic/ });
  reads = [];
  await user.type(selector, 'Kia Rio');
  await waitFor(() => assert.equal(reads.filter(read => read.url.includes('search=Kia%20Rio')).length, 1));
  assert.equal(reads.length, 1, 'Rapid typing is debounced to one search');
  assert(reads[0].url.includes('limit=20'));
  assert(reads[0].signal, 'Search requests support cancellation');
  await user.click(screen.getByRole('option', { name: /Automatic/ }));
  await waitFor(() => assert(!screen.getByRole('combobox', { name: 'Catalogue colour' }).disabled));
  await user.click(screen.getByRole('combobox', { name: 'Catalogue colour' }));
  const beforeColour = reads.length;
  await user.click(screen.getByRole('option', { name: /White/ }));
  assert.equal(reads.length, beforeColour, 'Colour selection searches locally');
  assert.equal(screen.getByTestId('colour').textContent, colourId);
  await user.click(selector);
  await screen.findByRole('option', { name: /Manual/ });
  await waitFor(() => assert(!screen.queryByText('Searching...')));
  await user.click(screen.getByRole('option', { name: /Manual/ }));
  assert.equal(screen.getByTestId('colour').textContent, 'unset');
  await waitFor(() => assert(!screen.getByRole('combobox', { name: 'Catalogue colour' }).disabled));
  await user.click(screen.getByRole('combobox', { name: 'Catalogue colour' }));
  await screen.findByText(/No active colours configured/);
  cleanup(); client.clear(); reads = [];
  render(wrap(React.createElement(Harness, { saved: true })));
  await waitFor(() => assert(screen.getByRole('combobox', { name: 'Vehicle catalogue' }).value.includes('Kia / Rio / Automatic')));
  assert.equal(reads.length, 1, 'Saved selection loads directly without searching the first page');
  assert(screen.getByRole('combobox', { name: 'Catalogue colour' }).value.includes('White'));
  cleanup(); client.clear();
  const vehicle = { id: id(9), vin: 'SAVED', catalogueId: variantId, colourId, make: 'Kia', model: 'Rio', customMake: 'Kia', customModel: 'Rio', color: 'White', registrationNumber: '', customer: { id: customerId } };
  render(wrap(React.createElement(VehicleProfileForm, { vehicle, pending: false, failed: false, onSubmit: value => { submitted = value; } })));
  await user.click(screen.getByRole('button', { name: 'Save vehicle' }));
  await waitFor(() => assert(submitted));
  for (const field of ['catalogueId', 'colourId', 'modelId', 'customModel', 'customMake', 'color']) assert(!(field in submitted), `Metadata edit preserves ${field}`);
  cleanup(); client.clear(); submitted = undefined;
  render(wrap(React.createElement(VehicleProfileForm, { pending: false, failed: false, onSubmit: value => { submitted = value; } })));
  await user.click(screen.getByRole('button', { name: 'Select customer' }));
  await user.type(screen.getByLabelText('VIN'), 'NEW');
  assert.equal(screen.getByRole('combobox', { name: 'Vehicle catalogue source' }).value, 'model');
  const modelPicker = screen.getByRole('combobox', { name: /Model/ });
  await user.click(modelPicker);
  const beforeSearch = reads.filter(read => read.url === '/vehicle-catalog/models').length;
  await user.type(modelPicker, 'Kia Rio');
  assert.equal(screen.queryByRole('option', { name: 'Add "Kia Rio"' }), null, 'Make plus alias is an exact catalogue match');
  await user.click(await screen.findByRole('option', { name: /Rio \/ Rio Sedan/ }));
  assert.equal(reads.filter(read => read.url === '/vehicle-catalog/models').length, beforeSearch, 'Model search is local');
  await waitFor(() => assert(!screen.getByLabelText('Generation (optional)').disabled));
  assert.equal(screen.getByLabelText('Make').value, 'Kia');
  await user.selectOptions(screen.getByLabelText('Generation (optional)'), id(7));
  await user.selectOptions(screen.getByLabelText('Engine (optional)'), id(8));
  assert(screen.getByText('Petrol'));
  await user.click(modelPicker);
  await user.clear(modelPicker);
  await user.type(modelPicker, 'uncommitted search');
  await user.keyboard('{Escape}');
  assert(modelPicker.value.includes('Rio'), 'Uncommitted search must not erase the selected model or engine');
  await user.click(screen.getByRole('button', { name: 'Save vehicle' }));
  await waitFor(() => assert(submitted));
  assert.equal(submitted.modelId, id(6));
  assert.equal(submitted.generationId, id(7));
  assert.equal(submitted.engineId, id(8));
  assert.equal(submitted.catalogueId, null);
  assert.equal(submitted.customerId, customerId);
  assert.equal(submitted.customModel, null);
  cleanup(); client.clear(); submitted = undefined;
  const catalogVehicle = { ...vehicle, catalogueId: null, colourId: null, modelId: id(6), generationId: id(7), engineId: id(8), customModel: null, customMake: null };
  render(wrap(React.createElement(VehicleProfileForm, { vehicle: catalogVehicle, pending: false, failed: false, onSubmit: value => { submitted = value; } })));
  await user.click(screen.getByRole('button', { name: 'Save vehicle' }));
  await waitFor(() => assert(submitted));
  for (const field of ['modelId', 'generationId', 'engineId']) assert(!(field in submitted), 'Metadata-only model edit preserves catalogue references');
  await waitFor(() => assert(!screen.getByLabelText('Generation (optional)').disabled));
  await user.selectOptions(screen.getByLabelText('Generation (optional)'), '');
  submitted = undefined;
  await user.click(screen.getByRole('button', { name: 'Save vehicle' }));
  await waitFor(() => assert(submitted));
  assert.equal(submitted.modelId, id(6));
  assert.equal(submitted.generationId, null);
  assert.equal(submitted.engineId, null, 'Changing generation clears the saved engine');
  cleanup(); client.clear(); submitted = undefined;
  render(wrap(React.createElement(VehicleProfileForm, { vehicle, pending: false, failed: false, onSubmit: value => { submitted = value; } })));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Vehicle catalogue source' }), 'model');
  const editModel = screen.getByRole('combobox', { name: /Model/ });
  await user.click(editModel);
  await user.type(editModel, 'Kia Rio');
  await user.click(await screen.findByRole('option', { name: /Rio \/ Rio Sedan/ }));
  await waitFor(() => assert(!screen.getByLabelText('Generation (optional)').disabled));
  await user.selectOptions(screen.getByLabelText('Generation (optional)'), id(7));
  await user.selectOptions(screen.getByLabelText('Engine (optional)'), id(8));
  await user.click(screen.getByRole('button', { name: 'Save vehicle' }));
  await waitFor(() => assert(submitted));
  assert.equal(submitted.catalogueId, null, 'Editing replaces the previous workshop variant');
  assert.equal(submitted.colourId, null);
  assert.equal(submitted.modelId, id(6));
  assert.equal(submitted.generationId, id(7));
  assert.equal(submitted.engineId, id(8));
  cleanup(); client.clear(); submitted = undefined;
  const populatedApi = global.__apiGet;
  global.__apiGet = async (url, options) => url === '/vehicle-catalog/models' ? [] : populatedApi(url, options);
  render(wrap(React.createElement(VehicleProfileForm, { pending: false, failed: false, onSubmit: value => { submitted = value; } })));
  await screen.findByText(/No vehicle models have been loaded yet/);
  global.__apiGet = populatedApi;
  await user.click(screen.getByRole('button', { name: 'Refresh catalogue' }));
  await waitFor(() => assert(reads.some(read => read.url.includes('/vehicle-catalog/models?refresh=1&request=')), 'Manual refresh bypasses HTTP and server caches'));
  await waitFor(() => assert.equal(screen.queryByText(/No vehicle models have been loaded yet/), null));
  await user.click(screen.getByRole('combobox', { name: /Model/ }));
  await screen.findByRole('option', { name: /Rio \/ Rio Sedan/ });
  console.log('PASS: workshop compatibility, saved selections, metadata preservation, model-table creation, generation/engine specifications, local model search and uncommitted search preservation');
  cleanup(); client.clear(); dom.window.close();
})().catch(error => { console.error(error); process.exitCode = 1; cleanup(); client?.clear(); dom.window.close(); });
