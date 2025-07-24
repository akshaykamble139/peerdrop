import { truncateFileName } from "../utils/helper";

function TransferStatus({
    isTransferring,
    transferProgress,
    downloadProgress,
    showSuccessCheck,
    receivingFileName,
    sendingFileName
}) {
    const progress = isTransferring ? transferProgress : downloadProgress;
    const fileName = isTransferring ? sendingFileName : receivingFileName;

    const isActiveTransfer = isTransferring || downloadProgress < 100;

    if (!isTransferring && downloadProgress === 0 && !showSuccessCheck) return null;

    return (
        <div className="mb-6 transition-all duration-300">
            {isActiveTransfer && (
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

                    {fileName && (
                        <p className="text-sm text-gray-600 mb-1 italic">
                            <span className="font-medium">{truncateFileName(fileName,40)}</span>
                        </p>
                    )}
                </>
            )}

            {showSuccessCheck && (
                <div className="flex items-center space-x-2 text-green-600 mt-2 animate-pop">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
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
