// メインエントリポイント
import { error, info } from './logger.js';

info('notion-auto-learn を起動しました');

// 環境変数の読み込み確認
const notionApiKey = process.env.NOTION_API_KEY;
const notionDbUrl = process.env.NOTION_DB_URL;
const intervalMinutes = process.env.INTERVAL_MINUTES;

if (notionApiKey) {
	info('NOTION_API_KEY: 設定済み');
} else {
	error('NOTION_API_KEY: 未設定');
}

if (notionDbUrl) {
	info('NOTION_DB_URL: 設定済み');
} else {
	error('NOTION_DB_URL: 未設定');
}

if (intervalMinutes) {
	info(`INTERVAL_MINUTES: ${intervalMinutes}`);
} else {
	info('INTERVAL_MINUTES: 未設定（デフォルト値を使用）');
}

info('起動確認完了');
