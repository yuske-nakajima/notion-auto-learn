// process.ts のテスト
// vitest を使用

import { describe, expect, it } from 'vitest';
import { processItems } from '../src/process.js';

describe('processItems', () => {
	it('関数としてエクスポートされている', () => {
		expect(typeof processItems).toBe('function');
	});
});
