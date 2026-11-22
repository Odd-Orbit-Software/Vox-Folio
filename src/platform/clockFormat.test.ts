import {formatClockTime, formatFor} from './clockFormat';

const at = new Date(2026, 10, 22, 13, 42);

test('follows the region format when the TV says "locale"', () => {
	expect(formatFor({clock: 'locale', locales: {FMT: 'en-GB'}}, 'en-US')).toEqual({locale: 'en-GB', hour12: false});
	expect(formatFor({clock: 'locale', locales: {FMT: 'en-US'}}, 'en-GB').hour12).toBe(true);
});

test('a forced 12- or 24-hour setting wins over the region', () => {
	expect(formatFor({clock: '12', locales: {FMT: 'en-GB'}}, 'en-GB').hour12).toBe(true);
	expect(formatFor({clock: '24', locales: {FMT: 'en-US'}}, 'en-US').hour12).toBe(false);
});

test('formats the time', () => {
	expect(formatClockTime(at, {locale: 'en-GB', hour12: false})).toBe('13:42');
	expect(formatClockTime(at, {locale: 'en-GB', hour12: true}).replace(/\s/g, ' ').toLowerCase()).toBe('1:42 pm');
});
