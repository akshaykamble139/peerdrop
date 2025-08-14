import { truncateFileName } from "../utils/helper";

function TransferStatus({
    isTransferring,
    transferProgress,
    downloadProgress,
    showSuccessCheck,
    receivingFileName,
    sendingFileName,
    isProcessingFile
}) {
    const progress = isTransferring ? transferProgress : downloadProgress;
    const fileName = isTransferring ? sendingFileName : receivingFileName;

    const showProgressBar = (isTransferring && transferProgress < 100) || (!isTransferring && downloadProgress > 0 && downloadProgress < 100);
    const showPulsingLoader = (isTransferring && transferProgress === 100) || (!isTransferring && downloadProgress === 100 && !showSuccessCheck);

    if (!isProcessingFile && !showProgressBar && !showPulsingLoader && !showSuccessCheck) return null;

    return (
        <div className="mb-6 transition-all duration-300">
            {isProcessingFile && (
                <div className="flex items-center space-x-2 text-indigo-700 mb-2 animate-pulse">
                    <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="font-medium">Processing file...</span>
                </div>
            )}

            {!isProcessingFile && (showProgressBar || showPulsingLoader) && (
                <>
                    {showPulsingLoader ? (
                        <div className="flex items-center space-x-2 text-indigo-700 mb-2 animate-pulse">
                            <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="font-medium">
                                {isTransferring ? "Waiting for peer confirmation..." : "Verifying file integrity..."}
                            </span>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm font-medium text-indigo-700 mb-2">
                                {isTransferring
                                    ? `Sending file... ${transferProgress}%`
                                    : `Receiving file... ${downloadProgress}%`}
                            </p>

                            <div className="relative w-full h-3 bg-indigo-100 rounded-full overflow-hidden">
                                <div
                                    className="absolute h-full bg-indigo-500 transition-all duration-500 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </>
                    )}

                    {fileName && (
                        <p className="text-sm text-gray-600 mb-1 italic">
                            <span className="font-medium">{truncateFileName(fileName, 40)}</span>
                        </p>
                    )}
                </>
            )}

            {!isProcessingFile && showSuccessCheck && (
                <div className="flex items-center space-x-2 text-green-600 mt-2 animate-pop">
                    <svg
                        xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        ✅
                    </svg>
                    <span className="font-medium">Transfer complete!</span>
                </div>
            )}
        </div>
    );
}

export default TransferStatus;
