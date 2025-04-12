const adjectives = [
    "Wacky", "Sneaky", "Zesty", "Bouncy", "Gloomy", "Sunny", "Chonky", "Dizzy", "Sassy", "Funky"
];

const nouns = [
    "Banana", "Penguin", "Taco", "Sloth", "Galaxy", "Dolphin", "Wizard", "Potato", "Cactus", "Noodle"
];

export function generateRoomName() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
}

export function generateRoomId() {
    return Math.random().toString(36).substring(2, 8); // short unique ID
}
