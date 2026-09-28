export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureType = 'IDLE' | 'AIMING' | 'PINCH_SHOOT' | 'SHIELD_PALM' | 'POWER_FIST' | 'PEACE_SIGN';

export interface HandDetectionResult {
  detected: boolean;
  landmarks: Landmark[] | null;
  cursor: { x: number; y: number } | null; // Screen coordinates 0..1
  gesture: GestureType;
  pinchDistance: number;
  isOpenPalm: boolean;
  isFist: boolean;
  isAiming: boolean;
  isPinch: boolean;
  isPeace: boolean;
  indexFingerStraightness: number; // 0..1
  confidence: number;
}

export interface GestureErrorFeedback {
  id: string;
  type: 'INDEX_BENT' | 'PINCH_WEAK' | 'PALM_HALF_CLOSED' | 'EDGE_OF_FRAME' | 'TOO_FAR' | 'TOO_CLOSE' | 'FAST_MOVEMENT';
  message: string;
  suggestion: string;
  severity: 'warning' | 'info' | 'error';
  timestamp: number;
}

export type TargetType = 'STANDARD' | 'FAST' | 'SHOOTER' | 'GOLDEN' | 'BOMB';

export interface Target {
  id: string;
  type: TargetType;
  x: number; // 0..1
  y: number; // 0..1
  radius: number; // relative fraction
  vx: number;
  vy: number;
  maxHealth: number;
  health: number;
  points: number;
  createdAt: number;
  duration: number; // lifespan in ms
  scale: number;
  pulsePhase: number;
  shootCooldown?: number; // For shooter drones
}

export interface EnemyProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  createdAt: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
  maxLife: number;
  life: number;
  shape?: 'circle' | 'spark' | 'ring';
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  createdAt: number;
  scale: number;
}

export type GameMode = 'TARGET_RUSH' | 'DRONE_DEFENSE' | 'SURVIVAL';

export interface GameStats {
  score: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
  targetsDestroyed: number;
  projectilesBlocked: number;
  bombHits: number;
  maxCombo: number;
  currentCombo: number;
  errorsDetected: number;
  errorsCorrected: number;
  shieldActiveTime: number;
  health: number;
  maxHealth: number;
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  mode: GameMode;
  accuracy: number;
  maxCombo: number;
  date: string;
}
