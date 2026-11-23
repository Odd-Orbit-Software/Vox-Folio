/* Lint config: Enact's rules, with one change.

   enact/jsx-no-bind flags every inline function in a JSX prop. React's own guidance is that these are
   fine, and the places where it matters (list tiles) are memoised already, so the rule is off. Everything
   else is Enact's config as-is, and `npm run lint` fails on any warning. */

import {createRequire} from 'module';

const enact = createRequire(import.meta.url)('eslint-config-enact');

export default [
	...enact,
	{
		rules: {
			'enact/jsx-no-bind': 'off'
		}
	},
	{
		ignores: ['dist/**', 'build/**', 'node_modules/**', 'docs/**', 'tools/**']
	}
];
