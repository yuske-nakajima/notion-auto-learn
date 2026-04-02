// md-to-notion.js のテスト
// node:test + node:assert を使用

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mdToNotionBlocks, parseRichText } from '../src/md-to-notion.js';

// === parseRichText テスト ===
describe('parseRichText', () => {
	it('プレーンテキスト', () => {
		const result = parseRichText('hello world');
		assert.equal(result.length, 1);
		assert.equal(result[0].text.content, 'hello world');
	});

	it('太字', () => {
		const result = parseRichText('これは**重要**です');
		assert.equal(result.length, 3);
		assert.equal(result[1].annotations.bold, true);
		assert.equal(result[1].text.content, '重要');
	});

	it('Markdownリンク', () => {
		const result = parseRichText('詳細は[公式ドキュメント](https://example.com)を参照');
		assert.equal(result.length, 3);
		assert.equal(result[1].text.content, '公式ドキュメント');
		assert.equal(result[1].text.link.url, 'https://example.com');
	});

	it('生URL', () => {
		const result = parseRichText('参照: https://example.com/path です');
		assert.equal(result[1].text.link.url, 'https://example.com/path');
	});

	it('空文字列', () => {
		const result = parseRichText('');
		assert.equal(result.length, 0);
	});

	it('複数の太字', () => {
		const result = parseRichText('**A**と**B**');
		assert.equal(result.length, 3);
		assert.equal(result[0].annotations.bold, true);
		assert.equal(result[0].text.content, 'A');
		assert.equal(result[2].annotations.bold, true);
		assert.equal(result[2].text.content, 'B');
	});
});

// === mdToNotionBlocks テスト ===
describe('mdToNotionBlocks', () => {
	it('h2見出し', () => {
		const result = mdToNotionBlocks('## 概要');
		assert.equal(result[0].type, 'heading_2');
	});

	it('h3見出し', () => {
		const result = mdToNotionBlocks('### 詳細');
		assert.equal(result[0].type, 'heading_3');
	});

	it('箇条書き', () => {
		const result = mdToNotionBlocks('- アイテム1');
		assert.equal(result[0].type, 'bulleted_list_item');
	});

	it('番号付きリスト', () => {
		const result = mdToNotionBlocks('1. 最初の項目');
		assert.equal(result[0].type, 'numbered_list_item');
		assert.equal(result[0].numbered_list_item.rich_text[0].text.content, '最初の項目');
	});

	it('テーブル', () => {
		const tableMd = '| 名前 | 説明 |\n|------|------|\n| A | Aの説明 |\n| B | Bの説明 |';
		const result = mdToNotionBlocks(tableMd);
		assert.equal(result[0].type, 'table');
		assert.equal(result[0].table.table_width, 2);
		assert.equal(result[0].table.children.length, 3);
	});

	it('箇条書き内太字', () => {
		const result = mdToNotionBlocks('- **キーワード**: 説明テキスト');
		assert.equal(result[0].bulleted_list_item.rich_text[0].annotations.bold, true);
	});

	it('箇条書き内リンク', () => {
		const result = mdToNotionBlocks('- [Wikipedia](https://ja.wikipedia.org)');
		assert.equal(
			result[0].bulleted_list_item.rich_text[0].text.link.url,
			'https://ja.wikipedia.org',
		);
	});

	it('複合テスト', () => {
		const complex = [
			'## 概要',
			'**API**は重要な概念です。',
			'',
			'## 参考リンク',
			'- [公式ドキュメント](https://docs.example.com)',
			'- https://example.com/raw-url',
		].join('\n');
		const result = mdToNotionBlocks(complex);
		assert.equal(result.length, 5);
	});

	it('段落テキスト', () => {
		const result = mdToNotionBlocks('これは段落です');
		assert.equal(result[0].type, 'paragraph');
		assert.equal(result[0].paragraph.rich_text[0].text.content, 'これは段落です');
	});

	it('空行で段落が分割される', () => {
		const result = mdToNotionBlocks('段落1\n\n段落2');
		assert.equal(result.length, 2);
		assert.equal(result[0].type, 'paragraph');
		assert.equal(result[1].type, 'paragraph');
	});

	it('連続するテキスト行は1つの段落になる', () => {
		const result = mdToNotionBlocks('行1\n行2');
		assert.equal(result.length, 1);
		assert.equal(result[0].paragraph.rich_text[0].text.content, '行1\n行2');
	});

	it('テーブルの has_column_header が true', () => {
		const tableMd = '| A | B |\n|---|---|\n| 1 | 2 |';
		const result = mdToNotionBlocks(tableMd);
		assert.equal(result[0].table.has_column_header, true);
	});

	it('テーブル行は object: block, type: table_row を持つ', () => {
		const tableMd = '| A | B |\n|---|---|\n| 1 | 2 |';
		const result = mdToNotionBlocks(tableMd);
		const row = result[0].table.children[0];
		assert.equal(row.object, 'block');
		assert.equal(row.type, 'table_row');
	});

	it('空のMarkdownは空配列を返す', () => {
		const result = mdToNotionBlocks('');
		assert.equal(result.length, 0);
	});
});
