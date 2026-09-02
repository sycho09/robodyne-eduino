// optimize-assets.mjs — public/brand 의 PNG 를 리사이즈 + WebP 로 변환(원본 .png 삭제).
//
// 마스코트/배경 워크플로우 표준 도구:
//   Blender 등에서 PNG 로 렌더 → public/brand 에 저장 → `npm run assets` →
//   알맞은 해상도의 .webp 로 교체. 코드는 .webp 경로를 참조한다.
//
// 규칙(파일명 기준 최대 가로폭):
//   *-bg / 배경      → 2048px  (전체화면 장식, 과대 해상도 방지)
//   eddie 캐릭터      → 1024px  (UI 최대 표시폭 ~520, 탑다운 ~84)
//   그 외(커버/카드)  → 1280px
// 품질: WebP q82(캐릭터 q86). 알파(투명)는 자동 보존.

import { readdir, stat, unlink } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve('public/brand');
const Q_DEFAULT = 82;
const Q_CHARACTER = 86;

function rulesFor(file) {
  const n = path.basename(file).toLowerCase();
  const rel = file.toLowerCase();
  if (rel.includes(`${path.sep}eddie${path.sep}`) || n.startsWith('eddie-'))
    return { maxW: 1024, quality: Q_CHARACTER };
  if (n.includes('-bg') || n.includes('bg.'))
    return { maxW: 2048, quality: Q_DEFAULT };
  return { maxW: 1280, quality: Q_DEFAULT };
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const mb = (b) => (b / 1048576).toFixed(2) + 'MB';

let beforeTotal = 0, afterTotal = 0, count = 0;
for await (const file of walk(ROOT)) {
  if (!file.toLowerCase().endsWith('.png')) continue;
  const { maxW, quality } = rulesFor(file);
  const before = statSync(file).size;
  const out = file.replace(/\.png$/i, '.webp');
  const meta = await sharp(file).metadata();
  await sharp(file)
    .resize({ width: Math.min(maxW, meta.width), withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toFile(out);
  const after = statSync(out).size;
  await unlink(file);
  beforeTotal += before; afterTotal += after; count++;
  const rel = path.relative(ROOT, file);
  console.log(`${rel.padEnd(34)} ${mb(before).padStart(9)} → ${mb(after).padStart(9)}  (${meta.width}px→${Math.min(maxW, meta.width)}px)`);
}
console.log(`\n${count}개 변환 · 합계 ${mb(beforeTotal)} → ${mb(afterTotal)}  (${((1 - afterTotal / beforeTotal) * 100).toFixed(1)}% 감소)`);
