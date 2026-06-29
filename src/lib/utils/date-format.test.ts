import { test, expect } from 'bun:test';
import { buildFormatters } from './date-format';

// Root-cause guard: an invalid timezone must not throw (it used to crash every
// date grid with RangeError: Invalid time zone specified). It should fall back.
test('buildFormatters tolerates an invalid timezone', () => {
	expect(() => buildFormatters('stream')).not.toThrow();
	expect(() => buildFormatters('')).not.toThrow();
	expect(() => buildFormatters(undefined)).not.toThrow();
});

test('buildFormatters honours a valid timezone', () => {
	const { date } = buildFormatters('Asia/Shanghai');
	expect(date.resolvedOptions().timeZone).toBe('Asia/Shanghai');
});
