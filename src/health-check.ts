// ヘルスチェック: 環境変数、API 疎通、コマンド存在を確認
// health-check.sh の Node.js 移植版

import { execFile } from 'node:child_process';
import { info, error as logError } from './logger.js';
import { extractDatabaseId } from './notion-client.js';

const NOTION_API_VERSION = '2022-06-28';

/**
 * コマンドが PATH 上に存在するか確認する
 */
function commandExists(cmd: string): Promise<boolean> {
	return new Promise((resolve) => {
		execFile('which', [cmd], (err) => {
			resolve(!err);
		});
	});
}

/**
 * ヘルスチェックを実行する
 * すべてのチェック結果をログ出力し、エラーがあれば false を返す
 */
export async function runHealthCheck(): Promise<boolean> {
	const errors: string[] = [];

	const logOk = (msg: string): void => info(`OK: ${msg}`);
	const logFail = (msg: string): void => {
		logError(`FAIL: ${msg}`);
		errors.push(msg);
	};

	info('=== health-check ===');

	// 1. 必須環境変数チェック
	const notionApiKey = process.env.NOTION_API_KEY;
	const notionDbUrl = process.env.NOTION_DB_URL;

	if (notionApiKey) {
		logOk('NOTION_API_KEY が設定済み');
	} else {
		logFail('NOTION_API_KEY が未設定');
	}

	if (notionDbUrl) {
		logOk('NOTION_DB_URL が設定済み');
	} else {
		logFail('NOTION_DB_URL が未設定');
	}

	// 2. claude コマンド存在確認
	if (await commandExists('claude')) {
		logOk('claude コマンドが利用可能');
	} else {
		logFail('claude が見つかりません -- インストールしてください');
	}

	// 3. Notion API 疎通確認
	if (notionApiKey) {
		try {
			const response = await fetch('https://api.notion.com/v1/users/me', {
				headers: {
					Authorization: `Bearer ${notionApiKey}`,
					'Notion-Version': NOTION_API_VERSION,
				},
			});
			if (response.ok) {
				logOk('Notion API 疎通OK（200）');
			} else {
				logFail(`Notion API 疎通NG（HTTP ${response.status}）-- NOTION_API_KEY を確認`);
			}
		} catch (err) {
			logFail(`Notion API 疎通NG -- ${(err as Error).message}`);
		}
	}

	// 4. DB アクセス確認
	if (notionApiKey && notionDbUrl) {
		try {
			const dbId = extractDatabaseId(notionDbUrl);
			const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
				headers: {
					Authorization: `Bearer ${notionApiKey}`,
					'Notion-Version': NOTION_API_VERSION,
				},
			});
			if (response.ok) {
				logOk(`Notion DB アクセスOK（DB ID: ${dbId.slice(0, 8)}...）`);
			} else {
				logFail(
					`Notion DB アクセスNG（HTTP ${response.status}）-- URL と Integration の共有設定を確認`,
				);
			}
		} catch (err) {
			logFail(`Notion DB アクセスNG -- ${(err as Error).message}`);
		}
	}

	// 結果
	info('=====================');
	if (errors.length === 0) {
		logOk('全チェック通過');
		return true;
	}
	logError(`${errors.length} 件のエラー:`);
	for (const e of errors) {
		logError(`  - ${e}`);
	}
	return false;
}
