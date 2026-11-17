import {readFile,writeFile} from 'node:fs/promises';
const file='dist/main.js';await writeFile(file,(await readFile(file,'utf8')).replace('../../../packages/domain/draw.mjs','./packages/domain/draw.mjs'));
