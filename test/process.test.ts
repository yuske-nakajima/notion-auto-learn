// process.ts のテスト
// vitest を使用

import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// notion-client をモック
vi.mock('../src/notion-client.js', () => ({
	queryUnprocessedItems: vi.fn(),
	updatePageStatus: vi.fn(),
	appendBlocks: vi.fn(),
}));

// child_process の execFile をモック
vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
}));

// fs の readFileSync をモック（テンプレート読み込み）
vi.mock('node:fs', () => ({
	readFileSync: vi
		.fn()
		.mockReturnValue('テスト用テンプレート {{WORD}}\n## 出力ルール（厳守）\n- テスト'),
}));

// logger をモック（ログ出力を抑制）
vi.mock('../src/logger.js', () => ({
	info: vi.fn(),
	error: vi.fn(),
}));

// md-to-notion をモック
vi.mock('../src/md-to-notion.js', () => ({
	mdToNotionBlocks: vi.fn().mockReturnValue([{ object: 'block', type: 'paragraph' }]),
}));

import { execFile } from 'node:child_process';
import { appendBlocks, queryUnprocessedItems, updatePageStatus } from '../src/notion-client.js';
import { processItems } from '../src/process.js';

/** テスト用の Notion ページアイテムを生成するヘルパー */
function createItem(id: string, word: string) {
	return {
		id,
		properties: {
			用語: {
				title: word ? [{ plain_text: word }] : [],
			},
		},
	};
}

/**
 * execFile モックに、バッチ呼び出しとフォールバック呼び出しを設定するヘルパー
 * batchResult: バッチ呼び出しの結果（null ならエラーを返す）
 * fallbackResults: フォールバック呼び出しの結果（省略可）
 */
function setupExecFileMock(batchResult: unknown[] | null, fallbackResults?: string[]) {
	let fallbackIndex = 0;
	(execFile as unknown as Mock).mockImplementation(
		(
			_cmd: string,
			args: string[],
			_opts: unknown,
			callback: (err: Error | null, stdout: string, stderr: string) => void,
		) => {
			const isBatch = args.includes('--output-format');
			if (isBatch) {
				if (batchResult === null) {
					// バッチ失敗
					callback(new Error('バッチ処理エラー'), '', 'エラー');
				} else {
					callback(null, JSON.stringify(batchResult), '');
				}
			} else {
				// フォールバック（1件用）
				const result = fallbackResults?.[fallbackIndex] ?? '解説テキスト';
				fallbackIndex++;
				callback(null, result, '');
			}
		},
	);
}

describe('processItems', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// WAIT_SECONDS を 0 にしてテストを高速化
		process.env.WAIT_SECONDS = '0';
		process.env.CHUNK_SIZE = '5';
	});

	it('関数としてエクスポートされている', () => {
		expect(typeof processItems).toBe('function');
	});

	it('空のアイテムリスト: LLM呼び出しが行われない', async () => {
		(queryUnprocessedItems as Mock).mockResolvedValue([]);

		await processItems('test-db-id');

		// execFile が呼ばれていないこと
		expect(execFile).not.toHaveBeenCalled();
		// Notion への書き込みが行われていないこと
		expect(appendBlocks).not.toHaveBeenCalled();
		expect(updatePageStatus).not.toHaveBeenCalled();
	});

	it('用語名が空のアイテムはスキップされる', async () => {
		const items = [createItem('page-1', ''), createItem('page-2', '')];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);

		await processItems('test-db-id');

		// 全てスキップされるので execFile は呼ばれない
		expect(execFile).not.toHaveBeenCalled();
		expect(appendBlocks).not.toHaveBeenCalled();
	});

	it('バッチ処理の正常系: 全件が処理される', async () => {
		const items = [
			createItem('page-1', 'React'),
			createItem('page-2', 'TypeScript'),
			createItem('page-3', 'Node.js'),
			createItem('page-4', 'Vitest'),
			createItem('page-5', 'ESM'),
		];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);
		(updatePageStatus as Mock).mockResolvedValue({});
		(appendBlocks as Mock).mockResolvedValue(undefined);

		// バッチ結果を設定
		const batchResult = items.map((item, i) => ({
			index: i,
			word: item.properties.用語.title[0].plain_text,
			explanation: `${item.properties.用語.title[0].plain_text} の解説`,
		}));
		setupExecFileMock(batchResult);

		await processItems('test-db-id');

		// バッチ呼び出しが1回実行されること
		expect(execFile).toHaveBeenCalledTimes(1);

		// 全件の「調査中」ステータス更新 + 全件の「調査完了」ステータス更新
		// 調査中: 5回, 調査完了: 5回 = 合計10回
		expect(updatePageStatus).toHaveBeenCalledTimes(10);

		// 各アイテムが「調査中」に更新されていること
		for (const item of items) {
			expect(updatePageStatus).toHaveBeenCalledWith(item.id, '調査中');
		}

		// 各アイテムが「調査完了」に更新されていること（日付付き）
		for (const item of items) {
			expect(updatePageStatus).toHaveBeenCalledWith(
				item.id,
				'調査完了',
				expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			);
		}

		// appendBlocks が5回呼ばれていること
		expect(appendBlocks).toHaveBeenCalledTimes(5);
	});

	it('バッチ失敗時のフォールバック: 1件ずつ処理される', async () => {
		const items = [createItem('page-1', 'React'), createItem('page-2', 'TypeScript')];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);
		(updatePageStatus as Mock).mockResolvedValue({});
		(appendBlocks as Mock).mockResolvedValue(undefined);

		// バッチは失敗、フォールバックは成功
		setupExecFileMock(null, ['React の解説', 'TypeScript の解説']);

		await processItems('test-db-id');

		// バッチ1回 + フォールバック2回 = 合計3回
		expect(execFile).toHaveBeenCalledTimes(3);

		// 調査中: 2回 + 調査完了: 2回 = 合計4回
		expect(updatePageStatus).toHaveBeenCalledTimes(4);

		// appendBlocks が2回呼ばれていること
		expect(appendBlocks).toHaveBeenCalledTimes(2);

		// フォールバック呼び出しでは --output-format が含まれないこと
		const calls = (execFile as unknown as Mock).mock.calls;
		// 2回目以降がフォールバック
		for (let i = 1; i < calls.length; i++) {
			const args = calls[i][1] as string[];
			expect(args).not.toContain('--output-format');
		}
	});

	it('バッチ結果が { result: [...] } ラップ形式でも処理される', async () => {
		const items = [createItem('page-1', 'React')];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);
		(updatePageStatus as Mock).mockResolvedValue({});
		(appendBlocks as Mock).mockResolvedValue(undefined);

		// { result: [...] } ラップ形式のレスポンス
		const wrappedResult = {
			result: [{ index: 0, word: 'React', explanation: 'React の解説' }],
		};
		(execFile as unknown as Mock).mockImplementation(
			(
				_cmd: string,
				_args: string[],
				_opts: unknown,
				callback: (err: Error | null, stdout: string, stderr: string) => void,
			) => {
				callback(null, JSON.stringify(wrappedResult), '');
			},
		);

		await processItems('test-db-id');

		// 正常に処理されること
		expect(appendBlocks).toHaveBeenCalledTimes(1);
		expect(updatePageStatus).toHaveBeenCalledWith(
			'page-1',
			'調査完了',
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
		);
	});

	it('有効な用語と空の用語が混在する場合、空の用語のみスキップ', async () => {
		const items = [
			createItem('page-1', 'React'),
			createItem('page-2', ''),
			createItem('page-3', 'TypeScript'),
		];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);
		(updatePageStatus as Mock).mockResolvedValue({});
		(appendBlocks as Mock).mockResolvedValue(undefined);

		// バッチ結果: 有効な2件分
		const batchResult = [
			{ index: 0, word: 'React', explanation: 'React の解説' },
			{ index: 1, word: 'TypeScript', explanation: 'TypeScript の解説' },
		];
		setupExecFileMock(batchResult);

		await processItems('test-db-id');

		// バッチ呼び出しが1回
		expect(execFile).toHaveBeenCalledTimes(1);

		// 有効な2件のみ処理: 調査中2回 + 調査完了2回 = 4回
		expect(updatePageStatus).toHaveBeenCalledTimes(4);
		expect(appendBlocks).toHaveBeenCalledTimes(2);

		// page-2 は処理されていないこと
		const statusCalls = (updatePageStatus as unknown as Mock).mock.calls;
		const pageIds = statusCalls.map((c: unknown[]) => c[0]);
		expect(pageIds).not.toContain('page-2');
	});
});
