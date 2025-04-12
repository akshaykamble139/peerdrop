import { truncateFileName } from "../utils/helper";

function SentFiles({ files }) {
    return (
        <div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">📤 Sent Files:</h3>
            {files.length === 0 ? (
                <p className="text-sm text-gray-400">No files sent yet.</p>
            ) : (
                <ul className="space-y-2">
                    {files.map((file, idx) => (
                        <li
                            key={idx}
                            className="text-sm text-gray-700 truncate"
                            title={file.name}
                        >
                            {truncateFileName(file.name, 40)}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default SentFiles;
