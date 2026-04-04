// メイン処理: 未処理アイテムを取得し、claude -p で解説を生成して Notion に書き込む
// バッチ処理対応版: CHUNK_SIZE 件ずつまとめて LLM に問い合わせる

import { type ExecFileException, execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { error, info } from './logger.js';
import { mdToNotionBlocks } from './md-to-notion.js';
import { appendBlocks, queryUnprocessedItems, updatePageStatus } from './notion-client.js';

const WAIT_SECONDS = Number(process.env.WAIT_SECONDS) || 1;
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE) || 5;

// プロジェクトルートからプロンプトテンプレートを読み込む
const PROMPT_TEMPLATE_PATH = resolve(import.meta.dirname, '../prompts/explain-term.md');

/** バッチ LLM 呼び出しの JSON Schema（トップレベルは object 必須） */
const BATCH_SCHEMA = JSON.stringify({
	type: 'object',
	properties: {
		items: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					index: { type: 'number' },
					word: { type: 'string' },
					explanation: { type: 'string' },
				},
				required: ['index', 'word', 'explanation'],
			},
		},
	},
	required: ['items'],
});

/** バッチ結果の1件分 */
interface BatchResult {
	index: number;
	word: string;
	explanation: string;
}

/**
 * 指定ミリ秒だけ待機する
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * claude -p コマンドでプロンプトを実行し、出力を返す（1件用フォールバック）
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
 * 複数用語をまとめて claude -p で解説を生成する（バッチ処理）
 * パース失敗時は null を返す
 */
function runClaudeBatch(words: string[], template: string): Promise<BatchResult[] | null> {
	// テンプレートから出力ルール部分を抽出して流用
	const outputRules = template.includes('## 出力ルール')
		? template.slice(template.indexOf('## 出力ルール'))
		: '';

	// 用語リストを [index] word 形式で構築
	const wordList = words.map((w, i) => `[${i}] ${w}`).join('\n');

	const prompt = `以下の用語それぞれについて解説を生成してください。

各用語の explanation には以下のセクションを含むMarkdown形式で記述してください：
- ## 概要: 1〜3文で簡潔に説明
- ## 詳細: 背景・歴史（必要な場合）、仕組み・原理、具体例
- ## なぜ重要か: 実務や日常で知っておくべき理由
- ## 関連用語: 関連する概念を3〜5個、それぞれ1行で簡潔に説明
- ## 参考リンク: [記事タイトル](URL) 形式で信頼できる情報源を2〜3個

${outputRules}

用語リスト:
${wordList}`;

	return new Promise((resolve) => {
		const child = spawn(
			'claude',
			['-p', '--output-format', 'json', '--json-schema', BATCH_SCHEMA],
			{ timeout: 120_000 },
		);

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});
		child.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		// プロンプトを stdin 経由で渡す
		child.stdin.write(prompt);
		child.stdin.end();

		child.on('close', (code) => {
			if (code !== 0) {
				error(`バッチ claude -p 失敗 (exit ${code}): ${stderr}`);
				resolve(null);
				return;
			}

			try {
				const parsed: unknown = JSON.parse(stdout.trim());
				// --output-format json は { result: ... } でラップされる可能性あり
				const unwrapped = isWrappedResult(parsed) ? parsed.result : parsed;
				// スキーマが { items: [...] } 形式なので items を取り出す
				const data = hasItems(unwrapped) ? unwrapped.items : unwrapped;
				if (!Array.isArray(data)) {
					error('バッチ結果が配列ではありません');
					resolve(null);
					return;
				}
				resolve(data as BatchResult[]);
			} catch (parseErr) {
				error(`バッチ結果のパース失敗: ${(parseErr as Error).message}`);
				resolve(null);
			}
		});

		child.on('error', (err: ExecFileException) => {
			error(`バッチ claude -p 失敗: ${err.message}`);
			resolve(null);
		});
	});
}

/**
 * { result: ... } ラップ形式かどうかを判定
 */
function isWrappedResult(value: unknown): value is { result: unknown } {
	return typeof value === 'object' && value !== null && 'result' in value;
}

/**
 * { items: [...] } 形式かどうかを判定
 */
function hasItems(value: unknown): value is { items: unknown[] } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'items' in value &&
		Array.isArray((value as { items: unknown }).items)
	);
}

/**
 * 今日の日付を YYYY-MM-DD 形式で返す（UTC）
 */
function todayUTC(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * 未処理アイテムを取得し、チャンク単位でバッチ処理する
 */
export async function processItems(databaseId: string): Promise<void> {
	const items = await queryUnprocessedItems(databaseId);

	if (items.length === 0) {
		info('未処理アイテムなし -- 終了');
		return;
	}

	// プロンプトテンプレートを読み込む
	const template = readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');

	// 用語名が空のアイテムを除外
	const validItems = items.filter((item) => {
		const wordProp = item.properties.用語 as { title?: { plain_text?: string }[] } | undefined;
		return wordProp?.title?.[0]?.plain_text;
	});

	if (validItems.length === 0) {
		info('有効な用語名を持つアイテムなし -- 終了');
		return;
	}

	// CHUNK_SIZE ずつ分割して処理
	for (let i = 0; i < validItems.length; i += CHUNK_SIZE) {
		const chunk = validItems.slice(i, i + CHUNK_SIZE);
		const words = chunk.map((item) => {
			const wordProp = item.properties.用語 as { title?: { plain_text?: string }[] };
			// validItems でフィルタ済みなので必ず存在する
			return wordProp.title?.[0]?.plain_text ?? '';
		});

		info(
			`バッチ処理開始 (${i + 1}〜${i + chunk.length} / ${validItems.length}): ${words.join(', ')}`,
		);

		// 全件のステータスを「調査中」に更新
		for (const item of chunk) {
			await updatePageStatus(item.id, '調査中');
		}

		// バッチで LLM 呼び出し
		const batchResults = await runClaudeBatch(words, template);

		if (batchResults) {
			// バッチ成功: 各結果を Notion に書き込み
			for (const result of batchResults) {
				const item = chunk[result.index];
				if (!item) continue;
				const word = words[result.index];
				try {
					const blocks = mdToNotionBlocks(result.explanation);
					await appendBlocks(item.id, blocks);
					await updatePageStatus(item.id, '調査完了', todayUTC());
					info(`処理完了 -- ${word}`);
				} catch (err) {
					error(`${word} の書き込みに失敗: ${(err as Error).message}`);
					try {
						await updatePageStatus(item.id, null);
					} catch {
						// ロールバック失敗は無視
					}
				}
			}
		} else {
			// バッチ失敗: 1件ずつフォールバック
			info('バッチ処理失敗 -- 1件ずつフォールバック');
			for (let j = 0; j < chunk.length; j++) {
				const item = chunk[j];
				const word = words[j];
				try {
					const prompt = template.replace('{{WORD}}', word);
					const explanation = await runClaude(prompt);
					const blocks = mdToNotionBlocks(explanation);
					await appendBlocks(item.id, blocks);
					await updatePageStatus(item.id, '調査完了', todayUTC());
					info(`処理完了（フォールバック） -- ${word}`);
				} catch (err) {
					error(`${word} の処理に失敗: ${(err as Error).message}`);
					try {
						await updatePageStatus(item.id, null);
					} catch {
						// ロールバック失敗は無視
					}
				}
				await sleep(WAIT_SECONDS * 1000);
			}
		}

		// 次のチャンクまで待機
		if (i + CHUNK_SIZE < validItems.length) {
			await sleep(WAIT_SECONDS * 1000);
		}
	}

	info('全件処理完了');
}
