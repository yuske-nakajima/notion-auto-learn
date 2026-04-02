// notion-client.js のテスト
// node:test + node:assert を使用

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	appendBlocks,
	extractDatabaseId,
	queryUnprocessedItems,
	updatePageStatus,
} from '../src/notion-client.js';

describe('extractDatabaseId', () => {
	it('標準的なNotion URLからIDを抽出', () => {
		const url = 'https://www.notion.so/workspace/abc12345-1234-5678-9abc-def012345678?v=xxx';
		const id = extractDatabaseId(url);
		assert.equal(id, 'abc12345123456789abcdef012345678');
	});

	it('ハイフンなしのIDを含むURLから抽出', () => {
		const url = 'https://www.notion.so/workspace/abc123451234567890abcdef01234567?v=xxx';
		const id = extractDatabaseId(url);
		assert.equal(id, 'abc123451234567890abcdef01234567');
	});

	it('不正なURLでエラーを投げる', () => {
		assert.throws(() => extractDatabaseId('https://example.com'), /DB IDを抽出できません/);
	});

	it('パス末尾にIDがあるURLから抽出', () => {
		const url = 'https://notion.so/abc12345-1234-5678-9abc-def012345678';
		const id = extractDatabaseId(url);
		assert.equal(id, 'abc12345123456789abcdef012345678');
	});
});

describe('API関数のエクスポート確認', () => {
	it('queryUnprocessedItems が関数としてエクスポートされている', () => {
		assert.equal(typeof queryUnprocessedItems, 'function');
	});

	it('updatePageStatus が関数としてエクスポートされている', () => {
		assert.equal(typeof updatePageStatus, 'function');
	});

	it('appendBlocks が関数としてエクスポートされている', () => {
		assert.equal(typeof appendBlocks, 'function');
	});
});
