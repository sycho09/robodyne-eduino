// png2webp.mjs — public/brand 의 PNG를 같은 이름의 .webp 로 변환(원본 .png 는 유지).
// 사용: node scripts/png2webp.mjs            (public/brand 전체)
//       node scripts/png2webp.mjs a.png b.png (지정 파일만)
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import { join, extname, basename, dirname } from 'node:path';

const DIR = 'public/brand';
const args = process.argv.slice(2);
const files = args.length
  ? args
  : (await readdir(DIR)).filter((f) => extname(f).toLowerCase() === '.png').map((f) => join(DIR, f));

for (const src of files) {
  const out = join(dirname(src), basename(src, extname(src)) + '.webp');
  await sharp(src).webp({ quality: 86 }).toFile(out);
  console.log('✓', src, '→', out);
}
console.log(`done (${files.length} file${files.length === 1 ? '' : 's'}).`);
