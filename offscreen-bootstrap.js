import * as transformers from './vendor/transformers/transformers.min.js';

// Expose as a global for the existing local-engine implementation.
window.transformers = transformers;

// Load the local engine after the global is ready.
import('./local-engine.js');
