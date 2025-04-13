const adjectives = [
    "Wacky", "Sneaky", "Zesty", "Bouncy", "Gloomy", "Sunny", "Chonky", "Dizzy", "Sassy", "Funky",
    "Goofy", "Snappy", "Jumpy", "Cheeky", "Spooky", "Loopy", "Peppy", "Zonky", "Grumpy", "Jazzy"
];

const nouns = [
    "Banana", "Penguin", "Taco", "Sloth", "Galaxy", "Dolphin", "Wizard", "Potato", "Cactus", "Noodle",
    "Unicorn", "Koala", "Tornado", "Muffin", "Dragon", "Pickle", "Pineapple", "Octopus", "Gnome", "Robot"
];

function generateUniqueUsername(takenUsernames = new Set()) {
    const maxTries = 100;
    let attempt = 0;
    while (attempt < maxTries) {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const number = Math.floor(Math.random() * 100);
        const username = `${adj}${noun}${number}`;
        if (!takenUsernames.has(username)) {
            return username;
        }
        attempt++;
    }
    return `User${Math.floor(Math.random() * 1000)}`;
}

module.exports = { generateUniqueUsername };
