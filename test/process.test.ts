// process.ts のテスト
// vitest を使用

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// notion-client をモック
vi.mock('../src/notion-client.js', () => ({
	queryUnprocessedItems: vi.fn(),
	updatePageStatus: vi.fn(),
	appendBlocks: vi.fn(),
}));

// child_process をモック（execFile + spawn）
vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
	spawn: vi.fn(),
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

import { execFile, spawn } from 'node:child_process';
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

/** spawn のモック子プロセスを作成するヘルパー */
function createMockChildProcess(stdout: string, exitCode: number, stderr = '') {
	const child = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter;
		stdin: { write: Mock; end: Mock };
	};
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.stdin = { write: vi.fn(), end: vi.fn() };

	// 非同期でイベントを発火
	process.nextTick(() => {
		if (stdout) child.stdout.emit('data', Buffer.from(stdout));
		if (stderr) child.stderr.emit('data', Buffer.from(stderr));
		child.emit('close', exitCode);
	});

	return child;
}

/**
 * spawn モックにバッチ結果を設定し、execFile モックにフォールバック結果を設定するヘルパー
 */
function setupMocks(batchResult: unknown | null, fallbackResults?: string[]) {
	// spawn: バッチ呼び出し用
	if (batchResult === null) {
		(spawn as unknown as Mock).mockReturnValue(createMockChildProcess('', 1, 'バッチ処理エラー'));
	} else {
		(spawn as unknown as Mock).mockReturnValue(
			createMockChildProcess(JSON.stringify(batchResult), 0),
		);
	}

	// execFile: フォールバック用（1件ずつ）
	let fallbackIndex = 0;
	(execFile as unknown as Mock).mockImplementation(
		(
			_cmd: string,
			_args: string[],
			_opts: unknown,
			callback: (err: Error | null, stdout: string, stderr: string) => void,
		) => {
			const result = fallbackResults?.[fallbackIndex] ?? '解説テキスト';
			fallbackIndex++;
			callback(null, result, '');
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

		// spawn/execFile が呼ばれていないこと
		expect(spawn).not.toHaveBeenCalled();
		expect(execFile).not.toHaveBeenCalled();
		expect(appendBlocks).not.toHaveBeenCalled();
		expect(updatePageStatus).not.toHaveBeenCalled();
	});

	it('用語名が空のアイテムはスキップされる', async () => {
		const items = [createItem('page-1', ''), createItem('page-2', '')];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);

		await processItems('test-db-id');

		expect(spawn).not.toHaveBeenCalled();
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
		setupMocks(batchResult);

		await processItems('test-db-id');

		// spawn（バッチ）が1回呼ばれること
		expect(spawn).toHaveBeenCalledTimes(1);
		// stdin にプロンプトが書き込まれていること
		const child = (spawn as unknown as Mock).mock.results[0].value;
		expect(child.stdin.write).toHaveBeenCalledTimes(1);
		expect(child.stdin.end).toHaveBeenCalledTimes(1);

		// 全件の「調査中」+ 全件の「調査完了」= 10回
		expect(updatePageStatus).toHaveBeenCalledTimes(10);

		for (const item of items) {
			expect(updatePageStatus).toHaveBeenCalledWith(item.id, '調査中');
		}
		for (const item of items) {
			expect(updatePageStatus).toHaveBeenCalledWith(
				item.id,
				'調査完了',
				expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			);
		}

		expect(appendBlocks).toHaveBeenCalledTimes(5);
	});

	it('バッチ失敗時のフォールバック: 1件ずつ処理される', async () => {
		const items = [createItem('page-1', 'React'), createItem('page-2', 'TypeScript')];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);
		(updatePageStatus as Mock).mockResolvedValue({});
		(appendBlocks as Mock).mockResolvedValue(undefined);

		// バッチは失敗、フォールバックは成功
		setupMocks(null, ['React の解説', 'TypeScript の解説']);

		await processItems('test-db-id');

		// spawn（バッチ）1回 + execFile（フォールバック）2回
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(execFile).toHaveBeenCalledTimes(2);

		// 調査中: 2回 + 調査完了: 2回 = 4回
		expect(updatePageStatus).toHaveBeenCalledTimes(4);
		expect(appendBlocks).toHaveBeenCalledTimes(2);
	});

	it('バッチ結果が { result: [...] } ラップ形式でも処理される', async () => {
		const items = [createItem('page-1', 'React')];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);
		(updatePageStatus as Mock).mockResolvedValue({});
		(appendBlocks as Mock).mockResolvedValue(undefined);

		// { result: [...] } ラップ形式
		const wrappedResult = {
			result: [{ index: 0, word: 'React', explanation: 'React の解説' }],
		};
		setupMocks(wrappedResult);

		await processItems('test-db-id');

		expect(appendBlocks).toHaveBeenCalledTimes(1);
		expect(updatePageStatus).toHaveBeenCalledWith(
			'page-1',
			'調査完了',
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
		);
	});

	it('バッチ結果が { items: [...] } 形式でも処理される', async () => {
		const items = [createItem('page-1', 'React')];
		(queryUnprocessedItems as Mock).mockResolvedValue(items);
		(updatePageStatus as Mock).mockResolvedValue({});
		(appendBlocks as Mock).mockResolvedValue(undefined);

		// { items: [...] } 形式（実際のJSON Schemaレスポンス形式）
		const itemsResult = {
			items: [{ index: 0, word: 'React', explanation: 'React の解説' }],
		};
		setupMocks(itemsResult);

		await processItems('test-db-id');

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
		setupMocks(batchResult);

		await processItems('test-db-id');

		// spawn が1回
		expect(spawn).toHaveBeenCalledTimes(1);

		// 有効な2件のみ: 調査中2回 + 調査完了2回 = 4回
		expect(updatePageStatus).toHaveBeenCalledTimes(4);
		expect(appendBlocks).toHaveBeenCalledTimes(2);

		// page-2 は処理されていないこと
		const statusCalls = (updatePageStatus as unknown as Mock).mock.calls;
		const pageIds = statusCalls.map((c: unknown[]) => c[0]);
		expect(pageIds).not.toContain('page-2');
	});
});
