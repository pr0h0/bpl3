/* Versioned, best-effort local drafts. Storage denial must never block editing. */
(function (root) {
  const key = "bpl-playground-draft-v1";
  root.BplDraftStore = {
    /** Return a valid versioned draft, or null for unavailable/corrupt storage. */
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
    /** Persist a draft without letting storage denial interrupt editing. */
    save(storage, draft) {
      try {
        storage.setItem(key, JSON.stringify({ ...draft, version: 1 }));
        return true;
      } catch {
        return false;
      }
    },
    /** Report whether removal succeeded so the UI cannot claim a false reset. */
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
