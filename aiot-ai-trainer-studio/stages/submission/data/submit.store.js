/* VISION AI 결과물 미션함 Data Layer */
(function() {
  const KEY = "vision_submissions",
    NAMEKEY = "vision_student_name",
    LKEY = "vision_locker";
  /* 제출·세션 식별자 (충돌 확률이 낮으면 되는 용도) */
  const genId = () => "s" + Date.now() + "_" + Math.floor(Math.random() * 1e4);
  /* 학생 이름 보관 (UI 가 localStorage 를 직접 만지지 않게 한다) */
  const studentName = () => {
    try {
      return localStorage.getItem(NAMEKEY) || "";
    } catch (e) {
      return "";
    }
  };
  const setStudentName = (v) => {
    try {
      localStorage.setItem(NAMEKEY, v);
    } catch (e) {}
  };
  /* 잦은 파싱 방지용 원문 캐시 처리 */
  let subRaw = null,
    subCache = null;
  const load = () => {
    let raw;
    try {
      raw = localStorage.getItem(KEY) || "[]";
    } catch (e) {
      return subCache || [];
    }
    if (raw === subRaw && subCache) return subCache;
    try {
      subCache = JSON.parse(raw) || [];
    } catch (e) {
      subCache = [];
    }
    subRaw = raw;
    return subCache;
  };
  const saveAll = (l) => {
    const raw = JSON.stringify(l);
    localStorage.setItem(KEY, raw);
    subRaw = raw;
    subCache = l;
  };
  function missionKey() {
    try {
      return sessionStorage.getItem("vision_imagelab_mission") || "";
    } catch (e) {
      return "";
    }
  }
  /* 보관함 관리 (중복 누적 금지) */
  /* 보관함 파싱 캐싱 처리 */
  let lkRaw = null,
    lkCache = null;
  const lkAll = () => {
    let raw;
    try {
      raw = localStorage.getItem(LKEY) || "{}";
    } catch (e) {
      return lkCache || {};
    }
    if (raw === lkRaw && lkCache) return lkCache;
    try {
      lkCache = JSON.parse(raw) || {};
    } catch (e) {
      lkCache = {};
    }
    lkRaw = raw;
    return lkCache;
  };
  const lkPut = (o) => {
    try {
      const raw = JSON.stringify(o);
      localStorage.setItem(LKEY, raw);
      lkRaw = raw;
      lkCache = o;
      return true;
    } catch (e) {
      lkRaw = null;
      lkCache = null;
      VisionDialog.alert({
        danger: true,
        title: "미션함이 꽉 찼어요",
        body: "먼저 만든 결과물을 제출하면 자리가 생겨요.",
      });
      return false;
    }
  };


  const originName = (...args) => window.SubmitCore.originName(...args);
  const itemKey = (...args) => window.SubmitCore.itemKey(...args);
  const originKey = (...args) => window.SubmitCore.originKey(...args);
  const shrink = (...args) => window.SubmitCore.shrink(...args);
  const toPNG = (...args) => window.SubmitCore.toPNG(...args);
  const syncAll = (...args) => window.SubmitCore.syncAll && window.SubmitCore.syncAll(...args);

  /* 현재 탭 세션 ID 관리 (과거 제출물 오작동 방지) */
  const SID = (() => {
    try {
      let v = sessionStorage.getItem("vision_sid");
      if (!v) {
        v = genId();
        sessionStorage.setItem("vision_sid", v);
      }
      return v;
    } catch (e) {
      return "s0";
    }
  })();

  /* 미션함 관리 (이미지는 IndexedDB 보관, localStorage에는 imgId만 보관) */
  const BAG = "bag";
  const bagOf = () => lkAll()[BAG] || {};
  const Locker = {
    async add(kind, o, track) {
      const key = itemKey(kind, track),
        id = ImageStore.id(BAG, key);
      const img = await shrink((o && o.img) || null, 1400);
      if (img && !(await ImageStore.put(id, img))) {
        VisionDialog.alert({
          danger: true,
          title: "결과물 그림을 담지 못했어요",
          body: "저장 공간이 부족할 수 있어요.",
        });
        return false;
      }
      const all = lkAll();
      all[BAG] = all[BAG] || {};
      /* 종류 및 출처 기준 구분 속성 */
      all[BAG][key] = {
        key: key,
        kind: kind,
        track: track || SubmitCore.trackKey(),
        title: (o && o.title) || kind,
        from: originName(track),
        imgId: img ? id : null,
        meta: (o && o.meta) || null,
        at: new Date().toISOString(),
        sid: SID,
      };
      if (!lkPut(all)) return false;
      syncAll();
      return true;
    },
    /* 이미지 필요 시 조회 */
    async image(key) {
      const it = Locker.get(key);
      if (!it) return null;
      return it.imgId ? await ImageStore.get(it.imgId) : it.img || null;
    },
    /* 오래된 항목 상단 배치 정렬 (트랙 필터 지원) */
    list(track) {
      const m = bagOf();
      let items = Object.keys(m)
        .map((k) => m[k])
        .filter(Boolean);
      if (track) {
        items = items.filter((it) => {
          const tKey = (it.key || "").split("@")[1];
          const itTrack = it.track || (tKey === "audio" || tKey === "pose" ? tKey : "image");
          return itTrack === track;
        });
      }
      return items.sort((a, b) =>
        (a.at || "") < (b.at || "")
          ? -1
          : (a.at || "") > (b.at || "")
            ? 1
            : 0,
      );
    },
    get(key) {
      return bagOf()[key] || null;
    },
    remove(key) {
      const all = lkAll();
      if (all[BAG]) {
        const it = all[BAG][key];
        delete all[BAG][key];
        lkPut(all);
        if (it && it.imgId) ImageStore.del(it.imgId);
        syncAll();
      }
    },
    /* 제출 완료 후 목록 비우기 (특정 트랙만 비우기 지원)
       remove() 와 달리 ImageStore 는 건드리지 않는다 — 일부러 그렇다.
       clear() 는 제출 직후에 불리는데, 그 제출 레코드가 items[].imgId 로
       같은 그림을 가리키고 있어 여기서 지우면 참조가 끊긴다.
       키가 결정적(bag/{kind}@{originKey})이라 남는 양은 종류4 × 트랙3 = 12개가 상한이다. */
    clear(track) {
      const all = lkAll();
      if (!all[BAG]) return;
      if (!track) {
        delete all[BAG];
      } else {
        Object.keys(all[BAG]).forEach((k) => {
          const it = all[BAG][k];
          if (!it) return;
          const tKey = (k || "").split("@")[1];
          const itTrack = it.track || (tKey === "audio" || tKey === "pose" ? tKey : "image");
          if (itTrack === track) {
            delete all[BAG][k];
          }
        });
      }
      lkPut(all);
      syncAll();
    },
    count(track) {
      return Locker.list(track).length;
    },
  };
  window.Locker = Locker;

  window.SubmitStore = { KEY, NAMEKEY, LKEY, load, saveAll, missionKey, lkAll, lkPut, Locker, SID, genId, studentName, setStudentName };
})();
