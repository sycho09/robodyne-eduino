/**
 * ui/assets.js — 에셋 슬롯 해석기.
 *
 * 비주얼은 에셋 슬롯으로만 들어온다. 코드가 그림을 그리지 않는다.
 * 슬롯이 비었거나 로드에 실패하면 렌더러는 형상 플레이스홀더로 폴백한다.
 * 어떤 경우에도 화면이 깨지지 않아야 하므로 모든 로드는 개별적으로 실패를 흡수한다.
 *
 * 슬롯 종류
 *   sprite        단일 이미지
 *   texture       단일 이미지 + 물리 스케일 메타(tile_mm 등)
 *   sprite_frames 프리렌더 시트. path 가 가리키는 메타 JSON 을 읽어 프레임과 그림자를 모두 불러온다.
 *   scene_background 프리렌더 배경. 메타 JSON 에 이미지 경로와 투영 축이 함께 들어 있다.
 *   sprite_sheet  여러 묶음이 든 시트. JSON 만 읽어 주고 프레임은 쓰는 쪽이 필요할 때 받는다.
 *
 * 파일명에는 내용 해시가 박혀 있다(tools/seal/seal_assets.py). 내용이 바뀌면 주소가 바뀌므로
 * 낡은 캐시가 새 짝과 만날 수 없다. 그래도 어긋나면 배경은 해시를 대조해 오류로 알린다 —
 * 조용히 폴백하면 코드도 데이터도 멀쩡한데 화면만 틀린 상태가 그대로 배포된다.
 */

const MANIFEST_URL = new URL('../../assets/assets.manifest.json', import.meta.url);

/**
 * [dev] 콜드 캐시 재현용 지연(ms). `?assetdelay=800` 로 켠다.
 *
 * 로컬 파일은 즉시 도착해서 "에셋이 늦게 오는" 상황이 로컬에서 한 번도 재현되지 않았다.
 * 그래서 헤드리스가 늘 통과하는데 배포본만 폴백이었다. 지연을 네트워크가 아니라
 * 로더에서 만들어야 도구 없이도 같은 조건을 만들 수 있다.
 * 파라미터가 없으면 0 이라 학생 경로에는 아무 영향이 없다.
 */
function assetDelayMs() {
  try {
    const v = Number(new URLSearchParams(globalThis.location.search).get('assetdelay'));
    return Number.isFinite(v) && v > 0 ? Math.min(v, 30000) : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * @param {object} opts
 * @param {string[]} [opts.only] 이 슬롯만 받는다(허브처럼 한 장만 필요한 화면).
 * @param {string[]} [opts.include] lazy 로 표시된 슬롯 중 이것만 함께 받는다.
 *   규칙 모달 그림은 챌린지마다 넉 장뿐인데 스무 장이 대장에 올라 있다 — 열지도 않을
 *   열여섯 장을 매번 받게 두면 첫 화면이 그만큼 늦는다.
 * @param {(id:string, api:object)=>void} [opts.onSlot] 슬롯 하나가 도착할 때마다 부른다.
 *   전부 모일 때까지 기다리지 않고 그때그때 화면에 얹기 위한 것이다 — 배경 한 장이
 *   왔는데 스프라이트 서른세 장을 기다리느라 폴백이 유지되면 안 된다.
 */
export async function loadAssets({ only = null, include = null, onSlot = null } = {}) {
  let manifest = { version: 2, slots: {} };
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) manifest = await res.json();
  } catch (_) {
    // 에셋 매니페스트가 없어도 앱은 동작해야 한다.
  }

  const resolved = new Map();
  const missing = [];
  const slotId = (ref) => (typeof ref === 'string' && ref.startsWith('slot:') ? ref.slice(5) : null);
  // 반환할 객체를 먼저 만든다. onSlot 이 같은 객체를 보므로, 부르는 쪽은 전부 모이기 전에도
  // 이미 도착한 슬롯을 그릴 수 있다.
  const api = {
    get manifest() { return manifest; },
    get missing() { return missing; },
    /** 아직 한 슬롯도 못 받았는가. '아직 안 온 것'과 '실패한 것'을 구분하는 데 쓴다. */
    get pending() { return resolved.size + missing.length < entriesCount; },
    /** "slot:car.2wd" → 이미지 또는 프레임셋. 없으면 null */
    resolve(ref) {
      const id = slotId(ref);
      return id ? (resolved.get(id) || null) : null;
    },
    /** 슬롯의 메타데이터(tile_mm 등) */
    meta(ref) {
      const id = slotId(ref);
      return id ? ((manifest.slots || {})[id] || null) : null;
    },
  };
  // 허브처럼 슬롯 하나만 필요한 화면이 3MB 를 통째로 받지 않도록 걸러낸다.
  const wanted = new Set(include || []);
  const entries = Object.entries(manifest.slots || {}).filter(([id, slot]) => (
    only ? only.includes(id) : (!slot || !slot.lazy || wanted.has(id))
  ));
  const entriesCount = entries.length;

  const delay = assetDelayMs();
  await Promise.all(entries.map(async ([id, slot]) => {
    if (!slot || !slot.path) { missing.push(id); return; }
    const url = new URL(slot.path, MANIFEST_URL);
    try {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (slot.type === 'sprite_frames') {
        resolved.set(id, await loadFrameSet(url));
      } else if (slot.type === 'scene_background') {
        resolved.set(id, await loadBackground(url));
      } else if (slot.type === 'sprite_sheet') {
        resolved.set(id, await loadSheet(url));
      } else {
        resolved.set(id, await loadImage(url));
      }
      // 도착하는 대로 알린다. 첫 프레임이 폴백으로 굳지 않게 하는 것이 목적이다.
      if (onSlot) { try { onSlot(id, api); } catch (_) { /* 알림이 로드를 막지 않는다 */ } }
    } catch (e) {
      missing.push(id);
      // 조용히 넘어가지 않는다. 화면은 폴백을 그리되 이 사실은 불러온 쪽이 오류 채널에 남긴다.
      // eslint-disable-next-line no-console
      console.error(`에셋 슬롯 '${id}' 로드 실패 — 플레이스홀더로 폴백합니다.`, e);
    }
  }));

  return api;
}

/** 배경은 이미지 한 장 + 투영 축이 담긴 사이드카 JSON 한 쌍이다. */
async function loadBackground(metaUrl) {
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error(`배경 메타 로드 실패: HTTP ${res.status}`);
  const meta = await res.json();
  const imageUrl = new URL(meta.image, metaUrl);
  if (!meta.image_sha256) return { kind: 'background', meta, image: await loadImage(imageUrl) };
  return { kind: 'background', meta, image: await loadVerifiedImage(imageUrl, meta.image_sha256) };
}

/**
 * 사이드카가 적어 둔 해시와 실제로 받은 이미지가 같은지 본다.
 * 다르면 그리지 않고 던진다 — 어긋난 짝으로 그린 화면은 맞는 화면처럼 보이지만 전부 틀리다.
 */
async function loadVerifiedImage(url, want) {
  const digest = globalThis.crypto && globalThis.crypto.subtle;
  if (!digest) return loadImage(url);          // 보안 컨텍스트가 아니면 검사만 건너뛴다
  const res = await fetch(url);
  if (!res.ok) throw new Error(`배경 이미지 로드 실패: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const got = [...new Uint8Array(await digest.digest('SHA-256', buf))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  if (got !== want) {
    throw new Error(`배경 이미지가 사이드카와 짝이 맞지 않습니다 `
      + `(사이드카 ${want.slice(0, 12)} / 받은 파일 ${got.slice(0, 12)})`);
  }
  // 받은 바이트를 그대로 그림으로 만든다. blob URL 을 만들어 쓰고 곧바로 회수하면
  // 브라우저가 나중에 다시 디코드해야 할 때 원본이 없어 아무것도 그려지지 않을 수 있다 —
  // createImageBitmap 은 주소에 매이지 않으므로 그 위험이 없다.
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(new Blob([buf]));
  }
  return loadImage(URL.createObjectURL(new Blob([buf])));   // 회수하지 않는다(수명 = 페이지)
}

/** 시트는 JSON 한 장이다. 프레임 주소는 시트 자신에 상대적이라 URL 을 함께 넘긴다. */
async function loadSheet(metaUrl) {
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error(`시트 메타 로드 실패: HTTP ${res.status}`);
  return { kind: 'sheet', meta: await res.json(), url: metaUrl };
}

async function loadFrameSet(metaUrl) {
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error(`프레임 메타 로드 실패: HTTP ${res.status}`);
  const meta = await res.json();
  const load = (dir, file) => loadImage(new URL(`${dir}/${file}`, metaUrl));
  const frames = await Promise.all(meta.frames.map((f) => load(meta.body_dir, f.file)));
  const shadows = await Promise.all(meta.frames.map((f) => load(meta.shadow_dir, f.file)));
  return { kind: 'frames', meta, frames, shadows };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
    img.src = String(url);
  });
}
