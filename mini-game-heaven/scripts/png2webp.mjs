// png2webp.mjs — [보조 도구] PNG를 같은 이름의 .webp 로 변환만 한다(리사이즈 없음, 원본 유지).
//
// ⚠️ 표준 도구는 `npm run assets`(scripts/optimize-assets.mjs)다.
//    그쪽은 파일명 규칙에 따라 리사이즈까지 하고 원본 PNG를 지운다 — 일반 작업은 그걸 쓸 것.
//    이 스크립트는 "이미 적정 해상도라 리사이즈 없이 변환만 필요할 때"만 쓴다.
//
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
