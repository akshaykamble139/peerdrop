import { sha256 } from '@noble/hashes/sha2';

let hasher = null;

self.onmessage = async (event) => {
    const { type, payload } = event.data;

    switch (type) {
        case 'start':
            hasher = sha256.create();
            self.postMessage({ type: 'ready' });
            break;
        case 'update':
            try {
                hasher.update(new Uint8Array(payload));
                self.postMessage({ type: 'chunkProcessed' });
            } catch (e) {
                self.postMessage({ type: 'error', payload: e.message });
            }
            break;
        case 'finalize':
            const hashBytes = hasher.digest();
            const hashHex = Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            self.postMessage({ type: 'hashResult', payload: hashHex });
            console.log("chunk hash is finalize by worker", hashHex)
            hasher = null;
            break;
    }
};