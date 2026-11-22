import {defaultHomeRows, getSettings, HOME_ROWS, homeRowsAreDefault, moveHomeRow, orderedHomeRows, stepChoice} from './settings';
import type {Settings} from './settings';

const base = (): Settings => ({...getSettings(), ...defaultHomeRows()});

describe('home row order', () => {
	test('starts in the built-in order', () => {
		expect(orderedHomeRows(base())).toEqual(HOME_ROWS.map((r) => r.id));
		expect(homeRowsAreDefault(base())).toBe(true);
	});

	test('moves a row up and down, stopping at the ends', () => {
		const s = base();
		const down = moveHomeRow(s, 'in-progress', 1)!;
		expect(down.slice(0, 2)).toEqual(['new-episodes', 'in-progress']);
		expect(moveHomeRow(s, 'in-progress', -1)).toBeNull();
		expect(moveHomeRow(s, 'recent-series', 1)).toBeNull();
		expect(homeRowsAreDefault({...s, homeRowOrder: down})).toBe(false);
	});

	test('rows missing from a saved order keep their place after their neighbour', () => {
		const s = {...base(), homeRowOrder: ['discover', 'in-progress'] as Settings['homeRowOrder']};
		const order = orderedHomeRows(s);
		expect(order[0]).toBe('discover');
		expect(order.length).toBe(HOME_ROWS.length);
		expect(order.indexOf('new-episodes')).toBe(order.indexOf('in-progress') + 1);
	});
});

test('stepChoice stops at either end', () => {
	expect(stepChoice([10, 30, 60], 30, 1)).toBe(60);
	expect(stepChoice([10, 30, 60], 60, 1)).toBeNull();
	expect(stepChoice([10, 30, 60], 10, -1)).toBeNull();
});
