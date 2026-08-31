/* VISION AI 결과물 이미지 보관소 (IndexedDB)
   - 대용량 base64 이미지의 localStorage 저장소 초과 및 파싱 지연 방지 */
(function () {
  const DB = "vision_media",
    STORE = "images",
    VER = 1;
  /* IndexedDB 미지원 환경용 localStorage Fallback */
  const LSKEY = (id) => "vision_img:" + id;

  let dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res) => {
      let idb = null;
      try {
        idb = window.indexedDB;
      } catch (e) {}
      if (!idb) return res(null);
      let req;
      try {
        req = idb.open(DB, VER);
      } catch (e) {
        return res(null);
      }
      req.onupgradeneeded = () => {
        try {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
        } catch (e) {}
      };
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
      /* DB 오픈 타임아웃 처리 */
      setTimeout(() => res(null), 3000);
    });
    return dbPromise;
  }
  function transaction(mode, fn) {
    return open()
      .then((db) => {
        if (!db) return null;
        return new Promise((res) => {
          let t;
          try {
            t = db.transaction(STORE, mode);
          } catch (e) {
            return res(null);
          }
          const store = t.objectStore(STORE);
          let out = null;
          try {
            const request = fn(store);
            if (request)
              request.onsuccess = () => {
                out = request.result;
              };
          } catch (e) {}
          t.oncomplete = () => res({ v: out });
          t.onerror = () => res(null);
          t.onabort = () => res(null);
        });
      })
      .catch(() => null);
  }

  const ImageStore = {
    /* 결과물 식별자 생성 (동일 결과물 재생성 시 덮어쓰기 적용) */
    id(scope, kind) {
      return scope + "/" + kind;
    },

    async put(id, dataURL) {
      if (!id || !dataURL) return false;
      const request = await transaction("readwrite", (store) =>
        store.put(dataURL, id),
      );
      if (request) return true;
      try {
        localStorage.setItem(LSKEY(id), dataURL);
        return true;
      } catch (e) {
        return false;
      }
    },
    async get(id) {
      if (!id) return null;
      const request = await transaction("readonly", (store) => store.get(id));
      if (request && request.v) return request.v;
      try {
        return localStorage.getItem(LSKEY(id));
      } catch (e) {
        return null;
      }
    },
    async del(id) {
      if (!id) return;
      await transaction("readwrite", (store) => store.delete(id));
      try {
        localStorage.removeItem(LSKEY(id));
      } catch (e) {}
    },
  };
  window.ImageStore = ImageStore;
})();
