// Notion データベース作成スクリプト
// 使い方: npx tsx --env-file=.env src/setup-db.ts

import { error, info } from './logger.js';

const NOTION_API_VERSION = '2022-06-28';
const NOTION_BASE_URL = 'https://api.notion.com/v1';

function getApiKey(): string {
	const key = process.env.NOTION_API_KEY;
	if (!key) {
		throw new Error('NOTION_API_KEY が未設定です');
	}
	return key;
}

function getHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${getApiKey()}`,
		'Notion-Version': NOTION_API_VERSION,
		'Content-Type': 'application/json',
	};
}

/** Notion URL からページ ID を抽出（ハイフンあり/なし対応） */
function extractPageId(url: string): string {
	// ハイフン付き UUID
	const uuidMatch = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
	if (uuidMatch) {
		return uuidMatch[1];
	}
	// ハイフンなし 32文字 hex（URL末尾）
	const hexMatch = url.match(/([a-f0-9]{32})(?:\?|$)/);
	if (hexMatch) {
		const id = hexMatch[1];
		return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
	}
	throw new Error(`親ページ ID を抽出できません: ${url}`);
}

/** データベースを作成 */
async function createDatabase(parentPageId: string): Promise<{ id: string; url: string }> {
	const response = await fetch(`${NOTION_BASE_URL}/databases`, {
		method: 'POST',
		headers: getHeaders(),
		body: JSON.stringify({
			parent: { type: 'page_id', page_id: parentPageId },
			title: [{ type: 'text', text: { content: '知らないことリスト' } }],
			properties: {
				用語: { title: {} },
				ステータス: {
					select: {
						options: [
							{ name: '登録', color: 'red' },
							{ name: '調査中', color: 'yellow' },
							{ name: '調査完了', color: 'green' },
							{ name: '理解済', color: 'blue' },
						],
					},
				},
				カテゴリ: {
					select: {
						options: [
							{ name: '技術', color: 'purple' },
							{ name: '一般', color: 'gray' },
							{ name: 'ビジネス', color: 'orange' },
						],
					},
				},
				処理日: { date: {} },
				メモ: { rich_text: {} },
			},
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`データベース作成失敗 (${response.status}): ${body}`);
	}

	const data = (await response.json()) as { id: string; url: string };
	return { id: data.id, url: data.url };
}

/** テストデータを追加 */
async function addTestPage(databaseId: string, term: string, category: string): Promise<void> {
	const response = await fetch(`${NOTION_BASE_URL}/pages`, {
		method: 'POST',
		headers: getHeaders(),
		body: JSON.stringify({
			parent: { database_id: databaseId },
			properties: {
				用語: { title: [{ type: 'text', text: { content: term } }] },
				カテゴリ: { select: { name: category } },
			},
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`「${term}」の追加に失敗 (${response.status}): ${body}`);
	}

	info(`テストデータ追加: ${term}`);
}

// --- メイン処理 ---
async function main(): Promise<void> {
	const parentPageUrl = process.env.NOTION_PARENT_PAGE_URL;
	if (!parentPageUrl) {
		error('NOTION_PARENT_PAGE_URL が未設定です');
		console.log('');
		console.log('.env に以下を追加してください:');
		console.log('  NOTION_PARENT_PAGE_URL=https://www.notion.so/yourworkspace/ページID');
		process.exit(1);
	}

	const parentPageId = extractPageId(parentPageUrl);
	info(`親ページ ID: ${parentPageId}`);

	// DB 作成
	info('データベースを作成中...');
	const db = await createDatabase(parentPageId);
	info(`データベース作成完了`);
	info(`DB ID: ${db.id}`);
	info(`DB URL: ${db.url}`);

	// テストデータ追加
	info('テストデータを追加中...');
	await addTestPage(db.id, 'CRDT', '技術');
	await addTestPage(db.id, '量子コンピュータ', '技術');

	console.log('');
	console.log('==========================================');
	console.log('  データベース作成完了！');
	console.log('==========================================');
	console.log('');
	console.log(`DB URL: ${db.url}`);
	console.log('');
	console.log('この URL を .env の NOTION_DB_URL に貼ってください:');
	console.log(`  NOTION_DB_URL=${db.url}`);
	console.log('');
}

main().catch((err: unknown) => {
	error(`実行エラー: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
