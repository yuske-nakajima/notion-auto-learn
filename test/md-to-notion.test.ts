// md-to-notion.ts のテスト
// vitest を使用

import { describe, expect, it } from 'vitest';
import { mdToNotionBlocks, parseRichText } from '../src/md-to-notion.js';

// === parseRichText テスト ===
describe('parseRichText', () => {
	it('プレーンテキスト', () => {
		const result = parseRichText('hello world');
		expect(result.length).toBe(1);
		expect(result[0].text.content).toBe('hello world');
	});

	it('太字', () => {
		const result = parseRichText('これは**重要**です');
		expect(result.length).toBe(3);
		expect(result[1].annotations?.bold).toBe(true);
		expect(result[1].text.content).toBe('重要');
	});

	it('Markdownリンク', () => {
		const result = parseRichText('詳細は[公式ドキュメント](https://example.com)を参照');
		expect(result.length).toBe(3);
		expect(result[1].text.content).toBe('公式ドキュメント');
		expect(result[1].text.link?.url).toBe('https://example.com');
	});

	it('生URL', () => {
		const result = parseRichText('参照: https://example.com/path です');
		expect(result[1].text.link?.url).toBe('https://example.com/path');
	});

	it('空文字列', () => {
		const result = parseRichText('');
		expect(result.length).toBe(0);
	});

	it('複数の太字', () => {
		const result = parseRichText('**A**と**B**');
		expect(result.length).toBe(3);
		expect(result[0].annotations?.bold).toBe(true);
		expect(result[0].text.content).toBe('A');
		expect(result[2].annotations?.bold).toBe(true);
		expect(result[2].text.content).toBe('B');
	});
});

// テスト内でブロックプロパティにアクセスするためのヘルパー型
// biome-ignore lint/suspicious/noExplicitAny: テスト用のヘルパー
type AnyBlock = Record<string, any>;

// === mdToNotionBlocks テスト ===
describe('mdToNotionBlocks', () => {
	it('h2見出し', () => {
		const result = mdToNotionBlocks('## 概要');
		expect(result[0].type).toBe('heading_2');
	});

	it('h3見出し', () => {
		const result = mdToNotionBlocks('### 詳細');
		expect(result[0].type).toBe('heading_3');
	});

	it('箇条書き', () => {
		const result = mdToNotionBlocks('- アイテム1');
		expect(result[0].type).toBe('bulleted_list_item');
	});

	it('番号付きリスト', () => {
		const result = mdToNotionBlocks('1. 最初の項目');
		const block = result[0] as AnyBlock;
		expect(block.type).toBe('numbered_list_item');
		expect(block.numbered_list_item.rich_text[0].text.content).toBe('最初の項目');
	});

	it('テーブル', () => {
		const tableMd = '| 名前 | 説明 |\n|------|------|\n| A | Aの説明 |\n| B | Bの説明 |';
		const result = mdToNotionBlocks(tableMd);
		const block = result[0] as AnyBlock;
		expect(block.type).toBe('table');
		expect(block.table.table_width).toBe(2);
		expect(block.table.children.length).toBe(3);
	});

	it('箇条書き内太字', () => {
		const result = mdToNotionBlocks('- **キーワード**: 説明テキスト');
		const block = result[0] as AnyBlock;
		expect(block.bulleted_list_item.rich_text[0].annotations.bold).toBe(true);
	});

	it('箇条書き内リンク', () => {
		const result = mdToNotionBlocks('- [Wikipedia](https://ja.wikipedia.org)');
		const block = result[0] as AnyBlock;
		expect(block.bulleted_list_item.rich_text[0].text.link.url).toBe('https://ja.wikipedia.org');
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
		expect(result.length).toBe(5);
	});

	it('段落テキスト', () => {
		const result = mdToNotionBlocks('これは段落です');
		const block = result[0] as AnyBlock;
		expect(block.type).toBe('paragraph');
		expect(block.paragraph.rich_text[0].text.content).toBe('これは段落です');
	});

	it('空行で段落が分割される', () => {
		const result = mdToNotionBlocks('段落1\n\n段落2');
		expect(result.length).toBe(2);
		expect(result[0].type).toBe('paragraph');
		expect(result[1].type).toBe('paragraph');
	});

	it('連続するテキスト行は1つの段落になる', () => {
		const result = mdToNotionBlocks('行1\n行2');
		expect(result.length).toBe(1);
		const block = result[0] as AnyBlock;
		expect(block.paragraph.rich_text[0].text.content).toBe('行1\n行2');
	});

	it('テーブルの has_column_header が true', () => {
		const tableMd = '| A | B |\n|---|---|\n| 1 | 2 |';
		const result = mdToNotionBlocks(tableMd);
		const block = result[0] as AnyBlock;
		expect(block.table.has_column_header).toBe(true);
	});

	it('テーブル行は object: block, type: table_row を持つ', () => {
		const tableMd = '| A | B |\n|---|---|\n| 1 | 2 |';
		const result = mdToNotionBlocks(tableMd);
		const block = result[0] as AnyBlock;
		const row = block.table.children[0];
		expect(row.object).toBe('block');
		expect(row.type).toBe('table_row');
	});

	it('空のMarkdownは空配列を返す', () => {
		const result = mdToNotionBlocks('');
		expect(result.length).toBe(0);
	});
});
