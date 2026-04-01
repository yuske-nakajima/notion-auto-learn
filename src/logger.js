// ログ出力ユーティリティ
// 形式: [YYYY-MM-DD HH:MM:SS] LEVEL: message

/** 現在のタイムスタンプを返す */
function timestamp() {
	const now = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** ログ出力の共通処理 */
function log(level, message) {
	const line = `[${timestamp()}] ${level}: ${message}`;
	if (level === 'ERROR') {
		console.error(line);
	} else if (level === 'WARN') {
		console.warn(line);
	} else {
		console.log(line);
	}
}

/** INFO レベルのログ */
export function info(message) {
	log('INFO', message);
}

/** WARN レベルのログ */
export function warn(message) {
	log('WARN', message);
}

/** ERROR レベルのログ */
export function error(message) {
	log('ERROR', message);
}
