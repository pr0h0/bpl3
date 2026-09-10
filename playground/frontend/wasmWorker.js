/* The worker can be terminated even while a Wasm export loops forever. */
importScripts("wasmHostAdapter.js");
self.onmessage = async ({ data }) => {
  try {
    const result = await self.BplWasmHostAdapter.runHostedWasmInBrowser(
      data.wasmBase64,
      data.args,
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
