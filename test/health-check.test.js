// health-check.js のテスト
// node:test + node:assert を使用

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runHealthCheck } from '../src/health-check.js';

describe('runHealthCheck', () => {
	it('関数としてエクスポートされている', () => {
		assert.equal(typeof runHealthCheck, 'function');
	});

	it('環境変数が未設定の場合 false を返す', async () => {
		// NOTION_API_KEY, NOTION_DB_URL が未設定の状態でテスト
		const originalApiKey = process.env.NOTION_API_KEY;
		const originalDbUrl = process.env.NOTION_DB_URL;
		delete process.env.NOTION_API_KEY;
		delete process.env.NOTION_DB_URL;

		try {
			const result = await runHealthCheck();
			assert.equal(result, false);
		} finally {
			// 復元
			if (originalApiKey) process.env.NOTION_API_KEY = originalApiKey;
			if (originalDbUrl) process.env.NOTION_DB_URL = originalDbUrl;
		}
	});
});
