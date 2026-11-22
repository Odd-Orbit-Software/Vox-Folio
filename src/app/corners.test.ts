import {cornerAt, DRIFT, driftAt, triangle} from './corners';

test('triangle runs 0 → 1 → 0', () => {
	expect(triangle(0, 10)).toBe(0);
	expect(triangle(5, 10)).toBe(0.5);
	expect(triangle(10, 10)).toBe(1);
	expect(triangle(15, 10)).toBe(0.5);
	expect(triangle(20, 10)).toBe(0);
	expect(triangle(-5, 10)).toBe(0.5);
});

test('matches the CSS start: negative delays mean the drift is already under way', () => {
	const p = driftAt(0, DRIFT);
	expect(p.x).toBeCloseTo((19 / 47) * 1004);
	expect(p.y).toBeCloseTo((11 / 31) * 668);
});

test('spots corners only when both axes are at an edge', () => {
	expect(cornerAt({x: 2, y: 3}, DRIFT)).toBe('tl');
	expect(cornerAt({x: 1001, y: 666}, DRIFT)).toBe('br');
	expect(cornerAt({x: 2, y: 300}, DRIFT)).toBeNull();
	expect(cornerAt({x: 500, y: 0}, DRIFT)).toBeNull();
});

test('a test timing reaches the top-left corner six seconds in', () => {
	const timing = {...DRIFT, xDelay: -88, yDelay: -56};
	expect(cornerAt(driftAt(6, timing), timing)).toBe('tl');
	expect(cornerAt(driftAt(3, timing), timing)).toBeNull();
});
