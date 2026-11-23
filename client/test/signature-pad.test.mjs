import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
function pad(disabled = false) {
  const module = { exports: {} };
  const changes = [];
  const strokes = [];
  const context = {
    beginPath() {},
    moveTo: (...point) => strokes.push(point),
    lineTo: (...point) => strokes.push(point),
    stroke() {},
    clearRect() {},
  };
  const canvas = {
    getContext: () => context,
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 300,
      height: 100,
    }),
    setPointerCapture() {},
    toDataURL: () => "data:image/png;base64,signature",
  };
  const source = fs.readFileSync(
    new URL(
      "../features/job-cards/components/SignaturePad.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      getComputedStyle: () => ({ color: "currentColor" }),
      require: (name) =>
        name === "react"
          ? { useRef: (value) => ({ current: value }) }
          : name === "@/components/ui/button"
            ? { Button: "button" }
            : dependency(name),
    },
  );
  const tree = module.exports.SignaturePad({
    label: "Draw signature",
    disabled,
    onChange: (image) => changes.push(image),
  });
  const [drawing, clear] = tree.props.children;
  drawing.props.ref.current = canvas;
  return {
    drawing: drawing.props,
    clear: clear.props,
    changes,
    strokes,
    event: { currentTarget: canvas, pointerId: 1, clientX: 160, clientY: 70 },
  };
}

test("signature capture scales pointer coordinates and exports PNG only after drawing", () => {
  const state = pad();
  state.drawing.onPointerUp();
  assert.deepEqual(state.changes, []);
  state.drawing.onPointerDown(state.event);
  state.drawing.onPointerMove({ ...state.event, clientX: 190 });
  state.drawing.onPointerUp();
  assert.deepEqual(state.strokes, [
    [300, 100],
    [360, 100],
  ]);
  assert.deepEqual(state.changes, ["data:image/png;base64,signature"]);
  state.clear.onClick();
  assert.equal(state.changes.at(-1), null);
  state.drawing.onPointerUp();
  assert.equal(state.changes.length, 2);
});

test("pending signature pads do not capture another signature", () => {
  const state = pad(true);
  state.drawing.onPointerDown(state.event);
  state.drawing.onPointerMove(state.event);
  state.drawing.onPointerUp();
  assert.deepEqual(state.changes, []);
  assert.equal(state.clear.disabled, true);
});
