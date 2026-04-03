// Notion API クライアント
// fetch ベースの Notion API ラッパー

import { info } from './logger.js';

const NOTION_API_VERSION = '2022-06-28';
const NOTION_BASE_URL = 'https://api.notion.com/v1';
const MAX_BLOCKS_PER_REQUEST = 100;

/** Notion API レスポンスの基本型 */
interface NotionResponse {
	[key: string]: unknown;
}

/** Notion ページアイテム */
interface NotionPage {
	id: string;
	properties: {
		[key: string]: unknown;
	};
}

/** Notion クエリレスポンス */
interface NotionQueryResponse {
	results: NotionPage[];
}

/** Notion ブロック */
interface NotionBlock {
	object: string;
	type: string;
	[key: string]: unknown;
}

/**
 * Notion API キーを取得
 */
function getApiKey(): string {
	const key = process.env.NOTION_API_KEY;
	if (!key) {
		throw new Error('NOTION_API_KEY が未設定です');
	}
	return key;
}

/**
 * Notion API 共通ヘッダーを返す
 */
function getHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${getApiKey()}`,
		'Notion-Version': NOTION_API_VERSION,
		'Content-Type': 'application/json',
	};
}

/**
 * Notion API リクエストを送信し、レスポンスを返す
 */
async function notionFetch(path: string, options: RequestInit = {}): Promise<NotionResponse> {
	const url = `${NOTION_BASE_URL}${path}`;
	const response = await fetch(url, {
		...options,
		headers: { ...getHeaders(), ...((options.headers as Record<string, string>) ?? {}) },
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Notion API エラー (${response.status}): ${body}`);
	}

	return response.json() as Promise<NotionResponse>;
}

/**
 * Notion DB URL から Database ID を抽出
 */
export function extractDatabaseId(url: string): string {
	// URLからUUID形式（ハイフンあり/なし）を抽出
	const match = url.match(/[-/]([a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12})/);
	if (!match) {
		throw new Error(`DB IDを抽出できません: ${url}`);
	}
	return match[1].replace(/-/g, '');
}

/**
 * ステータスが空 or 未設定のアイテムを取得
 */
export async function queryUnprocessedItems(databaseId: string): Promise<NotionPage[]> {
	info('未処理アイテムを取得中...');
	const data = (await notionFetch(`/databases/${databaseId}/query`, {
		method: 'POST',
		body: JSON.stringify({
			filter: {
				property: 'ステータス',
				select: { is_empty: true },
			},
		}),
	})) as unknown as NotionQueryResponse;
	const items = data.results || [];
	info(`${items.length} 件の未処理アイテムを検出`);
	return items;
}

/**
 * ページのステータスとオプションで処理日を更新
 */
export async function updatePageStatus(
	pageId: string,
	status: string | null,
	date?: string,
): Promise<NotionResponse> {
	const properties: Record<string, unknown> = {
		ステータス: status ? { select: { name: status } } : { select: null },
	};

	if (date) {
		properties.処理日 = { date: { start: date } };
	}

	return notionFetch(`/pages/${pageId}`, {
		method: 'PATCH',
		body: JSON.stringify({ properties }),
	});
}

/**
 * ページにブロックを追加（100件ずつ分割）
 */
export async function appendBlocks(pageId: string, blocks: NotionBlock[]): Promise<void> {
	// 100件ずつに分割して送信
	for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_REQUEST) {
		const chunk = blocks.slice(i, i + MAX_BLOCKS_PER_REQUEST);
		info(`ブロック追加中 (${i + 1}〜${i + chunk.length} / ${blocks.length})`);
		await notionFetch(`/blocks/${pageId}/children`, {
			method: 'PATCH',
			body: JSON.stringify({ children: chunk }),
		});
	}
}
