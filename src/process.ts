// メイン処理: 未処理アイテムを取得し、claude -p で解説を生成して Notion に書き込む
// process.sh の Node.js 移植版

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { error, info } from './logger.js';
import { mdToNotionBlocks } from './md-to-notion.js';
import { appendBlocks, queryUnprocessedItems, updatePageStatus } from './notion-client.js';

const WAIT_SECONDS = Number(process.env.WAIT_SECONDS) || 1;

// プロジェクトルートからプロンプトテンプレートを読み込む
const PROMPT_TEMPLATE_PATH = resolve(import.meta.dirname, '../prompts/explain-term.md');

/**
 * 指定ミリ秒だけ待機する
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * claude -p コマンドでプロンプトを実行し、出力を返す
 */
function runClaude(prompt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile('claude', ['-p', prompt], { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`claude -p 失敗: ${stderr || err.message}`));
				return;
			}
			resolve(stdout);
		});
	});
}

/**
 * 今日の日付を YYYY-MM-DD 形式で返す（UTC）
 */
function todayUTC(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * 未処理アイテムを取得し、順番に処理する
 */
export async function processItems(databaseId: string): Promise<void> {
	const items = await queryUnprocessedItems(databaseId);

	if (items.length === 0) {
		info('未処理アイテムなし -- 終了');
		return;
	}

	// プロンプトテンプレートを読み込む
	const template = readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');

	for (const item of items) {
		const pageId = item.id;
		const wordProp = item.properties.用語 as { title?: { plain_text?: string }[] } | undefined;
		const word = wordProp?.title?.[0]?.plain_text;

		if (!word) {
			info(`用語名が空のアイテムをスキップ (${pageId})`);
			continue;
		}

		info(`処理開始 -- ${word}`);

		try {
			// ステータスを「調査中」に更新
			await updatePageStatus(pageId, '調査中');

			// claude -p で解説を生成
			const prompt = template.replace('{{WORD}}', word);
			const explanation = await runClaude(prompt);

			// Markdown -> Notion ブロックに変換
			const blocks = mdToNotionBlocks(explanation);

			// ページにブロックを追加
			await appendBlocks(pageId, blocks);

			// ステータスを「調査完了」+ 処理日を更新
			await updatePageStatus(pageId, '調査完了', todayUTC());

			info(`処理完了 -- ${word}`);
		} catch (err) {
			error(`${word} の処理に失敗: ${(err as Error).message}`);
			// ステータスを空に戻す（ロールバック）
			try {
				await updatePageStatus(pageId, null);
			} catch (rollbackErr) {
				error(`ロールバック失敗 (${word}): ${(rollbackErr as Error).message}`);
			}
		}

		// 次のアイテムまで待機
		await sleep(WAIT_SECONDS * 1000);
	}

	info('全件処理完了');
}
