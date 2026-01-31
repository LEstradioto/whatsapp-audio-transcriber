![Video demonstration](./showcase.gif)

# WhatsApp Audio Transcription Chrome Extension

A Chrome extension that adds transcription buttons to WhatsApp Web audio messages. Supports Groq, OpenAI, and an experimental local (in-browser) mode powered by Transformers.js + ONNX Runtime Web.

## Highlights

- Adds a **Transcribe** button after each audio message
- Works for **incoming and outgoing** audio
- Optional **Local (browser)** mode keeps audio on-device
- Transcriptions are cached in `chrome.storage.local` for up to 3 days

## Important Notice

This extension is not officially associated with WhatsApp or Meta. Please be aware that:

- Using unofficial modifications to WhatsApp Web may violate WhatsApp's Terms of Service
- Audio data from messages is sent to the selected provider (Groq/OpenAI) unless local mode is enabled
- It is recommended to use this extension for personal, non-sensitive communications

## Project Status (Jan 31, 2026)

- Tested on macOS with Google Chrome using the **Groq** provider
- Local (browser) mode is **experimental** but functional for small models
- Large local models may fail due to browser memory/CPU limits
- This is a **free, non-commercial** project with no plans to monetize

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked** and select this folder
5. Open the extension popup and configure a provider + API key

## Providers, Costs, and Keys

Costs are approximate and can change—always verify on the provider’s pricing page.

### Groq

- API key: create at `https://console.groq.com/keys`
- Endpoint: `https://api.groq.com/openai/v1/audio/transcriptions`
- Approx cost (as of Jan 2026):
  - `whisper-large-v3-turbo`: ~$0.00067 / minute
  - `whisper-large-v3`: ~$0.00185 / minute
  - `distil-whisper-large-v3`: ~$0.00033 / minute
- Groq bills a minimum of ~10 seconds per request

### OpenAI

- API key: create at `https://platform.openai.com/api-keys`
- Endpoint: `https://api.openai.com/v1/audio/transcriptions`
- Approx cost (as of Jan 2026):
  - `gpt-4o-mini-transcribe`: $0.003 / minute
  - `gpt-4o-transcribe`: $0.006 / minute
  - `whisper-1`: $0.006 / minute

### Local (browser, experimental)

Local transcription runs **entirely in the browser** (no server). The extension uses Transformers.js + ONNX Runtime Web (WASM) and **downloads models on demand** from Hugging Face when you click **Download model** in the popup.

Why this is experimental:

- Model files are large (hundreds of MB to several GB)
- Performance depends heavily on your device
- Some large models can fail due to memory limits

**If you want privacy**, choose **tiny** or **base** models. They run faster and are less likely to fail, at the cost of accuracy.

Usage:

1. Select **Local (browser, experimental)** in the popup
2. Choose a model and click **Download model** (first time only)
3. Transcribe audio as usual

Notes:

- Chrome Web Store disallows remote code execution, so the JS/WASM runtime must be bundled. Model downloads are treated as data.
- Models are fetched from Hugging Face and cached in the browser.
- If a large model fails, try a smaller one (e.g., `Xenova/whisper-small`).

#### Building the vendor files (required for local mode)

Local mode **only works** when the runtime files exist under `vendor/transformers/`. This repo **does not commit** those files to Git to keep it lean. You must build them locally:

```bash
./scripts/build-vendor.sh
```

Manual steps (if you prefer):

1. Download the Transformers.js bundle (v3.8.1):
   - `npm pack @huggingface/transformers@3.8.1`
   - Extract the tarball and copy `dist/transformers.min.js` to `vendor/transformers/transformers.min.js`
2. Download the ONNX Runtime Web bundle (v1.22.0):
   - `npm pack onnxruntime-web@1.22.0`
   - Extract the tarball and copy:
     - `dist/ort.bundle.min.mjs` -> `vendor/transformers/ort.bundle.min.mjs`
     - `dist/ort-wasm-simd-threaded.jsep.mjs` -> `vendor/transformers/ort-wasm-simd-threaded.jsep.mjs`
     - `dist/ort-wasm-simd-threaded.jsep.wasm` -> `vendor/transformers/ort-wasm-simd-threaded.jsep.wasm`
3. Ensure `vendor/transformers/LICENSE` exists (Apache-2.0 for Transformers.js)

If these files are missing, local mode will fail to initialize.

## Security & Privacy Notes

- Remote providers (Groq/OpenAI) receive the audio for transcription
- Local mode keeps audio on your device; only model files are downloaded
- API keys are stored in `chrome.storage.local`
- The extension only requests the host permissions listed in `manifest.json`

## How It Works (High Level)

1. Injects custom UI elements into WhatsApp Web
2. Uses WhatsApp’s internal APIs to access audio data
3. Converts audio to the required format
4. Sends to the selected provider (or runs locally)
5. Renders the transcription below the message

## Troubleshooting

**Q: I'm getting “Error - Try again”.**

- Ensure your API key is set for the selected provider
- Save settings, reload the WhatsApp Web tab, and try again

**Q: Local mode fails on large models.**

- Use `Xenova/whisper-tiny`, `Xenova/whisper-base`, or `Xenova/whisper-small`
- Large models often exceed browser memory limits

## Licensing

This project is MIT licensed (`LICENSE`). Bundled third-party libraries include:

- **Transformers.js** (Apache-2.0) — see `vendor/transformers/LICENSE`
- **onnxruntime-web** (MIT)

Apache-2.0 and MIT are compatible with this project’s MIT license.

## Chrome Web Store Publishing (Optional)

1. Update `manifest.json` version
2. Zip the extension folder (no `node_modules`, no build artifacts)
3. Upload to the Chrome Web Store developer dashboard
4. Each update requires a new version number and re-upload

## TODO (Ideas)

- Add more OpenAI-compatible endpoints (local servers)
