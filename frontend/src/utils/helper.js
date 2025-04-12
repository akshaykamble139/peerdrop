export const truncateFileName = (name, maxLength) => {
    if (name.length <= maxLength) return name;

    const extension = name.split('.').pop();
    const nameWithoutExt = name.substring(0, name.length - extension.length - 1);

    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 3);
    return `${truncatedName}...${extension}`;
};