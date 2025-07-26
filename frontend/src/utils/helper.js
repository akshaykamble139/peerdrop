import { toast } from 'react-toastify';

export const truncateFileName = (name, maxLength) => {
    if (name.length <= maxLength) return name;

    const extension = name.split('.').pop();
    const nameWithoutExt = name.substring(0, name.length - extension.length - 1);

    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 3);
    return `${truncatedName}...${extension}`;
};

export const copyToClipboard = (text, option = "id") => {
    navigator.clipboard.writeText(text);
    if (option === "id") {
        toast.success('Room ID copied to clipboard!');
    }
    else if (option === "url") {
        toast.success('Room URL copied to clipboard!');
    }
    else {
        toast.success('Copied to clipboard!');
    }
};