// src/hooks/useDataChannel.js
import { useRef, useState } from 'react';

export function useDataChannel() {
    const dataChannelsRef = useRef({});
    const fileBufferRef = useRef({});
    const [receivedFiles, setReceivedFiles] = useState([]);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [showSuccessCheck, setShowSuccessCheck] = useState(false);
    const [receivingFileName, setReceivingFileName] = useState('');

    const handleIncomingMessage = (event, fromSocketId) => {
        const data = event.data;

        // console.log(`📥 Received message from socket ID: ${fromSocketId}`);
        // console.log('Data received:', data);

        if (typeof data === 'string' && data.startsWith('metadata:')) {
            const metadata = JSON.parse(data.replace('metadata:', ''));
            // console.log('Parsed metadata:', metadata);
            // console.log('fileBufferRef.current before init:', fileBufferRef.current);
            fileBufferRef.current[fromSocketId] = { buffer: [], metadata: metadata }; // Initialize with metadata
            // console.log('fileBufferRef.current after init:', fileBufferRef.current);
            // console.log('fileBufferRef.current[fromSocketId] after init:', fileBufferRef.current[fromSocketId]);
            setDownloadProgress(0);
            setReceivingFileName(metadata.name);
            setShowSuccessCheck(false);
        } else if (data === 'end') {
            // console.log('End message received. fileBufferRef.current[fromSocketId]:', fileBufferRef.current[fromSocketId]);
            const blob = new Blob(fileBufferRef.current[fromSocketId].buffer);
            const url = URL.createObjectURL(blob);
            const name = fileBufferRef.current[fromSocketId].metadata.name;
            if (fileBufferRef.current[fromSocketId] && fileBufferRef.current[fromSocketId].metadata) {
                setReceivedFiles((files) => [
                    ...files,
                    { name, url, sender: fromSocketId },
                ]);
            } else {
                console.error('Error: Metadata is missing when processing the end message!');
            }
            setDownloadProgress(100);
            setShowSuccessCheck(true);
            setTimeout(() => setShowSuccessCheck(false), 3000);
            delete fileBufferRef.current[fromSocketId];
        } else {
            if (!fileBufferRef.current[fromSocketId]) {
                fileBufferRef.current[fromSocketId] = { buffer: [] }; // Initialize if metadata hasn't arrived first (shouldn't happen with current logic)
            }
            fileBufferRef.current[fromSocketId].buffer.push(data);
            const totalReceived = fileBufferRef.current[fromSocketId].buffer.reduce((acc, chunk) => acc + chunk.byteLength, 0);
            const totalSize = fileBufferRef.current[fromSocketId].metadata?.size || 1;
            const percent = Math.round((totalReceived / totalSize) * 100);
            setDownloadProgress(percent);
        }
    };

    const setDataChannel = (socketId, dataChannel) => {
        dataChannelsRef.current[socketId] = dataChannel;
        dataChannel.onmessage = (event) => handleIncomingMessage(event, socketId);
        dataChannel.onopen = () => console.log(`🟢 Data channel open with ${socketId}`);
    };

    const closeDataChannel = (socketId) => {
        if (dataChannelsRef.current[socketId]) {
            delete dataChannelsRef.current[socketId];
        }
    };

    return {
        dataChannelsRef,
        receivedFiles,
        downloadProgress,
        showSuccessCheck,
        receivingFileName,
        setDataChannel,
        closeDataChannel,
    };
}