// src/hooks/useFileTransfer.js
import { useState } from 'react';

export function useFileTransfer(dataChannelsRef, onFileSent) {
    const CHUNK_SIZE = 16 * 1024;
    const [selectedFile, setSelectedFile] = useState(null);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [sendingFileName, setSendingFileName] = useState('');

    const handleSendFile = () => {
        const file = selectedFile;
        if (!file) {
            console.warn('⚠️ No file selected');
            return;
        }
        console.log('handleSendFile function called');

        setIsTransferring(true);
        setTransferProgress(0);
        setSendingFileName(file.name);
        onFileSent({ name: file.name, recipients: Object.keys(dataChannelsRef.current) });

        const metadata = JSON.stringify({ name: file.name, size: file.size });

        const reader = new FileReader();
        let offset = 0;

        const sendChunk = (channel, chunkToSend) => {
            if (channel.readyState === 'open') {
                channel.send(chunkToSend);
            }
        };

        reader.onload = () => {
            try {
                if (reader.result) {
                    const chunk = reader.result;
                    for (const socketId in dataChannelsRef.current) {
                        const channel = dataChannelsRef.current[socketId];
                        if (channel.readyState === 'open') {
                            if (offset === 0) {
                                sendChunk(channel, `metadata:${metadata}`);
                            }

                            // Implement flow control: Only send if buffer is not full
                            if (channel.bufferedAmount < channel.bufferedAmountLowThreshold || channel.bufferedAmount === 0) {
                                sendChunk(channel, chunk);
                                offset += chunk.byteLength;
                                setTransferProgress(Math.round((offset / file.size) * 100));

                                if (offset < file.size) {
                                    readSlice(offset);
                                } else {
                                    for (const id in dataChannelsRef.current) {
                                        if (dataChannelsRef.current[id].readyState === 'open') {
                                            sendChunk(dataChannelsRef.current[id], 'end');
                                        }
                                    }
                                    setIsTransferring(false);
                                    setSelectedFile(null);
                                    setTimeout(() => setSendingFileName(''), 3000);
                                }
                            } else {
                                // Wait for the buffer to drain a bit before sending more
                                channel.onbufferedamountlow = () => {
                                    channel.onbufferedamountlow = null; // Clear the event listener
                                    sendChunk(channel, chunk);
                                    offset += chunk.byteLength;
                                    setTransferProgress(Math.round((offset / file.size) * 100));
                                    if (offset < file.size) {
                                        readSlice(offset);
                                    } else {
                                        for (const id in dataChannelsRef.current) {
                                            if (dataChannelsRef.current[id].readyState === 'open') {
                                                sendChunk(dataChannelsRef.current[id], 'end');
                                            }
                                        }
                                        setIsTransferring(false);
                                        setSelectedFile(null);
                                        setTimeout(() => setSendingFileName(''), 3000);
                                    }
                                };
                            }
                        }
                    }
                }
            }
            catch (e) {
                console.log("Error while transeferring file", e)
            }
        };

        reader.onerror = (error) => {
            console.error('Error reading file:', error);
        };

        const readSlice = (o) => {
            const slice = file.slice(o, o + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        readSlice(0);
    };

    return {
        selectedFile,
        setSelectedFile,
        handleSendFile,
        isTransferring,
        transferProgress,
        sendingFileName,
    };
}