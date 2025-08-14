import { useRef, useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import { toast } from 'react-toastify';
import HasherWorker from '../workers/hasher.worker.js?worker';

export function usePeerDropLogic() {
    const socketRef = useRef(null);
    const [roomId, setRoomId] = useState(null);
    const [username, setUsername] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [activePeers, setActivePeers] = useState([]);
    const peersInitiatedConnectionWithRef = useRef([]);

    const peerConnectionsRef = useRef({});
    const iceCandidateBufferRef = useRef({});
    const dataChannelsRef = useRef({});
    const fileBufferRef = useRef({});

    const [receivedFiles, setReceivedFiles] = useState([]);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [showSuccessCheck, setShowSuccessCheck] = useState(false);
    const [receivingFileName, setReceivingFileName] = useState('');

    const CHUNK_SIZE = 16 * 1024;
    const NUM_CHANNELS = 6;
    const MAX_MEMORY_CHUNKS = 50;
    const CHUNK_WINDOW_SIZE = 10;
    const HASH_CHUNK_SIZE = 100 * 1024 * 1024;
    const UI_UPDATE_INTERVAL = 200;
    const FILE_SIZE_THRESHOLD = 100 * 1024 * 1024;
    const CHUNK_INDEX_PAD = 10;
    const INDEXEDDB_BATCH_SIZE = 1024 * 1024;
    const BATCH_TARGET_SIZE_IN_CHUNKS = Math.ceil(INDEXEDDB_BATCH_SIZE / CHUNK_SIZE);

    const lastTransferProgressUpdateTimeRef = useRef(0);
    const lastDownloadProgressUpdateTimeRef = useRef(0);

    const [selectedFile, setSelectedFile] = useState(null);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [sendingFileName, setSendingFileName] = useState('');
    const [sentFiles, setSentFiles] = useState([]);
    const [isProcessingFile, setIsProcessingFile] = useState(false);

    const pendingTransfersRef = useRef({});
    const [transferStatus, setTransferStatus] = useState({});

    const shouldAttemptReconnectRef = useRef(true);

    const receiverHashWorkersRef = useRef({});
    const receiverHashBuffersRef = useRef({});
    const indexedDBRef = useRef(null);
    const dbBatchBufferRef = useRef({});

    const initIndexedDB = useCallback(() => {
        if (indexedDBRef.current) return Promise.resolve(indexedDBRef.current);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('FileTransferDB', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('chunks')) {
                    db.createObjectStore('chunks', { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => {
                indexedDBRef.current = e.target.result;
                resolve(indexedDBRef.current);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }, []);

    const writeBatchToIndexedDB = useCallback(async (fromSocketId, fileId, chunkIndex, chunkData, totalChunks) => {
        const batchKey = `${fromSocketId}-${fileId}`;
        if (!dbBatchBufferRef.current[batchKey]) {
            dbBatchBufferRef.current[batchKey] = {
                metadata: { fileId, totalChunks },
                pendingBatches: new Map(),
                totalFileChunks: totalChunks,
            };
        }

        const dbBatchBuffer = dbBatchBufferRef.current[batchKey];

        const batchIndex = Math.floor(chunkIndex / BATCH_TARGET_SIZE_IN_CHUNKS);
        const relativeChunkIndex = chunkIndex % BATCH_TARGET_SIZE_IN_CHUNKS;

        if (!dbBatchBuffer.pendingBatches.has(batchIndex)) {
            const expectedCount = (batchIndex * BATCH_TARGET_SIZE_IN_CHUNKS + BATCH_TARGET_SIZE_IN_CHUNKS > totalChunks)
                ? (totalChunks % BATCH_TARGET_SIZE_IN_CHUNKS) || BATCH_TARGET_SIZE_IN_CHUNKS
                : BATCH_TARGET_SIZE_IN_CHUNKS;

            dbBatchBuffer.pendingBatches.set(batchIndex, {
                chunks: new Array(expectedCount).fill(null),
                receivedCount: 0,
                expectedCount: expectedCount,
            });
        }

        const currentBatch = dbBatchBuffer.pendingBatches.get(batchIndex);
        if (currentBatch.chunks[relativeChunkIndex] === null) {
            currentBatch.chunks[relativeChunkIndex] = chunkData;
            currentBatch.receivedCount++;
        } else {
            console.warn(`Duplicate chunk ${chunkIndex} received for file ${fileId}.`);
        }

        if (currentBatch.receivedCount === currentBatch.expectedCount) {
            const db = await initIndexedDB();
            const concatenated = concatenateArrayBuffers(currentBatch.chunks.filter(c => c !== null));

            try {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('chunks', 'readwrite');
                    const store = tx.objectStore('chunks');
                    const paddedBatchIndex = String(batchIndex).padStart(CHUNK_INDEX_PAD, '0');
                    const key = `${fromSocketId}-${fileId}-${paddedBatchIndex}`;
                    const putReq = store.put({ key, data: concatenated, created: Date.now() });
                    putReq.onsuccess = resolve;
                    putReq.onerror = (e) => {
                        console.error('IndexedDB put error:', e.target.error);
                        reject(e.target.error);
                    };
                });
                dbBatchBuffer.pendingBatches.delete(batchIndex);
            } catch (error) {
                console.error(`Error writing batch ${batchIndex} to IndexedDB:`, error);
                throw error;
            }
        }
    }, [initIndexedDB]);

    const readChunksFromIndexedDB = useCallback(async (fromSocketId, fileId, onChunk) => {
        const db = await initIndexedDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chunks', 'readonly');
            const store = tx.objectStore('chunks');

            const startKey = `${fromSocketId}-${fileId}-` + '0'.repeat(CHUNK_INDEX_PAD);
            const endKey = `${fromSocketId}-${fileId}-` + '\uffff';
            const keyRange = IDBKeyRange.bound(startKey, endKey);

            const request = store.openCursor(keyRange);
            const results = onChunk ? null : [];

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const batchData = cursor.value && cursor.value.data;
                    if (batchData) {
                        if (onChunk) {
                            try { onChunk(batchData); } catch (err) { console.error('onChunk callback error', err); }
                        } else {
                            results.push(batchData);
                        }
                    }
                    cursor.continue();
                } else {
                    resolve(onChunk ? undefined : results);
                }
            };

            request.onerror = (e) => {
                console.error('Error reading batches from IndexedDB:', e.target.error);
                reject(e.target.error);
            };
        });
    }, [initIndexedDB]);

    const clearFileFromIndexedDB = useCallback(async (fromSocketId, fileId, totalChunks) => {
        const db = await initIndexedDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chunks', 'readwrite');
            const store = tx.objectStore('chunks');

            const totalBatches = Math.ceil(totalChunks / BATCH_TARGET_SIZE_IN_CHUNKS);

            if (totalBatches === 0 && totalChunks === 0) {
                resolve();
                return;
            }

            let clearedBatches = 0;
            const errors = [];

            for (let i = 0; i < totalBatches; i++) {
                const padded = String(i).padStart(CHUNK_INDEX_PAD, '0');
                const key = `${fromSocketId}-${fileId}-${padded}`;
                const deleteRequest = store.delete(key);

                deleteRequest.onsuccess = () => {
                    clearedBatches++;
                    if (clearedBatches === totalBatches) {
                        if (errors.length === 0) {
                            resolve();
                        } else {
                            reject(new Error(`Failed to clear some batches: ${errors.join('; ')}`));
                        }
                    }
                };
                deleteRequest.onerror = (e) => {
                    errors.push(`Batch ${i}: ${e.target.error.message}`);
                    clearedBatches++;
                    if (clearedBatches === totalBatches) {
                        reject(new Error(`Failed to clear some batches: ${errors.join('; ')}`));
                    }
                };
            }
        });
    }, [initIndexedDB]);

    const cleanupFileTransferState = useCallback(async (fromSocketId, fileId, reason = 'unknown') => {
        console.log(`Cleaning up file transfer state for file ${fileId} from peer ${fromSocketId}. Reason: ${reason}`);

        const dbBatchBufferKey = `${fromSocketId}-${fileId}`;
        const totalChunksForCleanup = fileBufferRef.current[fromSocketId]?.totalChunks ||
            dbBatchBufferRef.current[dbBatchBufferKey]?.metadata?.totalChunks || 0;
        
        if (fileBufferRef.current[fromSocketId]) {
            if (fileBufferRef.current[fromSocketId].reconstructedBlob) {
                URL.revokeObjectURL(fileBufferRef.current[fromSocketId].reconstructedBlob);
            }
            delete fileBufferRef.current[fromSocketId];
        }

        if (dbBatchBufferRef.current[dbBatchBufferKey]) {
            delete dbBatchBufferRef.current[dbBatchBufferKey];
        }

        if (receiverHashWorkersRef.current[fileId]) {
            try { receiverHashWorkersRef.current[fileId].terminate(); } catch (e) { console.warn('Error terminating hash worker:', e); }
            delete receiverHashWorkersRef.current[fileId];
        }
        if (receiverHashBuffersRef.current[fileId]) {
            delete receiverHashBuffersRef.current[fileId];
        }

        try {
            await clearFileFromIndexedDB(fromSocketId, fileId, totalChunksForCleanup);
        } catch (err) {
            console.warn(`Failed to clear IndexedDB for file ${fileId} from ${fromSocketId}:`, err);
        }

        setDownloadProgress(0);
        setReceivingFileName('');
        setShowSuccessCheck(false);
        setIsProcessingFile(false);
        setIsTransferring(false);
    }, [
        clearFileFromIndexedDB, setDownloadProgress, setReceivingFileName, setShowSuccessCheck, setIsProcessingFile, setIsTransferring, dbBatchBufferRef]);

    const calculateFileHash = useCallback((file) => {
        return new Promise((resolve, reject) => {
            const worker = new HasherWorker();
            const totalChunksToHash = Math.ceil(file.size / HASH_CHUNK_SIZE);
            let chunksSentToWorker = 0;
            let chunksProcessedByWorker = 0;
            let errored = false;
            let workerIsReady = false;
            let nextChunkIndex = 0;
            const pendingChunks = new Map();

            const trySendChunks = () => {
                while (pendingChunks.has(nextChunkIndex) && workerIsReady) {
                    const chunk = pendingChunks.get(nextChunkIndex);
                    pendingChunks.delete(nextChunkIndex);

                    worker.postMessage({ type: 'update', payload: chunk }, [chunk]);
                    chunksSentToWorker++;
                    nextChunkIndex++;
                }
                if (chunksProcessedByWorker === totalChunksToHash && chunksSentToWorker === totalChunksToHash && totalChunksToHash > 0) {
                    worker.postMessage({ type: 'finalize' });
                }
            };

            const onWorkerMessage = (event) => {
                const { type, payload } = event.data;
                if (type === 'ready') {
                    workerIsReady = true;
                    trySendChunks();
                } else if (type === 'hashResult') {
                    worker.removeEventListener('message', onWorkerMessage);
                    worker.terminate();
                    resolve(payload);
                } else if (type === 'error' && !errored) {
                    worker.removeEventListener('message', onWorkerMessage);
                    worker.terminate();
                    errored = true;
                    reject(new Error(payload || 'Worker reported an error during hashing.'));
                } else if (type === 'chunkProcessed' && !errored) {
                    chunksProcessedByWorker++;
                    trySendChunks();
                }
            };

            worker.addEventListener('message', onWorkerMessage);
            worker.postMessage({ type: 'start' });

            let offset = 0;
            let chunkIndex = 0;
            while (offset < file.size) {
                const slice = file.slice(offset, Math.min(offset + HASH_CHUNK_SIZE, file.size));
                const localIndex = chunkIndex;

                slice.arrayBuffer().then(buffer => {
                    pendingChunks.set(localIndex, buffer);
                    trySendChunks();
                }).catch(error => {
                    if (!errored) {
                        worker.postMessage({ type: 'error', payload: error.message });
                    }
                });
                offset += slice.size;
                chunkIndex++;
            }
        });
    }, []);


    const closeDataChannel = useCallback((socketId) => {
        const channels = dataChannelsRef.current[socketId];
        if (channels && Array.isArray(channels)) {
            channels.forEach(ch => {
                try { ch.close?.(); } catch (e) { }
            });
        } else if (channels) {
            try { channels.close?.(); } catch (e) { }
        }
        delete dataChannelsRef.current[socketId];
        console.log(`Closed data channels with ${socketId}`);
    }, []);

    const concatenateArrayBuffers = useCallback((buffers) => {
        let totalLength = 0;
        for (const buffer of buffers) {
            if (buffer) {
                totalLength += buffer.byteLength;
            }
        }
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const buffer of buffers) {
            if (buffer) {
                result.set(new Uint8Array(buffer), offset);
                offset += buffer.byteLength;
            }
        }
        return result.buffer;
    }, []);


    const handleIncomingMessage = useCallback(async (event, fromSocketId) => {
        const data = event.data;

        if (typeof data === 'string' && data.startsWith('metadata:')) {
            const metadata = JSON.parse(data.replace('metadata:', ''));
            const { fileId, totalChunks } = metadata;
            await initIndexedDB();

            fileBufferRef.current[fromSocketId] = {
                metadata,
                receivedChunks: 0,
                receivedSize: 0,
                totalChunks,
                allChunksReceived: false,
                senderHashReceived: metadata.hash !== undefined && metadata.hash !== null,
                memoryBuffer: new Map(),
                nextExpectedChunk: 0,
            };

            const totalChunksToHash = Math.ceil(metadata.size / HASH_CHUNK_SIZE);

            if (!receiverHashWorkersRef.current[fileId]) {
                const w = new HasherWorker();
                receiverHashWorkersRef.current[fileId] = w;
                receiverHashBuffersRef.current[fileId] = { accumulatedSize: 0, totalChunksToHash, chunksSentToWorker: 0, chunksProcessedByWorker: 0, hashChunkBuffers: new Map(), pendingHashChunks: new Map(), nextHashChunkToSend: 0 };

                w.postMessage({ type: 'start' });
                w.onmessage = (evt) => {
                    const { type, payload } = evt.data;
                    if (type === 'chunkProcessed') {
                        receiverHashBuffersRef.current[fileId].chunksProcessedByWorker++;
                        if (totalChunksToHash > 0 &&
                            receiverHashBuffersRef.current[fileId].chunksProcessedByWorker === receiverHashBuffersRef.current[fileId].totalChunksToHash &&
                            receiverHashBuffersRef.current[fileId].chunksSentToWorker === receiverHashBuffersRef.current[fileId].totalChunksToHash) {
                            w.postMessage({ type: 'finalize' });
                        }
                    } else if (type === 'hashResult') {
                        const fb = fileBufferRef.current[fromSocketId];
                        if (fb) fb.receiverHash = payload;
                    } else if (type === 'error') {
                        console.error('Hash worker error, restarting...', payload);
                        try { w.terminate(); } catch (e) { }
                        cleanupFileTransferState(fromSocketId, fileId, 'hashing_error');
                    }
                };
            }

            setDownloadProgress(0);
            setReceivingFileName(metadata.name);
            setShowSuccessCheck(false);

        } else if (typeof data === 'string' && data.startsWith('hash:')) {
            const { fileId, hash } = JSON.parse(data.replace('hash:', ''));
            const fileBuffer = fileBufferRef.current[fromSocketId];
            if (fileBuffer && fileBuffer.metadata.fileId === fileId) {
                fileBuffer.metadata.hash = hash;
                fileBuffer.senderHashReceived = true;
                checkAndFinalizeFile(fromSocketId);
            }
        } else if (typeof data === 'string' && data.startsWith('chunk-ack:')) {
            const ackData = JSON.parse(data.replace('chunk-ack:', ''));
            const { fileId, chunkIndex } = ackData;
            if (pendingTransfersRef.current[fileId]) {
                const transfer = pendingTransfersRef.current[fileId];
                transfer.ackedChunks.add(chunkIndex);
                while (transfer.lowestUnackedChunk < transfer.totalChunks && transfer.ackedChunks.has(transfer.lowestUnackedChunk)) {
                    transfer.lowestUnackedChunk++;
                }

                transfer.sendWindowOfChunks();

                const progress = parseFloat(((transfer.lowestUnackedChunk / transfer.totalChunks) * 100).toFixed(2));
                const now = Date.now();
                if (now - lastTransferProgressUpdateTimeRef.current > UI_UPDATE_INTERVAL || progress === 100) {
                    setTransferProgress(progress);
                    lastTransferProgressUpdateTimeRef.current = now;
                }
            }
        } else if (typeof data === 'string' && data.startsWith('file-received-confirmation:')) {
            const confirmationData = JSON.parse(data.replace('file-received-confirmation:', ''));
            const { fileId, fileName, isValid } = confirmationData;

            if (pendingTransfersRef.current[fileId]) {
                const transfer = pendingTransfersRef.current[fileId];
                if (isValid) {
                    transfer.confirmedPeers.add(fromSocketId);
                } else {
                    console.error(`File validation failed for peer ${fromSocketId}`);
                    toast.error(`File validation failed for peer ${fromSocketId}`);
                    transfer.remainingPeersCount--;
                    transfer.failedPeers.add(fromSocketId); 
                }

                const confirmedCount = transfer.confirmedPeers.size;
                const totalPeersForCompletion = transfer.remainingPeersCount;

                setTransferStatus(prev => ({
                    ...prev,
                    [fileId]: { confirmed: transfer.confirmedPeers.size, total: transfer.initialPeerCount }
                }));

                const totalProcessed = transfer.confirmedPeers.size + transfer.failedPeers.size;
                if (totalProcessed === transfer.initialPeerCount) {
                    if (confirmedCount > 0) {
                        setSentFiles((prev) => [...prev, {
                            name: fileName,
                            recipients: Array.from(transfer.confirmedPeers)
                        }]);

                        let successMessage = `File "${fileName}" sent successfully`;
                        if (confirmedCount === totalPeersForCompletion) {
                            successMessage += ` to all ${totalPeersForCompletion} peers!`;
                        } else {
                            successMessage += ` to ${confirmedCount} of ${totalPeersForCompletion} initial peers!`;
                        }
                        toast.success(successMessage);
                    } else {
                        toast.error(`File "${fileName}" transfer failed: All recipients disconnected or failed validation.`);
                    }

                    delete pendingTransfersRef.current[fileId];
                    setTransferStatus(prev => {
                        const newStatus = { ...prev };
                        delete newStatus[fileId];
                        return newStatus;
                    });

                    if (Object.keys(pendingTransfersRef.current).length === 0) {
                        setIsTransferring(false);
                        setSelectedFile(null);
                        setTimeout(() => setSendingFileName(''), 3000);
                    }
                }
            }
        } else if (data === 'end') {
            const fileBuffer = fileBufferRef.current[fromSocketId];
            if (!fileBuffer || !fileBuffer.metadata) {
                console.error('Error: Metadata is missing when processing the end message!');
                toast.error('File reception error: Metadata missing.');
                cleanupFileTransferState(fromSocketId, fileBuffer?.metadata?.fileId, 'metadata_missing');
                return;
            }

            const { fileId, totalChunks, type } = fileBuffer.metadata;

            try {
                const chunks = [];
                await readChunksFromIndexedDB(fromSocketId, fileId, (chunk) => {
                    chunks.push(chunk);
                });

                if (chunks.length === 0 && totalChunks > 0) {
                    console.error("No chunks retrieved from IndexedDB for non-empty file.");
                    toast.error("File reconstruction failed: No chunks retrieved from storage.");
                    cleanupFileTransferState(fromSocketId, fileId, 'no_indexeddb_chunks');
                    return;
                }
                const receivedFileBlob = new Blob(chunks, { type: type || 'application/octet-stream' });
                fileBuffer.allChunksReceived = true;
                fileBuffer.reconstructedBlob = receivedFileBlob;

                const waitForHash = (timeoutMs = 15000) => new Promise((resolve) => {
                    const start = Date.now();
                    const check = () => {
                        if (fileBuffer.receiverHash) return resolve(fileBuffer.receiverHash);
                        if (Date.now() - start > timeoutMs) {
                            console.warn(`Hash worker for file ${fileId} did not finalize in time.`);
                            return resolve(null);
                        }
                        setTimeout(check, 200);
                    };
                    check();
                });

                const receiverHash = await waitForHash(15000);
                if (!receiverHash) {
                    toast.error("File reception error: Hash calculation timed out or failed.");
                    cleanupFileTransferState(fromSocketId, fileId, 'hash_timeout');
                    return;
                }

                fileBuffer.receiverHash = receiverHash;
                checkAndFinalizeFile(fromSocketId);
            } catch (error) {
                console.error('Failed during end processing (IndexedDB read/blob creation):', error);
                toast.error('File reception error during final assembly from storage.');
                cleanupFileTransferState(fromSocketId, fileId, 'reconstruction_error');
                return;
            }
        } else if (data instanceof ArrayBuffer) {
            if (!fileBufferRef.current[fromSocketId]) return;
            const view = new DataView(data);
            const chunkIndex = view.getUint32(0, true);
            const chunkData = data.slice(4);

            const fileBuffer = fileBufferRef.current[fromSocketId];
            const fileId = fileBuffer.metadata.fileId;

            try {
                writeBatchToIndexedDB(fromSocketId, fileId, chunkIndex, chunkData, fileBuffer.metadata.totalChunks);
            } catch (err) {
                console.error('IndexedDB write failed', err);
                toast.error('Storage error: disk quota or IndexedDB failure.');
                cleanupFileTransferState(fromSocketId, fileId, 'indexeddb_write_error');
                return;
            }

            fileBuffer.receivedChunks++;
            fileBuffer.receivedSize += chunkData.byteLength;

            const memBuf = fileBuffer.memoryBuffer;
            memBuf.set(chunkIndex, chunkData);

            if (memBuf.size > MAX_MEMORY_CHUNKS) {
                const firstKey = memBuf.keys().next().value;
                memBuf.delete(firstKey);
            }

            const feedHashWorker = () => {
                const fileIdLocal = fileId;
                const worker = receiverHashWorkersRef.current[fileIdLocal];
                const hb = receiverHashBuffersRef.current[fileIdLocal];
                if (!worker || !hb) return;


                while (memBuf.has(fileBuffer.nextExpectedChunk)) {
                    let buf = memBuf.get(fileBuffer.nextExpectedChunk);
                    memBuf.delete(fileBuffer.nextExpectedChunk);

                    const currentChunkIndex = fileBuffer.nextExpectedChunk;
                    fileBuffer.nextExpectedChunk++;

                    let offset = 0;
                    while (offset < buf.byteLength) {
                        const currentFileBytePos = currentChunkIndex * CHUNK_SIZE + offset;
                        const hashChunkIndex = Math.floor(currentFileBytePos / HASH_CHUNK_SIZE);

                        if (!hb.hashChunkBuffers.has(hashChunkIndex)) {
                            hb.hashChunkBuffers.set(hashChunkIndex, { buffers: [], accumulatedSize: 0 });
                        }

                        const hashChunkData = hb.hashChunkBuffers.get(hashChunkIndex);
                        const posInHashChunk = currentFileBytePos % HASH_CHUNK_SIZE;
                        const bytesUntilBoundary = HASH_CHUNK_SIZE - posInHashChunk;
                        const take = Math.min(bytesUntilBoundary, buf.byteLength - offset);

                        hashChunkData.buffers.push(buf.slice(offset, offset + take));
                        hashChunkData.accumulatedSize += take;
                        offset += take;

                        if (hashChunkData.accumulatedSize === HASH_CHUNK_SIZE) {
                            const concatenated = concatenateArrayBuffers(hashChunkData.buffers);
                            hb.pendingHashChunks.set(hashChunkIndex, concatenated);
                            hb.hashChunkBuffers.delete(hashChunkIndex);

                            while (hb.pendingHashChunks.has(hb.nextHashChunkToSend)) {
                                const orderedChunk = hb.pendingHashChunks.get(hb.nextHashChunkToSend);
                                try {
                                    worker.postMessage({ type: 'update', payload: orderedChunk }, [orderedChunk]);
                                } catch (e) {
                                    worker.postMessage({ type: 'update', payload: orderedChunk });
                                }
                                hb.pendingHashChunks.delete(hb.nextHashChunkToSend);
                                hb.chunksSentToWorker++;
                                hb.nextHashChunkToSend++;
                            }
                        }
                    }
                }

                if (fileBuffer.nextExpectedChunk === fileBuffer.totalChunks) {
                    for (const [hashChunkIndex, hashChunkData] of hb.hashChunkBuffers.entries()) {
                        if (hashChunkData.accumulatedSize > 0) {
                            const concatenated = concatenateArrayBuffers(hashChunkData.buffers);
                            hb.pendingHashChunks.set(hashChunkIndex, concatenated);
                            hb.hashChunkBuffers.delete(hashChunkIndex);
                        }
                    }

                    while (hb.pendingHashChunks.has(hb.nextHashChunkToSend)) {
                        const orderedChunk = hb.pendingHashChunks.get(hb.nextHashChunkToSend);
                        try {
                            worker.postMessage({ type: 'update', payload: orderedChunk }, [orderedChunk]);
                        } catch (e) {
                            worker.postMessage({ type: 'update', payload: orderedChunk });
                        }
                        hb.pendingHashChunks.delete(hb.nextHashChunkToSend);
                        hb.chunksSentToWorker++;
                        hb.nextHashChunkToSend++;
                    }

                    if (hb.chunksProcessedByWorker === hb.totalChunksToHash && hb.chunksSentToWorker === hb.totalChunksToHash) {
                        worker.postMessage({ type: 'finalize' });
                    }
                }
            };

            feedHashWorker();

            const percent = parseFloat(((fileBuffer.receivedChunks / fileBuffer.metadata.totalChunks) * 100).toFixed(2));
            const now = Date.now();
            if (now - lastDownloadProgressUpdateTimeRef.current > UI_UPDATE_INTERVAL || percent === 100) {
                setDownloadProgress(percent);
                lastDownloadProgressUpdateTimeRef.current = now;
            }

            const channels = dataChannelsRef.current[fromSocketId];
            if (channels && channels[0] && channels[0].readyState === 'open') {
                const chunkAck = `chunk-ack:${JSON.stringify({
                    fileId: fileBuffer.metadata.fileId,
                    chunkIndex,
                    totalChunks: fileBuffer.metadata.totalChunks
                })}`;
                try { channels[0].send(chunkAck); } catch (e) { console.error('Error sending ack for chunk', e) }
            }
        }

    }, []);

    const checkAndFinalizeFile = useCallback((fromSocketId) => {
        const fileBuffer = fileBufferRef.current[fromSocketId];
        if (!fileBuffer) return;

        console.log("checkAndFinalizeFile called", fileBuffer);
        if (fileBuffer && fileBuffer.allChunksReceived && fileBuffer.senderHashReceived && fileBuffer.receiverHash) {
            const isValid = fileBuffer.receiverHash === fileBuffer.metadata.hash;
            if (isValid) {
                const blobPromise = (fileBuffer.reconstructedBlob) ? Promise.resolve(fileBuffer.reconstructedBlob) :
                    readChunksFromIndexedDB(fromSocketId, fileBuffer.metadata.fileId).then(chunks => new Blob(chunks));
                blobPromise.then((blob, error) => {
                    const url = URL.createObjectURL(blob);
                    const name = fileBuffer.metadata.name;
                    setReceivedFiles((files) => [...files, { name, url, sender: fromSocketId }]);
                    setShowSuccessCheck(true);
                    setTimeout(() => setShowSuccessCheck(false), 3000);
                    setTimeout(() => {
                        setDownloadProgress(0);
                        setReceivingFileName('');
                    }, 3000);
                    toast.success(`File "${name}" received successfully!`);
                    cleanupFileTransferState(fromSocketId, fileBuffer.metadata.fileId, 'successful_transfer');
                }).catch((error) => {
                    console.error('Reconstructed blob is missing for valid file.', error);
                    toast.error('File reconstruction failed: Blob missing.');
                    cleanupFileTransferState(fromSocketId, fileBuffer.metadata.fileId, 'blob_missing');
                    return;
                });
            } else {
                console.error('File integrity check failed');
                toast.error('File corruption detected. Transfer failed.');

                cleanupFileTransferState(fromSocketId, fileBuffer.metadata.fileId, 'integrity_check_failed');
            }

            const channels = dataChannelsRef.current[fromSocketId];
            if (channels && channels[0] && channels[0].readyState === 'open') {
                const confirmationMessage = `file-received-confirmation:${JSON.stringify({
                    fileId: fileBuffer.metadata.fileId,
                    fileName: fileBuffer.metadata.name,
                    isValid
                })}`;
                try { channels[0].send(confirmationMessage); } catch (e) { }
            }
        }
    }, [cleanupFileTransferState]);

    const setDataChannel = useCallback((socketId, dataChannel, channelIndex = null) => {
        if (!dataChannelsRef.current[socketId]) dataChannelsRef.current[socketId] = new Array(NUM_CHANNELS).fill(null);
        if (typeof channelIndex === 'number') {
            dataChannelsRef.current[socketId][channelIndex] = dataChannel;
        } else {
            const match = (dataChannel.label || '').match(/fileTransfer-(\d+)/);
            const idx = match ? Number(match[1]) : 0;
            dataChannelsRef.current[socketId][idx] = dataChannel;
        }

        dataChannel.binaryType = 'arraybuffer';
        dataChannel.onmessage = (event) => handleIncomingMessage(event, socketId);
        dataChannel.onopen = () => {
            setActivePeers(prevPeers => {
                const existingPeer = prevPeers.find(p => p.socketId === socketId);
                if (existingPeer) {
                    return prevPeers.map(peer =>
                        peer.socketId === socketId ? { ...peer, dataChannelOpen: true } : peer
                    );
                } else {
                    return [...prevPeers, { socketId, username: socketId.substring(0, 8), dataChannelOpen: true }];
                }
            });
        };
        dataChannel.onclose = () => {
            console.log(`Data channel ${dataChannel.label || ''} closed with ${socketId}`);
            const channels = dataChannelsRef.current[socketId];
            const anyOpen = channels && channels.some(ch => ch && ch.readyState === 'open');
            setActivePeers(prev => prev.map(peer => peer.socketId === socketId ? { ...peer, dataChannelOpen: anyOpen } : peer));
        };
        dataChannel.onerror = (error) => {
            console.error(`Data channel error (${dataChannel.label}) with ${socketId}:`, error);
            toast.error(`Data channel error with peer ${socketId}.`);
        };
    }, [handleIncomingMessage]);

    const handleICECandidate = useCallback((payload) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('signal', payload);
        } else {
            console.warn("Socket not connected, cannot emit ICE candidate signal.");
            toast.warn("Connection lost. Cannot send signaling data.");
        }
    }, []);

    const createPeerConnection = useCallback((remoteSocketId) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                handleICECandidate({
                    to: remoteSocketId,
                    from: socketRef.current.id,
                    data: {
                        type: "candidate",
                        candidate: event.candidate,
                    },
                });
            }
        };

        pc.ondatachannel = (event) => {
            const label = event.channel.label || '';
            const match = label.match(/fileTransfer-(\d+)/);
            const idx = match ? Number(match[1]) : 0;
            setDataChannel(remoteSocketId, event.channel, idx);
        };

        pc.onerror = (error) => {
            console.error(`Peer connection error with ${remoteSocketId}:`, error);
            toast.error(`Peer connection error with peer ${remoteSocketId}.`);
        };

        return pc;
    }, [handleICECandidate, setDataChannel]);

    const handleIncomingSignal = useCallback(async ({ from, data }) => {
        if (!peerConnectionsRef.current[from]) {
            peerConnectionsRef.current[from] = createPeerConnection(from);
            iceCandidateBufferRef.current[from] = [];
        }

        const pc = peerConnectionsRef.current[from];

        if (data.type === 'offer') {
            pc.ondatachannel = (event) => {
                setDataChannel(from, event.channel);
            };

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                handleICECandidate({
                    to: from,
                    from: socketRef.current.id,
                    data: pc.localDescription,
                });

                if (iceCandidateBufferRef.current[from]) {
                    for (const candidate of iceCandidateBufferRef.current[from]) {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    iceCandidateBufferRef.current[from] = [];
                }

            } catch (err) {
                console.error('Error handling offer:', err);
                toast.error(`WebRTC error with peer ${from}: Failed to process offer.`);
            }
        } else if (data.type === 'answer') {
            try {
                if (pc && !pc.currentRemoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data));

                    if (iceCandidateBufferRef.current[from]) {
                        for (const candidate of iceCandidateBufferRef.current[from]) {
                            await pc.addIceCandidate(new RTCIceCandidate(candidate));
                        }
                        iceCandidateBufferRef.current[from] = [];
                    }
                }
            } catch (err) {
                console.error('Error handling answer:', err);
                toast.error(`WebRTC error with peer ${from}: Failed to process answer.`);
            }
        } else if (data.candidate) {
            try {
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    if (!iceCandidateBufferRef.current[from]) {
                        iceCandidateBufferRef.current[from] = [];
                    }
                    iceCandidateBufferRef.current[from].push(data.candidate);
                }
            } catch (err) {
                console.error(`Failed to add ICE candidate from ${from}:`, err);
                toast.error(`WebRTC error with peer ${from}: Failed to add ICE candidate.`);
            }
        }
    }, [createPeerConnection, handleICECandidate, setDataChannel]);

    const createAndSendOffer = useCallback(async (peerId) => {
        const peerConnection = createPeerConnection(peerId);
        peerConnectionsRef.current[peerId] = peerConnection;

        const channels = new Array(NUM_CHANNELS).fill(null).map((_, i) => {
            const ch = peerConnection.createDataChannel(`fileTransfer-${i}`);
            setDataChannel(peerId, ch, i);
            return ch;
        });
        dataChannelsRef.current[peerId] = channels;

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            handleICECandidate({
                to: peerId,
                from: socketRef.current.id,
                data: offer,
            });
        } catch (err) {
            console.error("Error creating and sending offer:", err);
            toast.error(`WebRTC error: Failed to create or send offer to peer ${peerId}.`);
        }
    }, [createPeerConnection, handleICECandidate, setDataChannel]);

    const closePeerConnection = useCallback((socketId) => {
        if (peerConnectionsRef.current[socketId]) {
            peerConnectionsRef.current[socketId].close();
            delete peerConnectionsRef.current[socketId];
            console.log(`Closed peer connection with ${socketId}`);
        }
        closeDataChannel(socketId);
    }, [closeDataChannel]);

    const handleSendFile = useCallback(async (file) => {
        if (!file) {
            console.warn('No file selected');
            toast.warn('Please select a file to send.');
            return;
        }

        const activeChannelIds = Object.keys(dataChannelsRef.current).filter(
            (id) => dataChannelsRef.current[id] && dataChannelsRef.current[id].length > 0 && dataChannelsRef.current[id].filter(elem => elem.readyState === 'open').length > 0
        );

        if (activeChannelIds.length === 0) {
            console.warn('No active data channels to send file to.');
            toast.warn('No peers connected to send file to.');
            return;
        }

        const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const metadata = { name: file.name, size: file.size, fileId, totalChunks };

        let finalHash;

        const sendWindowOfChunks = () => {
            const transfer = pendingTransfersRef.current[fileId];
            if (!transfer) return;
            while (
                transfer.currentChunkToSend < transfer.totalChunks &&
                (transfer.currentChunkToSend - transfer.lowestUnackedChunk) < CHUNK_WINDOW_SIZE
            ) {
                sendChunkToChannels(transfer.currentChunkToSend);
                transfer.currentChunkToSend++;
            }
            if (transfer.lowestUnackedChunk === transfer.totalChunks && transfer.currentChunkToSend === transfer.totalChunks) {
                transfer.initialPeerIds.forEach(socketId => {
                    const dataChannels = dataChannelsRef.current[socketId].filter(elem => elem && elem.readyState === 'open');
                    const channel = dataChannels && dataChannels.length > 0 ? dataChannels[0] : null;
                    if (channel) {
                        channel.send('end');
                    }
                });
            }
        };

        const sendChunkToChannels = (chunkIndex) => {
            const transfer = pendingTransfersRef.current[fileId];
            if (!transfer || transfer.sentChunks.has(chunkIndex) || chunkIndex >= totalChunks) return;

            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, transfer.file.size);

            const slice = transfer.file.slice(start, end);
            slice.arrayBuffer().then(buffer => {
                const chunkWithIndex = new ArrayBuffer(buffer.byteLength + 4);
                const view = new DataView(chunkWithIndex);
                view.setUint32(0, chunkIndex, true);
                new Uint8Array(chunkWithIndex, 4).set(new Uint8Array(buffer));

                transfer.initialPeerIds.forEach(socketId => {
                    const channels = dataChannelsRef.current[socketId];
                    if (!channels || !Array.isArray(channels)) return;
                    const ch = channels[chunkIndex % NUM_CHANNELS];
                    if (ch && ch.readyState === 'open') {
                        try {
                            ch.send(chunkWithIndex, [chunkWithIndex]);
                        } catch (e) {
                            try { ch.send(chunkWithIndex); } catch (err) { console.error(err); }
                        }
                    }
                });

                transfer.sentChunks.add(chunkIndex);
            }).catch(error => {
                console.error("Error reading file chunk for sending:", error);
                toast.error(`Failed to read file chunk for ${transfer.file.name}.`);
            });
        };

        let arrayBuffer;

        pendingTransfersRef.current[fileId] = {
            fileName: file.name,
            initialPeerIds: activeChannelIds,
            initialPeerCount: activeChannelIds.length,
            confirmedPeers: new Set(),
            failedPeers: new Set(), 
            totalChunks,
            currentChunkToSend: 0,
            lowestUnackedChunk: 0,
            sentChunks: new Set(),
            ackedChunks: new Set(),
            file: file,
            arrayBuffer: arrayBuffer,
            sendWindowOfChunks,
        };

        if (file.size > FILE_SIZE_THRESHOLD) {
            const metadataToSend = JSON.stringify({ ...metadata, concurrent: true });
            activeChannelIds.forEach(socketId => {
                const dataChannels = dataChannelsRef.current[socketId].filter(elem => elem && elem.readyState === 'open');
                const channel = dataChannels && dataChannels.length > 0 ? dataChannels[0] : null;
                if (channel) {
                    channel.send(`metadata:${metadataToSend}`);
                }
            });

            setIsTransferring(true);
            setTransferProgress(0);
            setSendingFileName(file.name);

            calculateFileHash(file).then(hash => {
                finalHash = hash;
                activeChannelIds.forEach(socketId => {
                    const dataChannels = dataChannelsRef.current[socketId].filter(elem => elem && elem.readyState === 'open');
                    const channel = dataChannels && dataChannels.length > 0 ? dataChannels[0] : null;
                    if (channel) {
                        channel.send(`hash:${JSON.stringify({ fileId, hash })}`);
                    }
                });
            }).catch(error => {
                console.error("Failed to calculate hash for large file:", error);
                toast.error(`Transfer of ${file.name} failed. Hash calculation error.`);
            });

            setTransferStatus(prev => ({ ...prev, [fileId]: { confirmed: 0, total: activeChannelIds.length } }));

        } else {
            setIsProcessingFile(true);

            try {
                arrayBuffer = await file.arrayBuffer();
                finalHash = await calculateFileHash(file);
            } catch (error) {
                console.error('Failed to calculate file hash:', error);
                setIsProcessingFile(false);
                return;
            }

            if (!finalHash) {
                console.error('Failed to calculate file hash.');
                toast.error('File hash could not be determined.');
                return;
            }

            const metadataToSend = JSON.stringify({ ...metadata, hash: finalHash, concurrent: false });
            activeChannelIds.forEach(socketId => {
                const dataChannels = dataChannelsRef.current[socketId].filter(elem => elem && elem.readyState === 'open');
                const channel = dataChannels && dataChannels.length > 0 ? dataChannels[0] : null;
                if (channel && channel.readyState === 'open') {
                    channel.send(`metadata:${metadataToSend}`);
                }
            });

            pendingTransfersRef.current[fileId].arrayBuffer = arrayBuffer;
            setTransferStatus(prev => ({ ...prev, [fileId]: { confirmed: 0, total: activeChannelIds.length } }));
            setIsTransferring(true);
            setTransferProgress(0);
            setSendingFileName(file.name);

            setIsProcessingFile(false);
        }

        sendWindowOfChunks();

    }, [calculateFileHash]);

    const joinRoom = useCallback((
        room,
        isCreator,
        onInvalidRoom,
        onRoomJoined,
        onRoomFull,
        onConnectionError
    ) => {
        setIsConnecting(true);
        setConnectionError(null);
        shouldAttemptReconnectRef.current = true;

        if (socketRef.current) {
            shouldAttemptReconnectRef.current = false;
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        const socket = io(import.meta.env.VITE_BACKEND_URL, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 10000,
            reconnectionDelayMax: 50000,
            randomizationFactor: 0.5
        });
        socketRef.current = socket;

        socket.on('error', (error) => {
            console.error('Socket error:', error.message);
            setConnectionError(error.message);
            toast.error(error.message);
            if (error.message.includes('Too many')) {
                shouldAttemptReconnectRef.current = false;
                socket.disconnect();
                socketRef.current = null;
            }
        });

        socket.on('connect', () => {
            shouldAttemptReconnectRef.current = true;
            if (isCreator) {
                socket.emit('create-room', room);
            } else {
                socket.emit('join', room);
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            if (shouldAttemptReconnectRef.current) {
                onConnectionError("Failed to connect to server. Retrying connection...");
                setConnectionError("Failed to connect to server. Retrying...");
            } else {
                setIsConnecting(false);
                onConnectionError("Failed to connect to server.");
                setConnectionError("Failed to connect to server.");
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`Socket disconnected: ${reason}`);
            setRoomId(null);
            setUsername('');
            setActivePeers([]);

            for (const socketId in fileBufferRef.current) {
                const fileIdToCleanup = fileBufferRef.current[socketId]?.metadata?.fileId;
                if (fileIdToCleanup) {
                    cleanupFileTransferState(socketId, fileIdToCleanup, 'socket_disconnect');
                }
            }
            peersInitiatedConnectionWithRef.current = [];
            for (const peerId in peerConnectionsRef.current) {
                closePeerConnection(peerId);
            }
            for (const fileId in pendingTransfersRef.current) {
                delete pendingTransfersRef.current[fileId];
            }
            setTransferStatus({});
            setIsTransferring(false);
            setSendingFileName('');
            setSelectedFile(null);


            if (shouldAttemptReconnectRef.current) {
                setIsConnecting(true);
                onConnectionError(`Disconnected: ${reason}. Retrying connection...`);
                setConnectionError(`Disconnected: ${reason}. Retrying...`);
            } else {
                setIsConnecting(false);
                onConnectionError(`Disconnected from server.`);
                setConnectionError(null);
            }
        });

        socket.on('invalid-room', () => {
            console.warn('❌ Invalid room!');
            shouldAttemptReconnectRef.current = false;
            socket.disconnect();
            socketRef.current = null;
            onInvalidRoom();
        });

        socket.on('room-full', () => {
            console.warn('🚫 Room is full!');
            shouldAttemptReconnectRef.current = false;
            socket.disconnect();
            socketRef.current = null;
            onRoomFull();
        });

        socket.on('room-joined', ({ roomId: assignedRoomId, username: assignedUsername, existingPeers = [] }) => {
            console.log(`✅ Joined room ${assignedRoomId} as ${assignedUsername}`);
            setUsername(assignedUsername);
            setRoomId(assignedRoomId);
            setActivePeers(existingPeers.map(peer => ({ ...peer, dataChannelOpen: false })));
            peersInitiatedConnectionWithRef.current = [];
            onRoomJoined(assignedUsername);
            setIsConnecting(false);
            setConnectionError(null);

            existingPeers.forEach(peer => {
                if (socketRef.current.id < peer.socketId) {
                    console.log(`🤝 Attempting to connect with existing peer: ${peer.socketId}`);
                    createAndSendOffer(peer.socketId);
                    peersInitiatedConnectionWithRef.current.push(peer.socketId);
                }
            });
        });

        socket.on('peer-joined', ({ username: peerUsername, socketId: peerSocketId }) => {
            console.log(`🎉 Peer joined: ${peerUsername} (${peerSocketId})`);
            if (peerSocketId === socketRef.current.id) return;

            setActivePeers((prevPeers) => {
                if (!prevPeers.some(p => p.socketId === peerSocketId)) {
                    return [...prevPeers, { socketId: peerSocketId, username: peerUsername, dataChannelOpen: false }];
                }
                return prevPeers;
            });

            if (!peersInitiatedConnectionWithRef.current.includes(peerSocketId) && socketRef.current.id < peerSocketId) {
                console.log(`🤝 Attempting to connect with peer: ${peerSocketId}`);
                createAndSendOffer(peerSocketId);
                peersInitiatedConnectionWithRef.current.push(peerSocketId);
            }
        });

        socket.on('signal', ({ from, data }) => {
            handleIncomingSignal({ from, data });
        });

        socket.on('peer-left', ({ username: leftUsername, socketId: leftSocketId }) => {
            console.log(`👋 Peer ${leftUsername} (${leftSocketId}) left.`);
            toast.info(`${leftUsername} left the room.`);
            setActivePeers((prevPeers) => prevPeers.filter(peer => peer.socketId !== leftSocketId));
            peersInitiatedConnectionWithRef.current = peersInitiatedConnectionWithRef.current.filter(id => id !== leftSocketId);
            closePeerConnection(leftSocketId);

            if (fileBufferRef.current[leftSocketId]) {
                const fileIdToCleanup = fileBufferRef.current[leftSocketId].metadata.fileId;
                toast.error(`File transfer interrupted from ${leftUsername}: Sender disconnected.`);
                cleanupFileTransferState(leftSocketId, fileIdToCleanup, 'peer_left_receiving');
            }

            for (const fileId in pendingTransfersRef.current) {
                const transfer = pendingTransfersRef.current[fileId];
                if (transfer.initialPeerIds.includes(leftSocketId)) {
                    transfer.failedPeers.add(leftSocketId);
                    const totalProcessed = transfer.confirmedPeers.size + transfer.failedPeers.size;


                    transfer.confirmedPeers.delete(leftSocketId);

                    setTransferStatus(prev => ({
                        ...prev,
                        [fileId]: { confirmed: transfer.confirmedPeers.size, total: transfer.initialPeerCount }
                    }));

                    const fileName = transfer.fileName;
                    const initialTotalPeers = transfer.initialPeerIds.length;
                    const confirmedCount = transfer.confirmedPeers.size;

                    if (totalProcessed === transfer.initialPeerCount) {
                        if (confirmedCount > 0) {
                            setSentFiles((prev) => [...prev, {
                                name: fileName,
                                recipients: Array.from(transfer.confirmedPeers)
                            }]);
                            let successMessage = `File "${fileName}" sent successfully`;
                            if (confirmedCount === initialTotalPeers) {
                                successMessage += ` to all ${initialTotalPeers} peers!`;
                            } else {
                                successMessage += ` to ${confirmedCount} of ${initialTotalPeers} initial peers!`;
                            }
                            toast.success(successMessage);
                        } else {
                            toast.error(`File "${fileName}" transfer failed: All recipients disconnected or failed validation.`);
                        }

                        delete pendingTransfersRef.current[fileId];
                        setTransferStatus(prev => {
                            const newStatus = { ...prev };
                            delete newStatus[fileId];
                            return newStatus;
                        });

                        if (Object.keys(pendingTransfersRef.current).length === 0) {
                            setIsTransferring(false);
                            setSelectedFile(null);
                            setTimeout(() => setSendingFileName(''), 3000);
                        }
                    }
                }
            }
        });

    }, [closePeerConnection, createAndSendOffer, handleIncomingSignal, username, cleanupFileTransferState]);

    useEffect(() => {
        return () => {
            if (socketRef.current) {
                shouldAttemptReconnectRef.current = false;
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            for (const peerId in peerConnectionsRef.current) {
                closePeerConnection(peerId);
            }
            for (const socketId in fileBufferRef.current) {
                const fileIdToCleanup = fileBufferRef.current[socketId]?.metadata?.fileId;
                if (fileIdToCleanup) {
                    cleanupFileTransferState(socketId, fileIdToCleanup, 'component_unmount');
                }
            }
        };
    }, [closeDataChannel, cleanupFileTransferState]);

    const emitSignal = useCallback((payload) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('signal', payload);
        } else {
            console.warn("Socket not connected, cannot emit signal.");
            toast.warn("Connection lost. Cannot send signaling data.");
        }
    }, []);

    return {
        socketRef,
        roomId,
        username,
        isConnecting,
        connectionError,
        activePeers,
        joinRoom,
        emitSignal,
        receivedFiles,
        downloadProgress,
        showSuccessCheck,
        receivingFileName,
        dataChannelsRef,
        selectedFile,
        setSelectedFile,
        handleSendFile,
        isTransferring,
        transferProgress,
        sendingFileName,
        sentFiles,
        transferStatus,
        isProcessingFile,
    };
}