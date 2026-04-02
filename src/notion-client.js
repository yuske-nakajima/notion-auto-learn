// Notion API クライアント
// fetch ベースの Notion API ラッパー

import { info } from './logger.js';

const NOTION_API_VERSION = '2022-06-28';
const NOTION_BASE_URL = 'https://api.notion.com/v1';
const MAX_BLOCKS_PER_REQUEST = 100;

/**
 * Notion API キーを取得
 * @returns {string}
 */
function getApiKey() {
	const key = process.env.NOTION_API_KEY;
	if (!key) {
		throw new Error('NOTION_API_KEY が未設定です');
	}
	return key;
}

/**
 * Notion API 共通ヘッダーを返す
 * @returns {Record<string, string>}
 */
function getHeaders() {
	return {
		Authorization: `Bearer ${getApiKey()}`,
		'Notion-Version': NOTION_API_VERSION,
		'Content-Type': 'application/json',
	};
}

/**
 * Notion API リクエストを送信し、レスポンスを返す
 * @param {string} path - APIパス（例: /databases/xxx/query）
 * @param {RequestInit} options - fetch オプション
 * @returns {Promise<object>} レスポンスJSON
 */
async function notionFetch(path, options = {}) {
	const url = `${NOTION_BASE_URL}${path}`;
	const response = await fetch(url, {
		...options,
		headers: { ...getHeaders(), ...options.headers },
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Notion API エラー (${response.status}): ${body}`);
	}

	return response.json();
}

/**
 * Notion DB URL から Database ID を抽出
 * @param {string} url - Notion DB URL
 * @returns {string} Database ID（ハイフンなし32文字）
 */
export function extractDatabaseId(url) {
	// URLからUUID形式（ハイフンあり/なし）を抽出
	const match = url.match(/[-/]([a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12})/);
	if (!match) {
		throw new Error(`DB IDを抽出できません: ${url}`);
	}
	return match[1].replace(/-/g, '');
}

/**
 * ステータスが空 or 未設定のアイテムを取得
 * @param {string} databaseId - Database ID
 * @returns {Promise<Array>} 未処理アイテムの配列
 */
export async function queryUnprocessedItems(databaseId) {
	info('未処理アイテムを取得中...');
	const data = await notionFetch(`/databases/${databaseId}/query`, {
		method: 'POST',
		body: JSON.stringify({
			filter: {
				property: 'ステータス',
				select: { is_empty: true },
			},
		}),
	});
	const items = data.results || [];
	info(`${items.length} 件の未処理アイテムを検出`);
	return items;
}

/**
 * ページのステータスとオプションで処理日を更新
 * @param {string} pageId - ページID
 * @param {string} status - ステータス名（例: "調査中", "調査完了"）。null でクリア
 * @param {string} [date] - 処理日（YYYY-MM-DD形式）。省略時は更新しない
 * @returns {Promise<object>}
 */
export async function updatePageStatus(pageId, status, date) {
	/** @type {Record<string, unknown>} */
	const properties = {
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
 * @param {string} pageId - ページID
 * @param {Array} blocks - Notion ブロック配列
 * @returns {Promise<void>}
 */
export async function appendBlocks(pageId, blocks) {
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
