/** Offline QA: render the real shared component and invoke its real XLSX handler.
 * Usage: node doc/testing/verify-monthly-report-output.cjs input.json output-directory
 * Input: [{slug,result}] from synthetic localhost fixtures. No database/network access.
 * Run after client production build; requires the existing client/server dependencies.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const client = path.join(root, 'client');
const ts = require(path.join(root, 'server/node_modules/typescript'));
const React = require(path.join(client, 'node_modules/react'));
const { renderToStaticMarkup } = require(path.join(client, 'node_modules/react-dom/server'));
const XLSX = require(path.join(client, 'node_modules/xlsx'));
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const output = path.resolve(process.argv[3]);
fs.mkdirSync(output, { recursive: true });
let buttons = [];
const originalLoad = Module._load;
Module._load = function (request, parent, main) {
  if (request === '@/store/branch.store') return { useBranchStore: () => null };
  if (request === '@/components/ui/button') return { Button: props => {
    buttons.push(props);
    const { children, variant, size, ...rest } = props;
    return React.createElement('button', rest, children);
  } };
  return originalLoad.call(this, request.startsWith('@/') ? path.join(client, request.slice(2)) : request, parent, main);
};
for (const ext of ['.tsx', '.ts']) Module._extensions[ext] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  module._compile(result.outputText, filename);
};
const { ReportOutput } = require(path.join(client, 'features/reports/components/report-output.tsx'));
const { MONTHLY_REPORTS, MONTHLY_FILTERS } = require(path.join(client, 'features/reports/monthly-config.ts'));
const { reportQueries } = require(path.join(root, 'server/src/modules/reports/report.validation.ts'));
const cssDirectory = path.join(client, '.next/static/chunks');
const css = fs.readdirSync(cssDirectory).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(cssDirectory, f), 'utf8')).join('\n');
const originalWrite = XLSX.writeFile;
const evidence = [];
const label = key => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
const cellValue = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value ?? '';

(async () => {
  for (const { slug, result } of input) {
    const config = MONTHLY_REPORTS.find(r => r.slug === slug);
    assert.ok(config, slug);
    // Match every frontend field/default/option to the strict server contract.
    const base = slug === 'vehicle-history-card' ? {} : { from: '2026-10-01', to: '2026-10-07' };
    const defaults = Object.fromEntries(MONTHLY_FILTERS[slug].filter(f => f.default !== undefined && f.default !== '').map(f => [f.key, f.default]));
    reportQueries[slug].parse({ ...base, ...defaults });
    for (const field of MONTHLY_FILTERS[slug]) {
      const values = field.options?.map(([value]) => value) ?? [field.kind === 'dimension' ? '11111111-1111-4111-8111-111111111111' : field.kind === 'check' ? 'true' : field.kind === 'number' ? '7' : 'QA'];
      for (const value of values) reportQueries[slug].parse({ ...base, ...defaults, [field.key]: value });
    }
    buttons = [];
    const markup = renderToStaticMarkup(React.createElement(ReportOutput, { result, title: config.title, wide: config.wide, branch: 'Synthetic local QA' }));
    fs.writeFileSync(path.join(output, slug + '.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${config.title}</title><style>${css}</style><style>body{margin:0;padding:24px;background:#fafafa;font-family:Arial,sans-serif;color:#182230}body>main{min-width:0}@media(max-width:500px){body{padding:12px}}@media print{body{padding:0}}</style></head><body><main>${markup}</main></body></html>`);
    let workbook;
    XLSX.writeFile = (book) => { workbook = book; originalWrite(book, path.join(output, slug + '.xlsx')); };
    const exportButton = buttons.find(b => React.Children.toArray(b.children).includes('Excel'));
    assert.ok(exportButton, 'Excel handler exists');
    await exportButton.onClick();
    assert.ok(workbook, 'Excel handler produced workbook');
    const expected = [...(result.rows.length ? [{ title: 'Report', rows: result.rows, columns: result.columns, columnLabels: result.columnLabels }] : []), ...result.groups];
    expected.forEach((section, index) => {
      const values = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[index]], { header: 1, defval: '' });
      const keys = section.columns ?? [...new Set([...section.rows.flatMap(r => Object.keys(r)), ...Object.keys(section.totals ?? {})])].filter(k => k !== 'vehicleId');
      assert.ok(values.some(row => keys.every((key, i) => row[i] === (section.columnLabels?.[key] ?? label(key)))), `${slug}/${section.title}: column order and labels`);
      for (const row of section.rows) assert.ok(values.some(cells => keys.every((key, i) => cells[i] === cellValue(row[key]))), `${slug}/${section.title}: identical exported row`);
      if (!section.rows.length && !section.totals) assert.ok(values.some(row => row[0] === 'No records in this section.'), `${slug}: empty section marker`);
    });
    if (slug === 'vehicle-history-card') assert.equal(workbook.SheetNames.length, 11);
    const readBack = XLSX.readFile(path.join(output, slug + '.xlsx'));
    assert.deepEqual(readBack.SheetNames, workbook.SheetNames);
    evidence.push({ slug, orientation: config.wide ? 'landscape' : 'portrait', sheets: workbook.SheetNames, detailRows: result.rows.length + result.groups.reduce((n, g) => n + g.rows.length, 0), frontendFilterContract: 'PASS', workbookRows: 'PASS' });
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(evidence, null, 2));
  process.stdout.write(`Verified ${evidence.length} real report components, filter contracts and XLSX exports.\n`);
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; }).finally(() => { XLSX.writeFile = originalWrite; Module._load = originalLoad; });
