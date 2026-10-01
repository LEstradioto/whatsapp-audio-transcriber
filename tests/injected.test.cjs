const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const injectedScript = readFileSync(join(__dirname, '..', 'injected.js'), 'utf8');
const audioBytes = Uint8Array.from([79, 103, 103, 83, 0, 1, 2, 3]);

async function transcribe({ method, type = 'ptt', mimetype, mediaData = {}, refreshedMediaData }) {
    const elements = [];
    function element() {
        const node = {
            style: {}, dataset: {}, listeners: {}, children: [], className: '',
            classList: { contains: name => node.className.split(' ').includes(name) },
            appendChild(child) { this.children.push(child); child.parentNode = this; },
            insertBefore(child) { this.appendChild(child); },
            addEventListener(event, handler) { this.listeners[event] = handler; },
            querySelector() { return null; },
            getBoundingClientRect() { return { height: 60 }; }
        };
        elements.push(node);
        return node;
    }

    const parent = element();
    const row = element();
    parent.appendChild(row);
    parent.lastElementChild = row;
    const messageElement = element();
    messageElement.getAttribute = () => 'message-id';
    messageElement.closest = () => row;
    const slider = element();
    slider.closest = () => messageElement;

    const message = {
        id: { id: 'message-id' }, type, mimetype, directPath: '/audio',
        mediaData: mediaData && { directPath: '/audio', mediaStage: 'RESOLVED', ...mediaData }
    };
    if (refreshedMediaData) {
        message.downloadMedia = async () => {
            message.mediaData = { directPath: '/audio', mediaStage: 'RESOLVED', ...refreshedMediaData };
        };
    }

    const downloads = [];
    const downloadManager = {
        async [method](options) {
            downloads.push(options);
            const mimeType = options.mimetype || 'application/octet-stream';
            if (mimeType === 'application/octet-stream') {
                const error = new Error(`Unexpected mimetype ${mimeType} for media type ${options.type}`);
                error.name = 'InvalidMediaFileType';
                throw error;
            }
            return audioBytes;
        }
    };
    const collections = {
        Msg: { get: () => message },
        Chat: { getModelsArray: () => [{ active: true, msgs: { models: [message] } }] }
    };
    const posted = [];
    const errors = [];
    const timers = new Map();
    const modules = {
        WAWebCollections: collections,
        WAWebDownloadManager: { downloadManager },
        WALinkify: {}
    };
    let readPromise;
    let blobType;
    await vm.runInNewContext(injectedScript, {
        window: {
            require: name => modules[name],
            addEventListener() {},
            postMessage: payload => posted.push(payload)
        },
        document: {
            body: parent,
            createElement: element,
            querySelector: selector => selector === '#pane-side'
                ? parent
                : elements.find(node => node.className === 'transcribe-btn') || null,
            querySelectorAll: () => [slider]
        },
        console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
        AbortController,
        Blob,
        FileReader: class {
            readAsDataURL(blob) {
                blobType = blob.type;
                readPromise = blob.arrayBuffer().then(data => {
                    this.result = `data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;
                    return this.onload();
                });
            }
        },
        setTimeout(callback) { const id = Symbol(); timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id),
        requestAnimationFrame: callback => callback(),
        MutationObserver: class { observe() {} }
    });

    const button = elements.find(node => node.className === 'transcribe-btn');
    assert.ok(button, 'the audio message has a transcription button');
    await button.listeners.click();
    await readPromise;
    return { downloads, posted, errors, blobType, button };
}

const cases = [
    { name: 'voice message MIME on the message model', mimetype: 'audio/ogg; codecs=opus', expected: 'audio/ogg; codecs=opus' },
    { name: 'MIME on mediaData', mediaData: { mimetype: 'audio/ogg' }, expected: 'audio/ogg' },
    { name: 'voice message with missing MIME', expected: 'audio/ogg; codecs=opus' },
    { name: 'generic mediaData MIME with a declared audio MIME', mimetype: 'audio/ogg', mediaData: { mimetype: 'application/octet-stream' }, expected: 'audio/ogg' },
    { name: 'voice message with only generic MIME values', mimetype: 'application/octet-stream', mediaData: { mimetype: ' Application/Octet-Stream ' }, expected: 'audio/ogg; codecs=opus' },
    { name: 'MP3 attachment', type: 'audio', mimetype: 'audio/mpeg', expected: 'audio/mpeg' },
    { name: 'WebM attachment fallback', type: 'audio', expected: 'audio/webm' }
];

function assertTranscription(result, expected, type = 'ptt') {
    assert.deepEqual(result.errors, [], 'audio download must not fail with InvalidMediaFileType');
    assert.equal(result.downloads.length, 1);
    assert.equal(result.downloads[0].mimetype, expected);
    assert.equal(result.downloads[0].type, type);
    assert.equal(result.blobType, expected);
    const request = result.posted.find(payload => payload.type === 'TRANSCRIBE_AUDIO');
    assert.ok(request, 'downloaded audio reaches the content script');
    assert.equal(request.mimeType, expected);
    assert.equal(request.messageId, 'message-id');
    assert.equal(request.audioData, Buffer.from(audioBytes).toString('base64'));
}

for (const method of ['downloadAndMaybeDecrypt', 'downloadAndDecrypt']) {
    for (const scenario of cases) {
        test(`${method}: ${scenario.name}`, async () => {
            assertTranscription(await transcribe({ method, ...scenario }), scenario.expected, scenario.type);
        });
    }
}

test('uses MIME metadata refreshed by WhatsApp before downloading', async () => {
    const result = await transcribe({
        method: 'downloadAndMaybeDecrypt',
        mediaData: { mediaStage: 'INIT', mimetype: 'application/octet-stream' },
        refreshedMediaData: { mimetype: 'audio/ogg; codecs=opus' }
    });
    assertTranscription(result, 'audio/ogg; codecs=opus');
});

test('legacy download works with MIME only on the message and no mediaData', async () => {
    const result = await transcribe({ method: 'downloadAndDecrypt', mediaData: null, mimetype: 'audio/ogg' });
    assertTranscription(result, 'audio/ogg');
});
