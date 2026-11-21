#!/usr/bin/env node
// Fails if the packed bundle uses syntax the TV's Chromium 79 engine can't parse.
// Chromium 79 handles ES2019 but not ES2020's optional chaining (?.) or nullish coalescing (??),
// which ship untranspiled in some node_modules because Enact only transpiles @enact packages.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from 'acorn';

const root = process.argv[2] || 'dist';
const files = [];
(function walk (dir) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p);
		else if (p.endsWith('.js')) files.push(p);
	}
})(root);

let failed = false;
for (const file of files) {
	const src = readFileSync(file, 'utf8');
	try {
		parse(src, {ecmaVersion: 2019, sourceType: 'script', allowHashBang: true});
	} catch (e) {
		failed = true;
		const at = e.pos || 0;
		console.error(`${file}: ${e.message}\n  …${src.slice(Math.max(0, at - 80), at + 40).replace(/\s+/g, ' ')}…`);
	}
}
if (!files.length) {
	console.error(`No .js files under ${root}. Run npm run pack-p first.`);
	process.exit(1);
}
console.log(failed ? 'ES2019 check FAILED' : `ES2019 check passed (${files.length} file${files.length > 1 ? 's' : ''})`);
process.exit(failed ? 1 : 0);
