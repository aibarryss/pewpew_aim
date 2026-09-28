import { Landmark, GestureType, HandDetectionResult, GestureErrorFeedback } from '../types/game';

// Helper math
export function getDistance2D(p1: Landmark, p2: Landmark): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

export function getDistance3D(p1: Landmark, p2: Landmark): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2);
}

// Finger state checker (is finger extended away from wrist relative to MCP)
function isFingerExtended(tip: Landmark, pip: Landmark, mcp: Landmark, wrist: Landmark): boolean {
  const dTipWrist = getDistance2D(tip, wrist);
  const dPipWrist = getDistance2D(pip, wrist);
  const dMcpWrist = getDistance2D(mcp, wrist);
  return dTipWrist > dPipWrist && dTipWrist > dMcpWrist * 1.15;
}

// Calculate angle in degrees between 3 points: A -> B -> C
function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
  if (magAB === 0 || magCB === 0) return 180;
  const cosine = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

// Exponential smoothing filter for cursor stability
export class CursorSmoother {
  private smoothedX: number | null = null;
  private smoothedY: number | null = null;
  private alpha: number;

  constructor(alpha: number = 0.45) {
    this.alpha = alpha;
  }

  public update(x: number, y: number): { x: number; y: number } {
    if (this.smoothedX === null || this.smoothedY === null) {
      this.smoothedX = x;
      this.smoothedY = y;
    } else {
      this.smoothedX = this.smoothedX + this.alpha * (x - this.smoothedX);
      this.smoothedY = this.smoothedY + this.alpha * (y - this.smoothedY);
    }
    return { x: this.smoothedX, y: this.smoothedY };
  }

  public reset() {
    this.smoothedX = null;
    this.smoothedY = null;
  }
}

export class GestureDetector {
  private lastLandmarks: Landmark[] | null = null;
  private lastTimestamp: number = 0;
  private errorCooldowns: Map<string, number> = new Map();
  private cursorSmoother = new CursorSmoother(0.5);

  public analyze(landmarks: Landmark[] | null, isMirrored: boolean = true): {
    result: HandDetectionResult;
    errors: GestureErrorFeedback[];
  } {
    const errors: GestureErrorFeedback[] = [];
    const now = performance.now();

    if (!landmarks || landmarks.length < 21) {
      this.cursorSmoother.reset();
      return {
        result: {
          detected: false,
          landmarks: null,
          cursor: null,
          gesture: 'IDLE',
          pinchDistance: 1,
          isOpenPalm: false,
          isFist: false,
          isAiming: false,
          isPinch: false,
          isPeace: false,
          indexFingerStraightness: 0,
          confidence: 0,
        },
        errors: [],
      };
    }

    // Mirroring X coordinate if webcam is mirrored for natural gameplay
    const normLandmarks = landmarks.map((pt) => ({
      x: isMirrored ? 1.0 - pt.x : pt.x,
      y: pt.y,
      z: pt.z,
    }));

    const wrist = normLandmarks[0];
    const thumbTip = normLandmarks[4];
    const indexMcp = normLandmarks[5];
    const indexPip = normLandmarks[6];
    const indexTip = normLandmarks[8];
    const middleMcp = normLandmarks[9];
    const middlePip = normLandmarks[10];
    const middleTip = normLandmarks[12];
    const ringMcp = normLandmarks[13];
    const ringPip = normLandmarks[14];
    const ringTip = normLandmarks[16];
    const pinkyMcp = normLandmarks[17];
    const pinkyPip = normLandmarks[18];
    const pinkyTip = normLandmarks[20];

    // Reference scale: hand palm size (wrist to middle MCP)
    const palmScale = getDistance2D(wrist, middleMcp);
    const safePalmScale = Math.max(palmScale, 0.05);

    // Finger extensions
    const indexExtended = isFingerExtended(indexTip, indexPip, indexMcp, wrist);
    const middleExtended = isFingerExtended(middleTip, middlePip, middleMcp, wrist);
    const ringExtended = isFingerExtended(ringTip, ringPip, ringMcp, wrist);
    const pinkyExtended = isFingerExtended(pinkyTip, pinkyPip, pinkyMcp, wrist);
    const thumbExtended = getDistance2D(thumbTip, wrist) > safePalmScale * 0.9;

    // Index angle / straightness
    const indexAngle = calculateAngle(indexMcp, indexPip, indexTip);
    const indexStraightness = Math.max(0, Math.min(1, (indexAngle - 100) / 75)); // ~180 is 1.0

    // Pinch distance relative to palm size
    const rawPinchDist = getDistance2D(thumbTip, indexTip);
    const normPinchDist = rawPinchDist / safePalmScale;
    const isPinch = normPinchDist < 0.42;

    // Open palm: all 4 main fingers extended, thumb extended, fingers spread
    const openFingersCount = [indexExtended, middleExtended, ringExtended, pinkyExtended, thumbExtended].filter(Boolean).length;
    const isOpenPalm = openFingersCount >= 4 && !isPinch;

    // Fist: all 4 fingers curled close to palm
    const foldedCount = [!indexExtended, !middleExtended, !ringExtended, !pinkyExtended].filter(Boolean).length;
    const isFist = foldedCount >= 4 && !thumbExtended && normPinchDist < 0.6;

    // Peace Sign (Victory): Index & Middle extended, Ring & Pinky folded
    const isPeace = indexExtended && middleExtended && !ringExtended && !pinkyExtended && !isPinch;

    // Aiming: Index extended, Middle & Ring folded (or just pointing pistol style)
    const isAiming = indexExtended && indexStraightness > 0.65 && !isOpenPalm && !isFist;

    // Gesture classification
    let gesture: GestureType = 'IDLE';
    if (isPinch && (isAiming || indexExtended)) {
      gesture = 'PINCH_SHOOT';
    } else if (isOpenPalm) {
      gesture = 'SHIELD_PALM';
    } else if (isFist) {
      gesture = 'POWER_FIST';
    } else if (isPeace) {
      gesture = 'PEACE_SIGN';
    } else if (isAiming) {
      gesture = 'AIMING';
    }

    // Cursor position smoothing (targeted at index tip when aiming/pinching, or palm center)
    let rawCursorX = indexTip.x;
    let rawCursorY = indexTip.y;
    if (isOpenPalm) {
      rawCursorX = (middleMcp.x + wrist.x) / 2;
      rawCursorY = (middleMcp.y + wrist.y) / 2;
    }
    const cursor = this.cursorSmoother.update(rawCursorX, rawCursorY);

    // ==========================================
    // TWIST: REAL-TIME ERROR FEEDBACK ENGINE
    // ==========================================
    const triggerError = (
      id: string,
      type: GestureErrorFeedback['type'],
      message: string,
      suggestion: string,
      severity: 'warning' | 'info' | 'error' = 'warning',
      cooldownMs: number = 2200
    ) => {
      const last = this.errorCooldowns.get(id) || 0;
      if (now - last > cooldownMs) {
        this.errorCooldowns.set(id, now);
        errors.push({ id, type, message, suggestion, severity, timestamp: now });
      }
    };

    // 1. Edge of screen error
    if (wrist.x < 0.08 || wrist.x > 0.92 || wrist.y < 0.08 || wrist.y > 0.92) {
      triggerError(
        'edge_error',
        'EDGE_OF_FRAME',
        'Рука у самого края кадра',
        'Смести руку ближе к центру экрана для точного прицеливания',
        'warning',
        2500
      );
    }

    // 2. Hand distance errors
    if (palmScale < 0.08) {
      triggerError(
        'too_far',
        'TOO_FAR',
        'Рука слишком далеко',
        'Подойди ближе к веб-камере или поднеси руку ближе',
        'info',
        3000
      );
    } else if (palmScale > 0.55) {
      triggerError(
        'too_close',
        'TOO_CLOSE',
        'Рука слишком близко к объективу',
        'Отодвинь руку на комфортное расстояние ~50-80 см',
        'info',
        3000
      );
    }

    // 3. Aiming Error: Index finger bent
    if (isAiming && indexStraightness < 0.72) {
      triggerError(
        'index_bent',
        'INDEX_BENT',
        `Указательный палец согнут (${Math.round(indexAngle)}°)`,
        'Выпрями указательный палец жестче — лазерный прицел сбивается при изгибе',
        'warning',
        2000
      );
    }

    // 4. Shoot Pinch Error: Weak pinch (near miss trigger)
    if ((isAiming || gesture === 'AIMING') && normPinchDist > 0.45 && normPinchDist < 0.75) {
      // User is bringing thumb close to index but not touching
      const dThumbIndexChange = this.lastLandmarks ? (getDistance2D(thumbTip, indexTip) - getDistance2D(this.lastLandmarks[4], this.lastLandmarks[8])) : 0;
      if (dThumbIndexChange < -0.015) { // Rapidly closing but didn't finish
        triggerError(
          'pinch_weak',
          'PINCH_WEAK',
          'Слабое смыкание для выстрела',
          'Соедини подушечки большого и указательного пальцев плотнее (щелчок/щипок)',
          'warning',
          1800
        );
      }
    }

    // 5. Shield Error: Half-open palm
    if (!isOpenPalm && !isFist && openFingersCount >= 3 && openFingersCount < 5 && !isAiming) {
      triggerError(
        'palm_half_closed',
        'PALM_HALF_CLOSED',
        'Неполный силовой щит',
        'Раскрой все 5 пальцев шире и направь ладонь в камеру, чтобы активировать барьер',
        'info',
        2200
      );
    }

    // 6. Fast movement velocity check
    if (this.lastLandmarks && this.lastTimestamp > 0) {
      const dt = (now - this.lastTimestamp) / 1000;
      if (dt > 0.01 && dt < 0.2) {
        const speed = getDistance2D(wrist, this.lastLandmarks[0]) / dt;
        if (speed > 4.5) {
          triggerError(
            'fast_movement',
            'FAST_MOVEMENT',
            'Слишком резкое движение',
            'Двигай рукой плавнее, чтобы камера не теряла трекинг суставов',
            'warning',
            2500
          );
        }
      }
    }

    this.lastLandmarks = normLandmarks;
    this.lastTimestamp = now;

    return {
      result: {
        detected: true,
        landmarks: normLandmarks,
        cursor,
        gesture,
        pinchDistance: normPinchDist,
        isOpenPalm,
        isFist,
        isAiming,
        isPinch,
        isPeace,
        indexFingerStraightness: indexStraightness,
        confidence: 0.95,
      },
      errors,
    };
  }
}
