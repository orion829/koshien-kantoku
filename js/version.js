// 版本標記：顯示最後一次 push 的 commit（縮寫）。
// 純靜態網站沒有建置流程，沒辦法自動標上「這次 commit 自己」的 hash——
// 這個檔案要在 push 之前跑 node tools/stamp-version.mjs 更新，抓的是
// 「執行當下」最新的 commit，所以更新版本這個 commit 本身不會被標到，
// 永遠會晚一個 commit（那個 commit 只改這個檔案，不算功能）。
export const COMMIT = '60dbc28';
export const STAMPED_AT = '2026-08-22';
