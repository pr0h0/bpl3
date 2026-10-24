/* Versioned, best-effort local drafts. Storage denial must never block editing. */
(function (root) {
  const key = "bpl-playground-draft-v1";
  root.BplDraftStore = {
    load(storage) {
      try {
        const value = JSON.parse(storage.getItem(key));
        return value &&
          value.version === 1 &&
          [value.code, value.stdin, value.args].every(
            (x) => typeof x === "string",
          )
          ? value
          : null;
      } catch {
        return null;
      }
    },
    save(storage, draft) {
      try {
        storage.setItem(key, JSON.stringify({ ...draft, version: 1 }));
        return true;
      } catch {
        return false;
      }
    },
    clear(storage) {
      try {
        storage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };
})(globalThis);
