// ─── Physics (Krunker-style) ─────────────────────────────────────────────────
export const GRAVITY = -55
export const PLAYER_HEIGHT = 1.7
export const PLAYER_CROUCH_HEIGHT = 1.05
export const PLAYER_RADIUS = 0.4
export const PLAYER_EYE = 1.55
export const PLAYER_CROUCH_EYE = 0.95
export const GROUND_Y = 0

// Movement — tuned for bhop / slide-hop feel
export const ACCELERATION = 85
export const AIR_ACCELERATION = 28
export const MAX_SPEED = 11.5
export const SPRINT_MULT = 1.0 // Krunker has no dedicated sprint; speed is class-based
export const JUMP_VEL = 14.5
export const FRICTION = 8
export const AIR_FRICTION = 0.15
export const SLIDE_FRICTION = 0.35
export const SLIDE_SPEED_CAP = 28
export const SLIDE_DURATION = 0.5
export const SLIDE_BOOST = 4.5
export const BHOP_WINDOW = 0.12 // seconds after landing to chain jump without full friction
export const CROUCH_SPEED_MULT = 0.55
export const ADS_SPEED_MULT = 0.55

// ─── Classes (matching real Krunker loadouts) ────────────────────────────────
export const CLASSES = [
  {
    id: 'triggerman',
    name: 'TRIGGERMAN',
    desc: 'Balanced assault. The classic.',
    color: 0x4caf50,
    health: 100,
    speed: 1.0,
    weapon: {
      id: 'ak',
      name: 'ASSAULT RIFLE',
      damage: 23,
      headMult: 1.5,
      fireRate: 0.105,
      magSize: 30,
      reloadTime: 1.6,
      spread: 0.055,
      adsSpread: 0.008,
      auto: true,
      color: 0x3d3d3d,
      adsZoom: 1.35,
      recoil: 0.035,
      kick: 0.012,
    },
  },
  {
    id: 'hunter',
    name: 'HUNTER',
    desc: 'One-shot headshots. Stay scoped.',
    color: 0x795548,
    health: 90,
    speed: 0.92,
    weapon: {
      id: 'sniper',
      name: 'SNIPER RIFLE',
      damage: 70,
      headMult: 2.2,
      fireRate: 0.95,
      magSize: 3,
      reloadTime: 2.4,
      spread: 0.12,
      adsSpread: 0.0,
      auto: false,
      color: 0x2a2a2a,
      adsZoom: 3.8,
      recoil: 0.18,
      kick: 0.06,
    },
  },
  {
    id: 'runngun',
    name: 'RUN N GUN',
    desc: 'SMG spray. Fast & aggressive.',
    color: 0xff9800,
    health: 90,
    speed: 1.12,
    weapon: {
      id: 'smg',
      name: 'MACHINE PISTOL',
      damage: 16,
      headMult: 1.4,
      fireRate: 0.065,
      magSize: 28,
      reloadTime: 1.35,
      spread: 0.075,
      adsSpread: 0.02,
      auto: true,
      color: 0x555555,
      adsZoom: 1.15,
      recoil: 0.022,
      kick: 0.008,
    },
  },
  {
    id: 'spraynpray',
    name: 'SPRAY N PRAY',
    desc: 'LMG. Hold the trigger down.',
    color: 0x9c27b0,
    health: 120,
    speed: 0.88,
    weapon: {
      id: 'lmg',
      name: 'LIGHT MACHINE GUN',
      damage: 18,
      headMult: 1.4,
      fireRate: 0.095,
      magSize: 60,
      reloadTime: 2.8,
      spread: 0.08,
      adsSpread: 0.025,
      auto: true,
      color: 0x444444,
      adsZoom: 1.25,
      recoil: 0.04,
      kick: 0.014,
    },
  },
  {
    id: 'vince',
    name: 'VINCE',
    desc: 'Shotgun. Close-range delete.',
    color: 0xf44336,
    health: 100,
    speed: 1.0,
    weapon: {
      id: 'shotgun',
      name: 'SHOTGUN',
      damage: 12,
      headMult: 1.3,
      fireRate: 0.55,
      magSize: 2,
      reloadTime: 1.9,
      spread: 0.16,
      adsSpread: 0.09,
      auto: false,
      color: 0x6d4c41,
      pellets: 8,
      adsZoom: 1.1,
      recoil: 0.12,
      kick: 0.04,
    },
  },
  {
    id: 'detective',
    name: 'DETECTIVE',
    desc: 'Revolver. High damage, skill shots.',
    color: 0x607d8b,
    health: 100,
    speed: 1.05,
    weapon: {
      id: 'revolver',
      name: 'REVOLVER',
      damage: 50,
      headMult: 1.8,
      fireRate: 0.38,
      magSize: 6,
      reloadTime: 2.0,
      spread: 0.04,
      adsSpread: 0.005,
      auto: false,
      color: 0x8d6e63,
      adsZoom: 1.3,
      recoil: 0.08,
      kick: 0.03,
    },
  },
  {
    id: 'marksman',
    name: 'MARKSMAN',
    desc: 'Semi-auto. Mid-range precision.',
    color: 0x2196f3,
    health: 100,
    speed: 0.98,
    weapon: {
      id: 'semi',
      name: 'SEMI AUTO',
      damage: 34,
      headMult: 1.7,
      fireRate: 0.22,
      magSize: 8,
      reloadTime: 1.7,
      spread: 0.04,
      adsSpread: 0.003,
      auto: false,
      color: 0x37474f,
      adsZoom: 2.0,
      recoil: 0.05,
      kick: 0.02,
    },
  },
]

// Secondary shared by all classes
export const SECONDARY = {
  id: 'pistol',
  name: 'PISTOL',
  damage: 20,
  headMult: 1.5,
  fireRate: 0.2,
  magSize: 10,
  reloadTime: 1.4,
  spread: 0.035,
  adsSpread: 0.008,
  auto: false,
  color: 0x9e9e9e,
  adsZoom: 1.15,
  recoil: 0.025,
  kick: 0.01,
}

// Melee
export const MELEE = {
  id: 'knife',
  name: 'KNIFE',
  damage: 50,
  headMult: 1,
  fireRate: 0.4,
  magSize: Infinity,
  reloadTime: 0,
  spread: 0,
  adsSpread: 0,
  auto: false,
  color: 0xc0c0c0,
  adsZoom: 1,
  recoil: 0,
  kick: 0,
  melee: true,
  range: 2.2,
}

// ─── Bots ────────────────────────────────────────────────────────────────────
export const BOT_COUNT = 8
export const BOT_RESPAWN = 3.5
export const BOT_DETECT_RANGE = 60
export const BOT_ATTACK_RANGE = 42
export const BOT_DAMAGE_MULT = 0.28 // bots hit much softer than players
export const BOT_FIRE_MULT = 1.8   // slower fire rate (higher = slower)
export const BOT_NAMES = [
  'xXProGamerXx', 'NoScopeKing', 'BhopMaster', 'SlideGod',
  'KrunkerKid', 'HeadshotOnly', 'TryHard99', 'CasualChad',
  'NubSlayer', '360NoScope', 'RageQuit', 'ClutchOrKick',
]

// ─── Match ───────────────────────────────────────────────────────────────────
export const MATCH_TIME = 180 // 3 minutes FFA
export const SCORE_KILL = 100
export const SCORE_HEADSHOT = 25
export const SCORE_MELEE = 50

export const MAP_SIZE = 90
export const RESPAWN_DELAY = 2.5
