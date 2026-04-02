// process.js のテスト
// node:test + node:assert を使用

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { processItems } from '../src/process.js';

describe('processItems', () => {
	it('関数としてエクスポートされている', () => {
		assert.equal(typeof processItems, 'function');
	});
});
