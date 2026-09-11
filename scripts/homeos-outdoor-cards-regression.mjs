import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(path) {
    const file = resolve(path);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = readFileSync(file, 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file,
    });
    vm.runInNewContext(outputText, { exports, console, process: { env: {} }, URL,
        require: name => load(resolve(dirname(file), `${name}.ts`)) }, { filename: file });
    return exports;
}
load('src/lib/outdoorHomeCards.regression.ts');
load('src/lib/propertyAreaContainerDeck.regression.ts');
load('src/components/homeos/homeos-visual-assets.regression.ts');
const source = readFileSync('src/components/homeos/homeos-visual-assets.ts', 'utf8');
for (const [, path] of source.matchAll(/require\('([^']+)'\)/g)) {
    if (!existsSync(resolve('src/components/homeos', path))) throw new Error(`Missing bundled artwork: ${path}`);
}
console.log('PASS existing area/visual regressions and all bundled artwork paths');
