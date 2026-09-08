const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
const original = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) {
  if (name.startsWith('@/')) name = path.join(process.cwd(), 'src', name.slice(2));
  return original.call(this, name, parent, ...args);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true}}).outputText, filename);
