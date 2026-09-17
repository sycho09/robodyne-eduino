/**
 * ui/storage.js — 브라우저 한정 보존 (서버 저장 아님).
 *
 * 키 네임스페이스는 8차 그대로 dtc:v1:<kit>:<challenge> 를 쓴다.
 * 안에 담기는 내용만 스키마 2로 올라갔다(시도 스냅샷·회고 추가). 1은 읽어서 그대로 품는다.
 *
 * 하드삭제 금지: 이력을 지우는 경로는 두지 않는다.
 * 용량이 꽉 찼을 때만 오래된 미완주 이력부터 덜어내며, 베스트와 회고가 달린 스냅샷은 건드리지 않는다.
 */

const KEY_VERSION = 1;     // 저장 키 네임스페이스 (8차 확정, 바꾸지 않는다)
const DATA_VERSION = 2;    // 저장 내용 스키마

const EMPTY = () => ({ v: DATA_VERSION, code: null, starterAtSave: null, starterVersion: null, attempt: 0, history: [], snapshots: {}, notes: {}, solutionSeenAt: null, mlSamples: [], mlTrend: [] });

export function storageKey(kitId, challengeId) {
  return `dtc:v${KEY_VERSION}:${kitId}:${challengeId}`;
}

/** 코드 한 편을 가리키는 짧은 해시. 같은 코드는 같은 id 라 스냅샷이 중복 저장되지 않는다. */
export function codeHash(source) {
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function migrate(data) {
  if (!data || typeof data !== 'object') return EMPTY();
  const out = { ...EMPTY(), ...data };
  out.v = DATA_VERSION;
  out.history = Array.isArray(data.history) ? data.history : [];
  out.snapshots = data.snapshots && typeof data.snapshots === 'object' ? data.snapshots : {};
  out.notes = data.notes && typeof data.notes === 'object' ? data.notes : {};
  out.solutionSeenAt = typeof data.solutionSeenAt === 'number' ? data.solutionSeenAt : null;
  // 저장된 코드가 어느 판 스타터에서 나왔는지. 없으면 52차 이전 판으로 본다(52-1차).
  out.starterVersion = typeof data.starterVersion === 'number' ? data.starterVersion : null;
  // 학습 샘플은 특징값만 담는다. 원본 사진은 어디에도 저장하지 않는다.
  out.mlSamples = Array.isArray(data.mlSamples) ? data.mlSamples : [];
  // 학습을 누를 때마다 남는 점(총 샘플 수, 정확도). 수치는 전부 엔진이 낸 값이다.
  out.mlTrend = Array.isArray(data.mlTrend) ? data.mlTrend : [];
  return out;
}

/**
 * 버전 정보가 없는 기록은 구버전이다. 대표 기록에서 빼되 이력에는 남긴다.
 * 채점 규칙이 바뀐 뒤로는 규칙 버전도 함께 본다 — 이탈 페널티가 없던 시절의 기록과
 * 지금 기록을 한 줄에 놓고 비교할 수 없기 때문이다. 값을 고치거나 지우지는 않는다.
 */
export function isComparable(row, engineVersion, challengeVersion, scoringVersion) {
  if (!row || row.ended) return false;
  if (typeof row.ticks !== 'number') return false;
  if (row.engine_version === undefined || row.challenge_version === undefined) return false;
  if (scoringVersion !== undefined && row.scoring_version !== scoringVersion) return false;
  return row.engine_version === engineVersion && row.challenge_version === challengeVersion;
}

export function createStore(kitId, challengeId) {
  const key = storageKey(kitId, challengeId);
  let usable = true;
  let cache = EMPTY();

  try {
    const probe = '__dtc_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    const raw = window.localStorage.getItem(key);
    if (raw) cache = migrate(JSON.parse(raw));
  } catch (_) {
    usable = false;
  }

  let failed = false;

  function write() {
    window.localStorage.setItem(key, JSON.stringify(cache));
  }

/** 57-C 파트3 — 자취를 들고 있는 시도는 최근 이만큼만. 값은 여기 한 곳에서만 정한다. */
const PATH_KEEP = 3;

  /**
   * 57-C 파트3 — 자취(좌표 배열)를 들고 있는 시도를 최근 세 건까지만 남긴다.
   *
   * 네 번째가 생기면 가장 오래된 것의 **자취만** 배열에서 빠진다. 시도 기록 자체는 그대로 남고
   * 랩타임·구간·이탈 같은 수치도 남는다 — 무거운 좌표 배열만 덜어내는 것이다.
   * 지우는 API 를 따로 만들지 않는다. 목록에서 빠지는 것이지 지우는 것이 아니다.
   */
  function trimPaths() {
    const withPath = cache.history.filter((r) => r && r.path && Array.isArray(r.path.samples));
    for (let i = 0; i < withPath.length - PATH_KEEP; i++) delete withPath[i].path;
  }

  /** 용량이 찼을 때만 부른다. 지울 수 있는 것부터 순서대로 덜어낸다. */
  function prune() {
    const protectedIds = new Set(Object.keys(cache.notes));
    const comparable = cache.history.filter((r) => !r.ended && typeof r.ticks === 'number');
    if (comparable.length) {
      const best = comparable.reduce((a, b) => (a.ticks <= b.ticks ? a : b));
      if (best.snapshot) protectedIds.add(best.snapshot);
    }
    // 0순위: 오래된 자취. 좌표 배열이 이력에서 제일 무겁고, 없어도 수치는 그대로 남는다.
    const heavy = cache.history.findIndex((r) => r && r.path);
    if (heavy >= 0 && cache.history.filter((r) => r && r.path).length > 1) {
      delete cache.history[heavy].path;
      return true;
    }
    // 1순위: 오래된 미완주 이력, 2순위: 회고·베스트가 걸리지 않은 오래된 완주 이력
    const droppable = cache.history.findIndex((r) => r.ended);
    if (droppable >= 0) { cache.history.splice(droppable, 1); return true; }
    const old = cache.history.findIndex((r) => !protectedIds.has(r.snapshot));
    if (old >= 0) {
      const [gone] = cache.history.splice(old, 1);
      if (gone.snapshot && !protectedIds.has(gone.snapshot) && !cache.history.some((r) => r.snapshot === gone.snapshot)) {
        delete cache.snapshots[gone.snapshot];
      }
      return true;
    }
    return false;
  }

  function flush() {
    if (!usable) return false;
    for (let i = 0; i < 12; i++) {
      try { write(); return true; } catch (_) {
        if (!prune()) { failed = true; return false; }
      }
    }
    failed = true;
    return false;
  }

  return {
    get usable() { return usable && !failed; },
    get code() { return cache.code; },
    get starterAtSave() { return cache.starterAtSave; },
    get attempt() { return cache.attempt || 0; },
    get history() { return cache.history; },
    get snapshots() { return cache.snapshots; },
    get notes() { return cache.notes; },
    /** 해답을 열어본 시각. 한 번 켜지면 되돌리지 않는다 — 채점이 정직해야 한다. */
    get solutionSeenAt() { return cache.solutionSeenAt; },
    markSolutionSeen(at) {
      if (cache.solutionSeenAt) return true;
      cache.solutionSeenAt = at;
      return flush();
    },

    /** 학습 샘플 (특징값만). 사진은 저장하지 않는다 — 영상 저장·전송 금지 원칙. */
    get mlSamples() { return cache.mlSamples; },
    setMlSamples(list) {
      cache.mlSamples = list.map((s2) => ({ label: s2.label | 0, f: s2.f.map((v) => v | 0), at: s2.at | 0 }));
      return flush();
    },

    get mlTrend() { return cache.mlTrend; },
    pushMlTrend(point) {
      cache.mlTrend = cache.mlTrend.concat([{ total: point.total | 0, accuracy: point.accuracy | 0, hash: String(point.hash) }]).slice(-40);
      return flush();
    },

    saveCode(code, starter, starterVersion) {
      cache.code = code;
      if (starter !== undefined) cache.starterAtSave = starter;
      // 판 번호를 함께 적는다. 글자 비교만으로는 "옛 판에서 손댄 코드" 를 알 수 없다.
      if (starterVersion !== undefined) cache.starterVersion = starterVersion;
      return flush();
    },
    setAttempt(n) { cache.attempt = n; return flush(); },

    /** 시도 한 건을 이력에 남긴다. 완주면 코드 전문을 스냅샷으로 함께 보관한다. */
    pushRecord(row, code) {
      if (code && row.snapshot && !cache.snapshots[row.snapshot]) {
        cache.snapshots[row.snapshot] = { code, at: row.at };
      }
      cache.history.push(row);
      trimPaths();
      flush();
      return row;
    },
    /** 이미 들어간 행을 제자리에서 고친 뒤 저장할 때 쓴다(같은 시도의 랩 갱신). */
    touch() { return flush(); },
    setNote(snapshotId, text) {
      if (!snapshotId) return false;
      cache.notes[snapshotId] = String(text).slice(0, 100);
      return flush();
    },

    /** RC카 속도. 브라우저에만 남는다 — 기록이 아니라 화면 설정이다. */
    readSpeed(fallback) {
      const v = Number(cache.speed);
      return Number.isFinite(v) && v > 0 ? v : fallback;
    },
    writeSpeed(v) { cache.speed = v | 0; return flush(); },

    /** 사용법 팝업을 다시 열지 않기로 했는가. 브라우저에만 남는다. */
    howtoSkipped() { return !!cache.howtoSkipped; },
    setHowtoSkipped(on) { cache.howtoSkipped = !!on; return flush(); },
  };
}

/** 허브가 쓰는 읽기 전용 요약. 비교 가능한 기록만 대표 기록으로 삼는다. */
export function readSummary(kitId, challengeId, { engineVersion, challengeVersion, scoringVersion } = {}) {
  const empty = { attempts: 0, laps: 0, bestTicks: null, completed: false, legacyOnly: false };
  try {
    const raw = window.localStorage.getItem(storageKey(kitId, challengeId));
    if (!raw) return empty;
    const data = migrate(JSON.parse(raw));
    const finished = data.history.filter((r) => !r.ended && typeof r.ticks === 'number');
    const comparable = engineVersion === undefined
      ? finished
      : finished.filter((r) => isComparable(r, engineVersion, challengeVersion, scoringVersion));
    return {
      attempts: Number(data.attempt) || 0,
      laps: comparable.length,
      bestTicks: comparable.length ? Math.min(...comparable.map((r) => r.ticks)) : null,
      completed: comparable.length > 0,
      legacyOnly: comparable.length === 0 && finished.length > 0,
    };
  } catch (_) {
    return empty;
  }
}
