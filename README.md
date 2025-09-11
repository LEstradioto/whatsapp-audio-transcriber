![Video demonstration](./showcase.gif)

# WhatsApp Audio Transcription Chrome Extension Using GROQ API

A Chrome extension that adds transcription buttons to WhatsApp Web audio messages using the GROQ API.

Why Groq?
- Fast, basically free with their free tier, and the Whisper (turbo) model is really good.

## How It Works

- After each audio message in WhatsApp Web, a "Transcribe" button appears. Click it to instantly transcribe the audio and display the text directly below the message.
- Transcriptions are stored in localStorage for up to the latest 3 days, allowing reuse without additional API calls.
- The Whisper model outperforms Meta's native transcriber, delivering outstanding transcription quality.

⚠️ **Important Notice**

This extension is not officially associated with WhatsApp or Meta. Please be aware that:

- Using unofficial modifications to WhatsApp Web may violate WhatsApp's Terms of Service
- Audio data from messages is sent to GROQ's API for transcription
- Its recommended only using this extension for personal, non-sensitive communications

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner (if needed)
4. Click "Load unpacked" and select the directory containing these files
5. Add your Groq API Key at the Extension Settings

## Technical Details

The extension works by:

1. Injecting custom UI elements into WhatsApp Web
2. Using WhatsApp's internal APIs to access audio data (thanks to [pedroslopez/whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js))
3. Converting audio to the required format
4. Sending to GROQ's Whisper API for transcription
5. Displaying results in the WhatsApp interface

## Troubleshooting

Q: Im getting an error (Error - Try again)

- R: Ensure you setup the API Key correctly. Open Extension Settings and add your own Groq API Key, select the model and save.

## TODO
- Add more providers (openai, openroute, ollama, etc...)