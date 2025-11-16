/**
 * 1P Protocol Configuration Constants
 * Based on PRD specifications
 */

export const COLORS = ["red", "green", "blue", "yellow"] as const;
export const DIRECTIONS = ["Up", "Down", "Left", "Right", "Skip"] as const;
export const GRID_SIZE = 64;

//TODO:
export const COLOR_HEX_CODES = {
  red: "#EF4444",
  green: "#10B981",
  blue: "#3B82F6",
  yellow: "#F59E0B",
} as const;

export const DIRECTION_MAPPINGS = {
  Up: "U",
  Down: "D",
  Left: "L",
  Right: "R",
  Skip: "S",
} as const;

export const DOMAIN = {
  ascii: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
  emojis:
    "😀😂❤️👍🙏😍😭😅🎉🔥💯😎🤔🤦😴🤖👀✨✅🚀💎🌟⭐💫🎯🎨🎪🎸🎵🎶🏆🏅🎊🎈🎁🎀🌈🌸🌺🌻🌷🌹",
  hearts: "💖💝💘💗💓💕💞💜🧡💛💚💙🤍🖤🤎❣️💋",
  nature: "🌳🌲🌴🌿🍀🌾🌻🌺🌸🌷🌹🌼🌵🌱🍃🌿🦋🐝🐞🕷️",
  food: "🍎🍌🍇🍓🍈🍉🍊🍋🥭🍑🍒🥝🍍🥥🍅🥑🍆🥔🥕🌽",
  animals: "🐶🐱🐭🐹🐰🦊🐻🐼🐨🦁🐯🐮🐷🐸🐵🐔🐧🦆🦉🦅🐺🐗🐴",
  travel: "✈️🚆🚂🚄🚘🚲🛴🛵🏍️🚕🚖🚁🚀🛸🚢🚤🏝️🏖️🏔️⛰️🏕️🌋",
  sports: "⚽⚾🏀🏐🏈🏉🎾🏓🏸🥊🥋⛳🏌️‍♂️🏄‍♀️🏊‍♀️🧗‍♂️🚴‍♀️🏆🏅🥇🥈🥉",
  tech: "📱💻⌨️🖥️🖨️💾💿📷🔌📡🔋🔬🔭📚📝✏️🔍🔑🔒",
  music: "🎵🎶🎸🎹🎷🎺🎻🥁🎼🎤🎧📻🎙️🎚️🎛️",
  weather: "☀️🌤️⛅🌥️☁️🌦️🌧️⛈️🌩️🌨️❄️💨☃️⛄🌬️🌀🌈☔⚡",
  zodiac: "♈♉♊♋♌♍♎♏♐♑♒♓⛎",
  numbers: "0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟",
  japanese:
    "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",
  korean: "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ",
  chinese: "的一是不了人我在有他这为之大来以个中上们",
  arabic: "ابتثجحخدذرزسشصضطظعغفقكلمنهوي",
  cyrillic: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
} as const;
export const DOMAIN_CHARS = Object.values(DOMAIN).join("");

export const DEFAULT_GRID_SIZE = 5; // 5x5 grid
export const DEFAULT_DIFFICULTY = 3; // 3 rounds for MVP
export const CHALLENGE_EXPIRY_MINUTES = 5; // 5 minutes
export const KEY_EXPIRY_MINUTES = 5; // 5 minutes

export const MIN_POT_AMOUNT = 1; // 1 USDC minimum
export const MIN_POT_DURATION_DAYS = 1;
export const MAX_POT_DURATION_DAYS = 10;
export const MIN_ENTRY_FEE = 0.0001; // 0.0001 USDC minimum

export const PAYOUT_RATIOS = {
  WINNER: 0.4, // 40% to winner
  CREATOR: 0.35, // 35% to creator
  PLATFORM: 0.25, // 25% to platform
} as const;

export type Color = (typeof COLORS)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type Domain = keyof typeof DOMAIN;
export type ColorHexCode = typeof COLOR_HEX_CODES;
export type DirectionMapping = typeof DIRECTION_MAPPINGS;
