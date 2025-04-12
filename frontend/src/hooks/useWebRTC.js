import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

export function useWebRTC() {
    const socketRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const dataChannelRef = useRef(null);
    const fileBufferRef = useRef([]);
    const roomId = 'test-room';
    const CHUNK_SIZE = 16 * 1024;

    const [isInitiator, setIsInitiator] = useState(false);
    const [receivedFiles, setReceivedFiles] = useState([]);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [showSuccessCheck, setShowSuccessCheck] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [sentFiles, setSentFiles] = useState([]);
    const [receivingFileName, setReceivingFileName] = useState('');
    const [sendingFileName, setSendingFileName] = useState('');

    useEffect(() => {
        const socket = io('http://localhost:5000');
        socketRef.current = socket;

        socket.on('connect', () => socket.emit('join', roomId));
        socket.on('peer-joined', () => setIsInitiator(true));

        socket.on('signal', async ({ data }) => {
            const pc = peerConnectionRef.current;
            if (!pc) return;

            if (data.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('signal', { roomId, data: answer });
            } else if (data.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
            } else if (data.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(data));
            }
        });

        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        peerConnectionRef.current = pc;

        if (isInitiator) {
            const dc = pc.createDataChannel('fileChannel');
            dataChannelRef.current = dc;
            dc.onopen = () => console.log('🟢 Data channel open');
            dc.onmessage = handleIncomingMessage;
        } else {
            pc.ondatachannel = (event) => {
                const dc = event.channel;
                dataChannelRef.current = dc;
                dc.onopen = () => console.log('🟢 Data channel open');
                dc.onmessage = handleIncomingMessage;
            };
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current.emit('signal', { roomId, data: event.candidate });
            }
        };

        if (isInitiator) {
            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => socketRef.current.emit('signal', { roomId, data: pc.localDescription }));
        }
    }, [isInitiator]);

    const handleIncomingMessage = (event) => {
        const data = event.data;
        if (typeof data === 'string' && data.startsWith('metadata:')) {
            const metadata = JSON.parse(data.replace('metadata:', ''));
            fileBufferRef.current = [];
            fileBufferRef.current.metadata = metadata;
            setDownloadProgress(0);
            setReceivingFileName(metadata.name);
            setShowSuccessCheck(false);
        } else if (data === 'end') {
            const blob = new Blob(fileBufferRef.current);
            const url = URL.createObjectURL(blob);
            setReceivedFiles((files) => [
                ...files,
                { name: fileBufferRef.current.metadata.name, url },
            ]);
            setDownloadProgress(100);
            setShowSuccessCheck(true);
            setTimeout(() => setShowSuccessCheck(false), 3000);
        } else {
            fileBufferRef.current.push(data);
            const totalReceived = fileBufferRef.current.reduce((acc, chunk) => acc + chunk.byteLength, 0);
            const totalSize = fileBufferRef.current.metadata?.size || 1;
            const percent = Math.round((totalReceived / totalSize) * 100);
            setDownloadProgress(percent);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
            console.warn('⚠️ No file selected or data channel not ready');
            return;
        }

        setIsTransferring(true);
        setTransferProgress(0);

        const metadata = JSON.stringify({ name: file.name, size: file.size });
        dataChannelRef.current.send(`metadata:${metadata}`);

        const reader = new FileReader();
        let offset = 0;

        reader.onload = () => {
            if (reader.result) {
                dataChannelRef.current.send(reader.result);
                offset += reader.result.byteLength;
                setTransferProgress(Math.round((offset / file.size) * 100));
                if (offset < file.size) {
                    readSlice(offset);
                } else {
                    dataChannelRef.current.send('end');
                    setIsTransferring(false);
                }
            }
        };

        const readSlice = (o) => {
            const slice = file.slice(o, o + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        readSlice(0);
    };

    const handleSendFile = () => {
        const file = selectedFile;
        if (!file || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
            console.warn('⚠️ No file selected or data channel not ready');
            return;
        }

        setIsTransferring(true);
        setTransferProgress(0);
        setSendingFileName(file.name);

        const metadata = JSON.stringify({ name: file.name, size: file.size });
        dataChannelRef.current.send(`metadata:${metadata}`);

        const reader = new FileReader();
        let offset = 0;

        reader.onload = () => {
            if (reader.result) {
                dataChannelRef.current.send(reader.result);
                offset += reader.result.byteLength;
                setTransferProgress(Math.round((offset / file.size) * 100));
                if (offset < file.size) {
                    readSlice(offset);
                } else {
                    dataChannelRef.current.send('end');
                    setSentFiles((prev) => [...prev, { name: file.name }]);
                    setSelectedFile(null); // clear input
                    setIsTransferring(false);
                    setTimeout(() => setSendingFileName(''), 3000);
                }
            }
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
        receivedFiles,
        sentFiles,
        isTransferring,
        transferProgress,
        downloadProgress,
        showSuccessCheck,
        receivingFileName,
        handleFileChange,
        sendingFileName
    };

}