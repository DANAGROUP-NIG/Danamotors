// Offline inspection only. Outputs aggregate counts, never customer records.
const fs = require('node:fs');
const crypto = require('node:crypto');
function inspect(input) {
  if (input.format !== 'danamotors-kia-plaza-cohort-v1') throw new Error('Unsupported cohort format');
  const tables = input.tables;
  const required = ['Job','servbook','jobbill','jobfatax','requisitionpartheader','requisitionpartdetail','requisitionreturndetail','joblaborhead','joblabordetail','estimate','estimateparts','estimatelabour','vehiclemaster','Customer','partmast','CorporateCustomerVins','WarrantyHead','WarrantyDetails'];
  for (const name of required) {
    if (!Array.isArray(tables?.[name])) throw new Error(`Missing table array: ${name}`);
    if (input.counts?.[name] !== tables[name].length) throw new Error(`Count mismatch: ${name}`);
  }
  const val = (row, field) => {
    const key = Object.keys(row).find(k => k.toLowerCase() === field.toLowerCase());
    return row[key] == null ? '' : String(row[key]).trim();
  };
  const key = (row, fields) => JSON.stringify(fields.map(f => val(row,f)));
  const index = (table, fields) => new Set(tables[table].map(r => key(r,fields)));
  const checks = {};
  function join(child, parent, fields) {
    const keys = index(parent,fields);
    checks[`${child}->${parent}`] = {rows:tables[child].length, unmatched:tables[child].filter(r => !keys.has(key(r,fields))).length};
  }
  join('jobbill','Job',['trantype','job']);
  join('jobfatax','jobbill',['trantype','cashinv','bill','billtype']);
  join('requisitionpartheader','Job',['trantype','job']);
  join('requisitionpartdetail','requisitionpartheader',['trantype','storelocation','series','requisition']);
  join('requisitionreturndetail','requisitionpartheader',['trantype','storelocation','series','requisition']);
  join('joblaborhead','Job',['trantype','job']);
  join('joblabordetail','joblaborhead',['trantype','labourslip']);
  join('estimateparts','estimate',['estimate']);
  join('estimatelabour','estimate',['estimate']);
  join('requisitionpartdetail','partmast',['make','part','partflag']);
  const duplicates = {};
  for (const [table,fields] of Object.entries({Job:['trantype','job'],servbook:['booking'],jobbill:['trantype','cashinv','bill','billtype'],vehiclemaster:['ChassisNo'],Customer:['custtype','customer'],partmast:['make','part','partflag'],estimate:['estimate']})) {
    duplicates[table] = tables[table].length-index(table,fields).size;
  }
  // TODO(issue-79 legacy seed): confirm cashinv I/Z and taxcategory A/B/C
  // against the source application's definitions before mapping them. Preserve
  // these raw values in the inspection report; never infer cash/credit from
  // outstanding balance or treat unknown tax codes as exempt/zero-rated.
  // The user requested leaving these mappings unresolved for now.
  const flags = {};
  for (const [table,fields] of Object.entries({jobbill:['cashinv','billtype','cancelled'],requisitionpartdetail:['partflag','warranty'],partmast:['taxcategory','taxable']})) for (const field of fields) {
    const counts = {};
    for (const row of tables[table]) { const value=val(row,field); counts[value]=(counts[value]||0)+1; }
    flags[`${table}.${field}`]=counts;
  }
  const sum = (table,field,predicate=()=>true) => {
    let cents=0;
    for (const row of tables[table].filter(predicate)) {
      const number=Number(val(row,field));
      if (!Number.isFinite(number)) throw new Error(`Invalid monetary value: ${table}.${field}`);
      cents+=Math.round(number*100);
    }
    return cents/100;
  };
  const active = r => !['true','1'].includes(val(r,'cancelled').toLowerCase());
  return {
    selection:input.selection,counts:input.counts,joins:checks,duplicateKeys:duplicates,flags,
    sourceTotals:{activeBillAmount:sum('jobbill','billamount',active),activeBillOutstanding:sum('jobbill','outstandingamt',active),allCategorySaleAmount:sum('jobfatax','saleamount'),allCategoryTaxAmount:sum('jobfatax','taxamount')},
    limitations:['Capped cohort; totals are not complete-month totals.','Vehicle history is limited to exported jobs.','No historical warranty snapshot may be invented.','No claims exported; claim report needs other data.','Cash/credit and tax category flags require verified source meanings.','Target conflicts, migrations and branch identity require a reachable target.'],
    databaseWrites:0,
  };
}
module.exports = {inspect};
if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node validate-monthly-report-cohort.cjs <cohort.json> [summary.json]');
    const bytes=fs.readFileSync(process.argv[2]);
    const report=inspect(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')));
    report.sourceSha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const output=JSON.stringify(report,null,2)+'\n';
    if(process.argv[3]) fs.writeFileSync(process.argv[3],output);
    console.log(output);
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
