// Compiler driver: preprocess -> parse -> codegen -> link.
import { Preprocessor, CompileError } from './preprocess.js';
import { Parser } from './parser.js';
import { link } from './codegen.js';
import { HEADERS, LIBRARY } from './headers.js';

let libCache = null;

function compileUnit(name, src, files, tuId, warnings, uidGen) {
  const pp = new Preprocessor({ files, builtins: HEADERS, warnings });
  const toks = pp.run(name, src);
  const parser = new Parser(toks, { tu: tuId, file: name, warnings, uidGen });
  return parser.parse();
}

export function compile(files) {
  const t0 = performance.now();
  const warnings = [];
  const errors = [];
  let uid = 0;
  const uidGen = () => ++uid;
  const units = [];
  const sources = Object.keys(files).filter(f => /\.c$/i.test(f));
  if (!sources.length) return { errors: [{ msg: 'no .c source files in project' }], warnings };
  for (const f of sources) {
    try { units.push({ prog: compileUnit(f, files[f], files, 'u' + units.length, warnings, uidGen), isLib: false }); }
    catch (e) {
      if (e instanceof CompileError) { errors.push({ msg: e.message, file: e.file, line: e.line, col: e.col }); continue; }
      errors.push({ msg: 'internal compiler error: ' + e.message, file: f }); console.error(e);
    }
  }
  if (errors.length) return { errors, warnings };
  // library units are parsed fresh each time (AST nodes are annotated by codegen)
  const libWarnings = [];
  for (const f in LIBRARY) {
    try { units.push({ prog: compileUnit(f, LIBRARY[f], {}, 'lib' + units.length, libWarnings, uidGen), isLib: true }); }
    catch (e) { errors.push({ msg: `runtime library ${f}: ${e.message} (line ${e.line})` }); }
  }
  if (errors.length) return { errors, warnings };
  let out;
  try { out = link(units, { warnings }); }
  catch (e) {
    if (e instanceof CompileError) return { errors: [{ msg: e.message, file: e.file, line: e.line }], warnings };
    console.error(e);
    return { errors: [{ msg: 'internal compiler error: ' + e.message }], warnings };
  }
  if (out.errors.length) return { errors: out.errors, warnings };
  out.warnings = warnings;
  out.timeMs = performance.now() - t0;
  void libCache;
  return out;
}
