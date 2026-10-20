import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const loadDependency=createRequire(import.meta.url);
function load(file,stubs={}) {
 const output=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(output,{module,exports:module.exports,require:name=>name in stubs?stubs[name]:loadDependency(name)},{filename:file});
 return module.exports;
}
test('signature dialog required fields',()=>{
 const {signatureFieldsValid:valid}=load('features/job-cards/components/signature-fields.ts');
 const fields={drawn:true,name:'Test Customer',customerName:'Test Customer',relationship:'',approved:true,reason:''};
 assert.equal(valid(fields),true);
 for(const patch of [{drawn:false},{name:' '},{approved:false},{name:'Other signer'}])assert.equal(valid({...fields,...patch}),false);
 assert.equal(valid({...fields,approved:false,reason:'Not agreed'}),true);
 assert.equal(valid({...fields,name:'Other signer',relationship:'Authorized contact'}),true);
});
test('print component excludes internal fields and handles unsigned/superseded versions',()=>{
 const data={estimate:{version:2,estimateNumber:'TEST-2',estimateDate:'2026-10-20T10:00:00Z',currency:'NGN',total:100,supersededBy:3,signatureState:null,signature:null,lines:[{type:'PART',code:'P1',description:'Customer part',quantity:1,rate:100,amount:100,source:'SECRET-SOURCE',cost:50,chargeType:'WARRANTY'}]},company:{name:'Test Company'},branch:{name:'Test Branch'},customer:{name:'Test Customer'},vehicle:{vin:'TESTVIN'},job:{number:'J1',date:'2026-10-20T10:00:00Z',complaints:['Customer complaint']},terms:['Test terms'],footer:'Test footer',printedAt:'2026-10-20T10:00:00Z',internalRemarks:'SECRET-REMARK',qc:'SECRET-QC',assignments:'SECRET-STAFF',otherEstimates:'SECRET-ESTIMATE'};
 let allowed=true;
 const Page=load('app/(dashboard)/job-cards/[id]/estimates/[estimateId]/print/page.tsx',{'next/navigation':{useParams:()=>({id:'job',estimateId:'estimate'})},'@tanstack/react-query':{useQuery:()=>({data,isPending:false,isError:false})},'@/lib/api/apiClient':{},'@/components/ui/loading-skeleton':{LoadingSkeleton:()=>null},'@/features/auth/hooks/use-auth':{useAuth:()=>({hasPermission:()=>allowed})},'@/components/ui/button':{Button:({children})=>React.createElement('button',null,children)}}).default;
 let html=renderToStaticMarkup(React.createElement(Page));
 for(const excluded of ['SECRET-SOURCE','WARRANTY','SECRET-REMARK','SECRET-QC','SECRET-STAFF','SECRET-ESTIMATE'])assert.equal(html.includes(excluded),false);
 for(const included of ['Not a bill','Customer part','Customer signature:','Superseded by revision','Test terms'])assert.equal(html.includes(included),true);
 data.estimate.signature={imageReference:'data:image/png;base64,TEST',signerName:'Test Signer',signedAt:'2026-10-20T10:00:00Z',estimateVersion:2,totalSigned:100};data.estimate.signatureState='valid';
 html=renderToStaticMarkup(React.createElement(Page));assert.equal(html.includes('Test Signer'),true);assert.equal(html.includes('Captured customer signature'),true);
 allowed=false;html=renderToStaticMarkup(React.createElement(Page));assert.equal(html.includes('do not have permission'),true);assert.equal(html.includes('Customer part'),false);
});
