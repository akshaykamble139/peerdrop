import { useRef, useState } from 'react';
import { truncateFileName } from '../utils/helper';

function FileInput({ selectedFile, setSelectedFile, onSendFile }) {
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSend = () => {
        onSendFile();              // Send the file
        setSelectedFile(null);    // Clear selected file state
        if (fileInputRef.current) {
            fileInputRef.current.value = '';  // Clear the actual input
        }
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setSelectedFile(e.dataTransfer.files[0]);
            // Update the file input value for consistency
            if (fileInputRef.current) {
                // This is just for visual consistency, we can't actually set the value due to security restrictions
                fileInputRef.current.files = e.dataTransfer.files;
            }
        }
    };

    return (
        <div className="mb-6">
            {/* Drag and drop area */}
            <div 
                className={`border-2 border-dashed rounded-lg p-6 mb-4 transition-colors
                    ${isDragging 
                        ? 'border-indigo-500 bg-indigo-50' 
                        : 'border-gray-300 hover:border-indigo-300'}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <div className="text-center">
                    <div className="mb-3">
                        <svg 
                            className={`w-12 h-12 mx-auto ${isDragging ? 'text-indigo-500' : 'text-gray-400'}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24" 
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth="2" 
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            ></path>
                        </svg>
                    </div>
                    <p className="text-gray-700 mb-1">
                        <span className="font-medium">Drop files here</span> or
                    </p>
                    <label className="cursor-pointer inline-block px-4 py-2 bg-indigo-100 text-indigo-700 font-semibold rounded-full hover:bg-indigo-200 transition">
                        Choose File
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleChange}
                            className="hidden"
                        />
                    </label>
                </div>
            </div>

            {/* Selected file display */}
            {selectedFile && (
                <div className="mt-4 flex items-center justify-between bg-indigo-50 p-3 rounded-lg">
                    <div className="flex items-center">
                        <svg 
                            className="w-5 h-5 text-indigo-500 mr-2" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24" 
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth="2" 
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            ></path>
                        </svg>
                        <span className="text-sm text-gray-700 truncate max-w-xs" title={selectedFile.name}>
                            {truncateFileName(selectedFile.name, 60)}
                        </span>
                    </div>
                    <button
                        onClick={handleSend}
                        className="ml-4 px-4 py-1 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition flex-shrink-0"
                    >
                        Send File
                    </button>
                </div>
            )}
        </div>
    );
}

export default FileInput;