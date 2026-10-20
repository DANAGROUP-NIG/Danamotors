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
const requireDependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map();
function load(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = {exports:{}}; cache.set(absolute,module);
  const code = ts.transpileModule(fs.readFileSync(absolute,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  function resolve(name) {
    if (!name.startsWith(".") && !name.startsWith("@/")) return requireDependency(name);
    const local = name.startsWith("@/") ? path.join(root,name.slice(2)) : path.resolve(path.dirname(absolute),name);
    const target = [local,local+".ts",local+".tsx"].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
    if (!target) throw new Error("Missing test import: "+name);
    return load(target);
  }
  vm.runInNewContext(code,{module,exports:module.exports,require:resolve},{filename:absolute});
  return module.exports;
}
const {LoadingSkeleton,TableSkeleton,SkeletonRows} = load("components/ui/loading-skeleton.tsx");
const {Skeleton} = load("components/ui/skeleton.tsx");
export function renderLoadingFixture(variant) { return renderToStaticMarkup(React.createElement(LoadingSkeleton,{variant})); }
test("skeleton variants announce loading once and hide decorative placeholders",()=>{
  for(const variant of ["detail","list","form","dashboard","workspace"]) {
    const html=renderLoadingFixture(variant);
    assert.equal((html.match(/role="status"/g)||[]).length,1);
    assert.ok(html.includes('aria-busy="true"'));assert.ok(html.includes('aria-hidden="true"'));
    assert.ok(html.includes("motion-reduce:animate-none"));assert.equal(/<(button|input|select|a)\b/.test(html),false);
    assert.equal(html.includes('style="'),false);
  }
});
test("skeleton primitive preserves layout hooks and respects reduced motion",()=>{
  const html=renderToStaticMarkup(React.createElement(Skeleton,{className:"h-8 w-24","data-testid":"placeholder"}));
  assert.ok(html.includes("h-8 w-24"));assert.ok(html.includes('data-testid="placeholder"'));assert.ok(html.includes("motion-reduce:animate-none"));
});
test("table skeleton preserves requested row/column geometry and valid table children",()=>{
  const html=renderToStaticMarkup(React.createElement(TableSkeleton,{rows:3,columns:5}));
  assert.equal((html.match(/<tr /g)||[]).length,3);assert.equal((html.match(/<td /g)||[]).length,15);
  const rows=renderToStaticMarkup(React.createElement("table",null,React.createElement("tbody",null,React.createElement(SkeletonRows,{count:2,columns:2}))));
  assert.ok(rows.startsWith('<table><tbody><tr'));assert.equal(rows.includes('<tbody><div'),false);
});
test("shared data table keeps existing records visible during background refresh",()=>{
  const {DataTable}=load("components/ui/table-components/DataTable.tsx");
  const props={columns:[{header:"Name",render:row=>row.name}],data:[{id:"1",name:"Existing record"}],rowKey:row=>row.id};
  const refresh=renderToStaticMarkup(React.createElement(DataTable,{...props,isLoading:false,isFetching:true}));
  assert.ok(refresh.includes("Existing record"));assert.equal(refresh.includes("animate-pulse"),false);
  const initial=renderToStaticMarkup(React.createElement(DataTable,{...props,data:[],isLoading:true,skeletonRowCount:3}));
  assert.ok(initial.includes('aria-busy="true"'));assert.ok(initial.includes("Loading records"));assert.equal((initial.match(/aria-hidden="true"/g)||[]).length,6);
});
