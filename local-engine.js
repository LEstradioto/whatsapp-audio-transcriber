/* global transformers */
const { pipeline, env, read_audio } = window.transformers;

env.allowRemoteModels = true;
env.allowLocalModels = true;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('vendor/transformers/');
// Offscreen pages are not crossOriginIsolated; force single-threaded WASM.
env.backends.onnx.wasm.numThreads = 1;

const pipelines = new Map();
const SAMPLE_RATE = 16000;

async function getPipeline(model, progressCallback) {
  if (pipelines.has(model)) return pipelines.get(model);
  const asr = await pipeline('automatic-speech-recognition', model, {
    progress_callback: progressCallback || null
  });
  pipelines.set(model, asr);
  return asr;
}

function base64ToBlob(base64, mimeType) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'audio/webm' });
}

async function decodeAudio(base64, mimeType) {
  const blob = base64ToBlob(base64, mimeType);
  const url = URL.createObjectURL(blob);
  try {
    return await read_audio(url, SAMPLE_RATE);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function notifyProgress(model, payload) {
  chrome.runtime.sendMessage({
    type: 'LOCAL_PROGRESS',
    model,
    payload
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message._target !== 'offscreen') return;

  if (message.type === 'OFFSCREEN_PING') {
    sendResponse({ success: true, ready: true });
    return;
  }

  if (message.type === 'LOCAL_PRELOAD') {
    (async () => {
      try {
        await getPipeline(message.model, (payload) => notifyProgress(message.model, payload));
        sendResponse({ success: true });
      } catch (error) {
        const msg = (error && error.message) ? error.message : 'Local preload failed';
        sendResponse({ success: false, error: msg });
      }
    })();
    return true;
  }

  if (message.type === 'LOCAL_TRANSCRIBE') {
    (async () => {
      try {
        const asr = await getPipeline(message.model, (payload) => notifyProgress(message.model, payload));
        const audio = await decodeAudio(message.audioData, message.mimeType);
        const result = await asr(audio);
        const text = (result && result.text) || (typeof result === 'string' ? result : '');
        sendResponse({ success: true, data: { text } });
      } catch (error) {
        const msg = (error && error.message) ? error.message : 'Local transcription failed';
        let hint = '';
        if (/offset is out of bounds/i.test(msg)) {
          hint = ' (Try a smaller local model like Xenova/whisper-small.)';
        } else if (/unsupported model type/i.test(msg)) {
          hint = ' (Model not supported by the local runtime. Try Xenova/whisper-small.)';
        }
        sendResponse({ success: false, error: msg + hint });
      }
    })();
    return true;
  }
});
