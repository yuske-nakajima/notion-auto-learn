// Markdown → Notion ブロック変換ライブラリ
// 対応: 見出し(h1,h2,h3), 太字, リンク, 生URL, 箇条書き, 番号付きリスト, テーブル, 段落

// 正規表現パターン
const RE_BOLD = /^\*\*([^*]+)\*\*/;
const RE_LINK = /^\[([^\]]+)\]\(([^)]+)\)/;
const RE_URL = /^https?:\/\/[^\s)>]+/;
const RE_PLAIN = /^([^*[]+)/;
const RE_TABLE_SEP = /^\|[\s:|-]+\|$/;

/**
 * テキスト中の **太字**, [text](url), 生URL を Notion rich_text 配列に変換
 * @param {string} text
 * @returns {Array} Notion rich_text 配列
 */
export function parseRichText(text) {
	const segments = [];
	let remaining = text;

	while (remaining.length > 0) {
		const boldMatch = remaining.match(RE_BOLD);
		const linkMatch = remaining.match(RE_LINK);
		const urlMatch = remaining.match(RE_URL);
		const plainMatch = remaining.match(RE_PLAIN);

		if (boldMatch) {
			// 太字
			segments.push({
				type: 'text',
				text: { content: boldMatch[1] },
				annotations: { bold: true },
			});
			remaining = remaining.slice(boldMatch[0].length);
		} else if (linkMatch) {
			// Markdownリンク
			segments.push({
				type: 'text',
				text: { content: linkMatch[1], link: { url: linkMatch[2] } },
			});
			remaining = remaining.slice(linkMatch[0].length);
		} else if (urlMatch) {
			// 生URL
			segments.push({
				type: 'text',
				text: { content: urlMatch[0], link: { url: urlMatch[0] } },
			});
			remaining = remaining.slice(urlMatch[0].length);
		} else if (plainMatch) {
			let plain = plainMatch[0];
			// プレーンテキスト中にURLが含まれていればその手前で分割
			const httpsIdx = plain.indexOf('https://');
			const httpIdx = plain.indexOf('http://');
			if (httpsIdx !== -1 || httpIdx !== -1) {
				let splitAt = plain.length;
				if (httpsIdx !== -1) splitAt = Math.min(splitAt, httpsIdx);
				if (httpIdx !== -1) splitAt = Math.min(splitAt, httpIdx);
				if (splitAt === 0) {
					// URLチェックに戻すため1文字だけ消費
					plain = remaining[0];
				} else {
					plain = plain.slice(0, splitAt);
				}
			}
			segments.push({
				type: 'text',
				text: { content: plain },
			});
			remaining = remaining.slice(plain.length);
		} else {
			// 単一文字 fallback（*, [, 等）
			segments.push({
				type: 'text',
				text: { content: remaining[0] },
			});
			remaining = remaining.slice(1);
		}
	}

	return segments;
}

/**
 * テーブル行をパースしてNotion table_row の cells 配列を返す
 * @param {string} line - "| cell1 | cell2 |" 形式
 * @returns {Array} cells配列（各セルは rich_text 配列）
 */
function parseTableRow(line) {
	// 先頭・末尾の | を除去し、| で分割
	const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
	const parts = trimmed.split('|');
	return parts.map((part) => parseRichText(part.trim()));
}

/**
 * テーブル区切り行かどうかを判定
 * @param {string} line
 * @returns {boolean}
 */
function isSeparatorRow(line) {
	return RE_TABLE_SEP.test(line);
}

/**
 * Markdown を Notion ブロック配列に変換
 * @param {string} markdown
 * @returns {Array} Notion block 配列
 */
export function mdToNotionBlocks(markdown) {
	const blocks = [];
	let currentText = '';
	let inTable = false;
	let tableRows = [];
	let tableWidth = 0;

	/** 溜まったテキストを paragraph として flush */
	function flushParagraph() {
		if (currentText.length > 0) {
			const richText = parseRichText(currentText);
			blocks.push({
				object: 'block',
				type: 'paragraph',
				paragraph: { rich_text: richText },
			});
			currentText = '';
		}
	}

	/** テーブルバッファを flush */
	function flushTable() {
		if (inTable && tableRows.length > 0) {
			blocks.push({
				object: 'block',
				type: 'table',
				table: {
					table_width: tableWidth,
					has_column_header: true,
					children: tableRows.map((cells) => ({
						object: 'block',
						type: 'table_row',
						table_row: { cells },
					})),
				},
			});
		}
		inTable = false;
		tableRows = [];
		tableWidth = 0;
	}

	const lines = markdown.split('\n');

	for (const line of lines) {
		// テーブル行の検出（| で始まり | で終わる）
		if (/^\|.+\|$/.test(line)) {
			// 区切り行はスキップ
			if (isSeparatorRow(line)) {
				continue;
			}
			// テーブルモード開始
			if (!inTable) {
				flushParagraph();
				inTable = true;
				tableRows = [];
			}
			const cells = parseTableRow(line);
			tableWidth = cells.length;
			tableRows.push(cells);
			continue;
		}

		// テーブル外の行が来たらテーブルを flush
		if (inTable) {
			flushTable();
		}

		// 見出し h3
		if (/^### /.test(line)) {
			flushParagraph();
			const headingText = line.replace(/^### /, '');
			blocks.push({
				object: 'block',
				type: 'heading_3',
				heading_3: { rich_text: parseRichText(headingText) },
			});
		}
		// 見出し h2
		else if (/^## /.test(line)) {
			flushParagraph();
			const headingText = line.replace(/^## /, '');
			blocks.push({
				object: 'block',
				type: 'heading_2',
				heading_2: { rich_text: parseRichText(headingText) },
			});
		}
		// 見出し h1
		else if (/^# /.test(line)) {
			flushParagraph();
			const headingText = line.replace(/^# /, '');
			blocks.push({
				object: 'block',
				type: 'heading_1',
				heading_1: { rich_text: parseRichText(headingText) },
			});
		}
		// 箇条書き（- または * で始まる）
		else if (/^[-*] /.test(line)) {
			flushParagraph();
			const itemText = line.replace(/^[-*] /, '');
			blocks.push({
				object: 'block',
				type: 'bulleted_list_item',
				bulleted_list_item: { rich_text: parseRichText(itemText) },
			});
		}
		// 番号付きリスト
		else if (/^\d+\. /.test(line)) {
			flushParagraph();
			const itemText = line.replace(/^\d+\. /, '');
			blocks.push({
				object: 'block',
				type: 'numbered_list_item',
				numbered_list_item: { rich_text: parseRichText(itemText) },
			});
		}
		// 空行
		else if (line === '') {
			flushParagraph();
		}
		// 通常テキスト
		else {
			if (currentText.length > 0) {
				currentText += `\n${line}`;
			} else {
				currentText = line;
			}
		}
	}

	// 残りを flush
	flushTable();
	flushParagraph();

	return blocks;
}
