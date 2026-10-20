import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const component = "features/job-cards/components/";
const fixture = {
  id: "test-job", status: "OPEN", customerId: "test-customer", branchId: "test-branch",
  customer: { firstName: "Test", lastName: "Customer" }, serviceCharge: 2100,
  estimates: [{ id: "test-estimate", version: 2, status: "Pending", currency: "NGN", amount: 85800,
    contentHash: "test-hash", description: "Spark plugs, oil change & fuel system flush", approvals: [],
    lines: [
      { id: "s", type: "SERVICE", description: "Running repair", quantity: 1, rate: 2100, amount: 2100 },
      { id: "l", type: "LABOUR", description: "Replace ignition coil & spark plugs", quantity: 0.8, rate: 12500, amount: 10000 },
      { id: "g", type: "LABOUR", description: "General labour", quantity: 1.5, rate: 10000, amount: 15000 },
      { id: "i", type: "INCLUDED_LABOUR", description: "Fuel system flush & injector cleaning", quantity: 1, rate: 0, amount: 0 },
      { id: "p", type: "PART", description: "Spark plug, iridium", quantity: 4, rate: 7800, amount: 31200, source: "SECRET-SOURCE" },
      { id: "o", type: "PART", description: "Engine oil 5W-30, 4 litres", quantity: 1, rate: 27500, amount: 27500 },
    ] }],
};

function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    const resolved = path.resolve(root, file);
    if (resolved in stubs) return stubs[resolved];
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const module = { exports: {} }; cache.set(resolved, module);
    const source = ts.transpileModule(fs.readFileSync(resolved, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    function resolve(name) {
      if (name in stubs) return stubs[name];
      if (!name.startsWith(".") && !name.startsWith("@/")) return dependency(name);
      const local = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(resolved), name);
      const target = [local, local + ".ts", local + ".tsx"].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!target) throw new Error("Missing test dependency " + name);
      return load(target);
    }
    vm.runInNewContext(source, { module, exports: module.exports, require: resolve }, { filename: resolved });
    return module.exports;
  }
  return load;
}
const helpers = loader()(component + "repair-workspace-helpers.ts");
const plain = value => JSON.parse(JSON.stringify(value));

test("stepper maps canonical and legacy statuses without inventing a cancelled stage", () => {
  for (const [status, index] of [["OPEN",0],["Pending",0],["In Progress",1],["On Hold",1],["QC",2],["Quality Check",2],["Completed",3],["Billed",4],["Closed",5],["DELIVERED",5]]) {
    const steps = helpers.getStepperState(status);
    assert.equal(steps[index].state, "current");
    assert.ok(steps.slice(0,index).every(step => step.state === "completed"));
    assert.ok(steps.slice(index+1).every(step => step.state === "upcoming"));
  }
  assert.ok(helpers.getStepperState("CANCELLED").every(step => step.state === "upcoming"));
});
test("view model uses backend total and only customer-facing line fields", () => {
  const estimate = structuredClone(fixture.estimates[0]); estimate.amount = 123.45;
  const view = helpers.toEstimateViewModel(estimate);
  assert.equal(view.total,123.45); assert.equal(view.version,2);
  assert.equal(helpers.toEstimateViewModel({...estimate,description:"Workshop estimate ? revision 3"}).description,"Workshop estimate \u00b7 revision 3");
  assert.equal(helpers.toEstimateViewModel({...estimate,description:"Does the engine still knock?"}).description,"Does the engine still knock?");
  assert.deepEqual(plain(view.lines[0]),{id:"s",title:"Running repair",secondary:"Service charge",quantity:1,rate:2100,amount:2100});
  assert.equal(view.lines[3].secondary,"Included in service charge");
  assert.equal(JSON.stringify(view).includes("SECRET-SOURCE"),false);
  estimate.approvals=[{signatureState:"invalid"}]; assert.equal(helpers.toEstimateViewModel(estimate).status,"revision");
  estimate.approvals=[];estimate.status="Declined";assert.equal(helpers.toEstimateViewModel(estimate).status,"declined");
});
test("money splits retain backend precision and render zero as naira zero", () => {
  assert.deepEqual(plain(helpers.splitMoney(85800,"NGN")),{whole:"\u20a685,800",decimals:".00"});
  assert.equal(helpers.splitMoney(123.45,"NGN").decimals,".45");
  assert.equal(helpers.formatEstimateMoney(0,"NGN",true),"\u20a60");
  assert.ok(helpers.splitMoney(-12.34,"NGN").whole.includes("-12"));
  assert.ok(helpers.splitMoney(10,"USD").whole.includes("10"));
});

export function renderWorkspaceFixture({ card = fixture, permissions = ["estimate:print","estimate:sign","estimate:revise"], loading = false, error = null } = {}) {
  const load = loader({
    [path.join(root,"features/job-cards/hooks/use-job-card.ts")]: {useJobCard:()=>({data:card,isLoading:loading,error,refetch:()=>{}})},
    "@/features/auth/hooks/use-auth":{useAuth:()=>({hasPermission:permission=>permissions.includes(permission)})},
    "@tanstack/react-query":{useQueryClient:()=>({invalidateQueries:async()=>{}}),useMutation:()=>({isPending:false,error:null,mutate:()=>{}})},
    "@/lib/api/apiClient":{apiPost:async()=>{}},
    [path.join(root,component+"EstimateSignatureDialog.tsx")]:{EstimateSignatureDialog:()=>null},
    [path.join(root,component+"EstimatePartPicker.tsx")]:{EstimatePartPicker:()=>null},
    [path.join(root,component+"WorkshopPicker.tsx")]:{WorkshopPicker:()=>null},
    "next/image":{default:({src,alt,width,height,className})=>React.createElement("img",{src,alt,width,height,className})},
  });
  const Page = load(component + "RepairWorkspacePage.tsx").RepairWorkspacePage;
  return renderToStaticMarkup(React.createElement(Page,{id:card?.id ?? "test"}));
}

test("workspace renders latest backend data, semantic stepper/table and allowed actions",()=>{
  const html=renderWorkspaceFixture();
  for(const label of ["Repair workspace","85,800","Awaiting approval","Get customer signature","Revise estimate","Print estimate"])assert.ok(html.includes(label));
  assert.ok(html.includes('aria-current="step"'));assert.ok(html.includes("<table"));assert.ok(html.includes("overflow-x-auto"));
  assert.equal(html.includes("SECRET-SOURCE"),false);
  const denied=renderWorkspaceFixture({permissions:[]});
  for(const label of ["Get customer signature","Revise estimate","Print estimate"])assert.equal(denied.includes(label),false);
});
test("workspace handles empty, inaccessible, loading, failed, declined and legacy states",()=>{
  const card=structuredClone(fixture);card.estimates=[];
  assert.ok(renderWorkspaceFixture({card,permissions:["estimate:create"]}).includes("Create estimate"));
  assert.equal(renderWorkspaceFixture({card,permissions:[]}).includes("Create estimate"),false);
  delete card.estimates;assert.ok(renderWorkspaceFixture({card}).includes("not available with your permissions"));
  assert.ok(renderWorkspaceFixture({loading:true}).includes('aria-busy="true"'));
  assert.ok(renderWorkspaceFixture({error:new Error("test")}).includes("Retry"));
  const declined=structuredClone(fixture);declined.estimates[0].status="Declined";declined.estimates[0].approvals=[{comments:"Customer declined the price",approved:false}];
  assert.ok(renderWorkspaceFixture({card:declined}).includes("Customer declined the price"));
  const approved=structuredClone(fixture);approved.estimates[0].status="Approved";approved.estimates[0].approvals=[{approved:true,signatureState:"legacy"}];
  assert.ok(renderWorkspaceFixture({card:approved}).includes("Approved before signatures were introduced"));
  assert.equal(renderWorkspaceFixture({card:approved}).includes("Get customer signature"),false);
});

test("previous signed revisions retain accessible signature evidence",()=>{
  const card=structuredClone(fixture);
  card.estimates.push({...structuredClone(card.estimates[0]),id:"old",version:1,status:"SUPERSEDED",approvals:[{id:"approval",approved:true,signatureState:"valid",signature:{imageReference:"data:image/png;base64,TEST",signerName:"Earlier signer",signedAt:"2026-10-20T10:00:00Z",estimateVersion:1,totalSigned:85800}}]});
  const html=renderWorkspaceFixture({card});
  assert.ok(html.includes("Previous revisions"));assert.ok(html.includes("Earlier signer"));assert.ok(html.includes("View signature"));
});
