import { truncateFileName } from "../utils/helper";

function ReceivedFiles({ files }) {
    return (
        <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">📥 Received Files:</h3>
            {files.length === 0 ? (
                <p className="text-sm text-gray-400">No files received yet.</p>
            ) : (
                <ul className="space-y-2">
                    {files.map((file, idx) => (
                        <li key={idx} className="overflow-hidden">
                            <a
                                href={file.url}
                                download={file.name}
                                className="text-indigo-600 hover:text-indigo-800 inline-block truncate max-w-full"
                                title={file.name}
                            >
                                {truncateFileName(file.name, 40)}
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default ReceivedFiles;
