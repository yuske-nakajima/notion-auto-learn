// メインエントリポイント
// --health-check: ヘルスチェックのみ実行
// --run-once: 1回だけ処理を実行
// 引数なし: 定期実行モード（setInterval）

import { runHealthCheck } from './health-check.js';
import { error, info } from './logger.js';
import { extractDatabaseId } from './notion-client.js';
import { processItems } from './process.js';

const INTERVAL_MINUTES = Number(process.env.INTERVAL_MINUTES) || 30;

/** 実行中フラグ（重複実行防止） */
let isRunning = false;

/** setInterval の ID（グレースフルシャットダウン用） */
let intervalId = null;

/**
 * DB ID を環境変数から取得する
 * @returns {string}
 */
function getDatabaseId() {
	const url = process.env.NOTION_DB_URL;
	if (!url) {
		throw new Error('NOTION_DB_URL が未設定です');
	}
	return extractDatabaseId(url);
}

/**
 * 1回分の処理を実行する（重複実行ガード付き）
 */
async function runOnce() {
	if (isRunning) {
		info('前回の処理がまだ実行中のためスキップ');
		return;
	}

	isRunning = true;
	try {
		const databaseId = getDatabaseId();
		await processItems(databaseId);
	} catch (err) {
		error(`処理エラー: ${err.message}`);
	} finally {
		isRunning = false;
	}
}

/**
 * グレースフルシャットダウン
 * @param {string} signal - シグナル名
 */
function shutdown(signal) {
	info(`${signal} を受信 -- シャットダウン中...`);
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
	info('シャットダウン完了');
	process.exit(0);
}

// シグナルハンドラ登録
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// --- メイン ---
const args = process.argv.slice(2);

if (args.includes('--health-check')) {
	// ヘルスチェックモード
	const ok = await runHealthCheck();
	process.exit(ok ? 0 : 1);
} else if (args.includes('--run-once')) {
	// 1回実行モード
	info('notion-auto-learn: 1回実行モード');
	await runOnce();
} else {
	// 定期実行モード
	info(`notion-auto-learn: 定期実行モード（${INTERVAL_MINUTES}分間隔）`);
	// 起動時に1回実行
	await runOnce();
	// 以降は定期実行
	intervalId = setInterval(runOnce, INTERVAL_MINUTES * 60 * 1000);
}
