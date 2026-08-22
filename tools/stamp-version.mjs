// 推上去之前先跑這個，把目前的 commit hash 標進 js/version.js，
// 這樣主頁面才能顯示「現在跑的是哪個版本」。
//
//   node tools/stamp-version.mjs
//
// 抓的是「執行當下」HEAD 的 commit，所以要在其他功能都 commit 完、
// 準備推上去之前才跑——跑完再把 js/version.js 的變動單獨 commit 一次。

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const commit = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10);

const content = `// 版本標記：顯示最後一次 push 的 commit（縮寫）。
// 純靜態網站沒有建置流程，沒辦法自動標上「這次 commit 自己」的 hash——
// 這個檔案要在 push 之前跑 node tools/stamp-version.mjs 更新，抓的是
// 「執行當下」最新的 commit，所以更新版本這個 commit 本身不會被標到，
// 永遠會晚一個 commit（那個 commit 只改這個檔案，不算功能）。
export const COMMIT = '${commit}';
export const STAMPED_AT = '${date}';
`;

const target = fileURLToPath(new URL('../js/version.js', import.meta.url));
writeFileSync(target, content);
console.log(`已標記版本：${commit}（${date}）`);
