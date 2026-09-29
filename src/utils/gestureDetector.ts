import { Landmark, GestureType, HandDetectionResult, GestureErrorFeedback, GestureCorrectionEvent } from '../types/game';

// Helper math
export function getDistance2D(p1: Landmark, p2: Landmark): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

// Finger state checker
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
  private cursorSmoother = new CursorSmoother(0.5);

  // Mouth-Open Shooting State Machine Constants
  public static readonly MOUTH_OPEN_THRESHOLD = 0.35;
  public static readonly MOUTH_RELEASE_THRESHOLD = 0.20;
  public static readonly MOUTH_CONFIRMATION_MS = 120;
  public static readonly MOUTH_POST_SHOT_DEBOUNCE_MS = 120;

  private mouthState: 'CLOSED' | 'CONFIRMING' | 'LOCKED' = 'CLOSED';
  private mouthConfirmStartTime: number = 0;
  private lastMouthShotTime: number = 0;

  // Error State Machine & Debouncers
  private activeError: GestureErrorFeedback | null = null;
  private activeErrorType: GestureErrorFeedback['type'] | null = null;
  private lastErrorEndTime: Map<string, number> = new Map();

  // Frame counters for stability
  private bentFrameCount: number = 0;
  private edgeFrameCount: number = 0;
  private straightFrameCount: number = 0;
  private centerFrameCount: number = 0;
  private fullPalmFrameCount: number = 0;

  public analyze(
    landmarks: Landmark[] | null,
    faceLandmarks: Landmark[] | null = null,
    isMirrored: boolean = true
  ): {
    result: HandDetectionResult;
    errors: GestureErrorFeedback[];
    correction: GestureCorrectionEvent | null;
  } {
    const errors: GestureErrorFeedback[] = [];
    let correction: GestureCorrectionEvent | null = null;
    const now = performance.now();

    // =========================================================
    // 1. MOUTH-OPEN SHOOTING DETECTION & TEMPORAL STATE MACHINE
    // =========================================================
    let rawMouthRatio = 0;
    let isMouthOpen = false;
    let triggerShoot = false;

    if (faceLandmarks && faceLandmarks.length >= 292) {
      // MediaPipe FaceMesh standard landmarks:
      // 13 = upper inner lip, 14 = lower inner lip
      // 61 = left mouth corner, 291 = right mouth corner
      const upperLip = faceLandmarks[13];
      const lowerLip = faceLandmarks[14];
      const leftCorner = faceLandmarks[61];
      const rightCorner = faceLandmarks[291];

      const verticalDist = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
      const horizontalDist = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y);

      rawMouthRatio = verticalDist / Math.max(horizontalDist, 0.001);
      isMouthOpen = rawMouthRatio >= GestureDetector.MOUTH_OPEN_THRESHOLD;

      if (this.mouthState === 'CLOSED') {
        if (rawMouthRatio >= GestureDetector.MOUTH_OPEN_THRESHOLD) {
          this.mouthState = 'CONFIRMING';
          this.mouthConfirmStartTime = now;
        }
      } else if (this.mouthState === 'CONFIRMING') {
        if (rawMouthRatio < GestureDetector.MOUTH_RELEASE_THRESHOLD) {
          this.mouthState = 'CLOSED';
          this.mouthConfirmStartTime = 0;
        } else if (now - this.mouthConfirmStartTime >= GestureDetector.MOUTH_CONFIRMATION_MS) {
          triggerShoot = true;
          this.mouthState = 'LOCKED';
          this.lastMouthShotTime = now;
        }
      } else if (this.mouthState === 'LOCKED') {
        if (rawMouthRatio < GestureDetector.MOUTH_RELEASE_THRESHOLD) {
          if (now - this.lastMouthShotTime >= GestureDetector.MOUTH_POST_SHOT_DEBOUNCE_MS) {
            this.mouthState = 'CLOSED';
            this.mouthConfirmStartTime = 0;
          }
        }
      }
    } else {
      // Face temporarily out of frame: safely reset mouth state
      this.mouthState = 'CLOSED';
      this.mouthConfirmStartTime = 0;
    }

    // =========================================================
    // 2. HAND LANDMARKS & GESTURE ANALYSIS
    // =========================================================
    if (!landmarks || landmarks.length < 21) {
      this.cursorSmoother.reset();
      this.activeError = null;
      this.activeErrorType = null;
      this.bentFrameCount = 0;
      this.edgeFrameCount = 0;
      this.straightFrameCount = 0;
      this.fullPalmFrameCount = 0;

      return {
        result: {
          detected: false,
          landmarks: null,
          cursor: null,
          gesture: isMouthOpen ? 'MOUTH_SHOOT' : 'IDLE',
          pinchDistance: 1,
          isOpenPalm: false,
          isFist: false,
          isAiming: false,
          isPinch: false,
          openFingersCount: 0,
          indexFingerStraightness: 0,
          confidence: 0,
          isMouthOpen,
          mouthRatio: rawMouthRatio,
          triggerShoot,
        },
        errors: [],
        correction: null,
      };
    }

    // Mirror X coordinates for webcam view
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

    const palmScale = Math.max(getDistance2D(wrist, middleMcp), 0.05);

    // Finger extensions
    const indexExtended = isFingerExtended(indexTip, indexPip, indexMcp, wrist);
    const middleExtended = isFingerExtended(middleTip, middlePip, middleMcp, wrist);
    const ringExtended = isFingerExtended(ringTip, ringPip, ringMcp, wrist);
    const pinkyExtended = isFingerExtended(pinkyTip, pinkyPip, pinkyMcp, wrist);
    const thumbExtended = getDistance2D(thumbTip, wrist) > palmScale * 0.9;

    // Angle of index finger
    const indexAngle = calculateAngle(indexMcp, indexPip, indexTip);
    const indexStraightness = Math.max(0, Math.min(1, (indexAngle - 110) / 65));

    // Pinch distance
    const rawPinchDist = getDistance2D(thumbTip, indexTip);
    const normPinchDist = rawPinchDist / palmScale;

    // Strict count of open fingers (0 to 5)
    const openFingersCount = [indexExtended, middleExtended, ringExtended, pinkyExtended, thumbExtended].filter(Boolean).length;
    
    // Strict 5 fingers for Shield Palm
    const isOpenPalm = openFingersCount === 5 && normPinchDist > 0.45;

    const foldedCount = [!indexExtended, !middleExtended, !ringExtended, !pinkyExtended].filter(Boolean).length;
    const isFist = foldedCount >= 4 && !thumbExtended && normPinchDist < 0.6;

    // Aiming: Index pointing forward, not a fist or open palm
    const isAiming = (indexExtended || indexStraightness > 0.65) && !isOpenPalm && !isFist && openFingersCount <= 3;

    // Gesture State: Priority order: SHIELD > FIST > MOUTH_SHOOT > AIMING > IDLE
    let gesture: GestureType = 'IDLE';
    if (isOpenPalm) {
      gesture = 'SHIELD_PALM';
    } else if (isFist) {
      gesture = 'POWER_FIST';
    } else if (isMouthOpen || triggerShoot) {
      gesture = 'MOUTH_SHOOT';
    } else if (isAiming) {
      gesture = 'AIMING';
    }

    let rawCursorX = indexTip.x;
    let rawCursorY = indexTip.y;
    if (isOpenPalm) {
      rawCursorX = (middleMcp.x + wrist.x) / 2;
      rawCursorY = (middleMcp.y + wrist.y) / 2;
    }

    // Cursor follows index finger smoothly with zero influence from mouth opening
    const cursor = this.cursorSmoother.update(rawCursorX, rawCursorY);

    // =========================================================
    // 3. BIOMECHANICAL ERROR STATE MACHINE
    // =========================================================
    const isAtEdge = wrist.x < 0.1 || wrist.x > 0.9 || wrist.y < 0.08 || wrist.y > 0.92;
    const isIndexBent = isAiming && indexAngle < 142;
    const isIndexWellStraightened = isAiming && indexAngle > 165;
    const isPartialPalm = openFingersCount >= 3 && openFingersCount < 5 && !isAiming && !isFist;

    // 1. Check Index Finger Straightness Error & Resolution
    if (this.activeErrorType === 'INDEX_BENT') {
      if (isIndexWellStraightened) {
        this.straightFrameCount++;
        if (this.straightFrameCount >= 4) {
          correction = {
            id: 'bent_resolved',
            type: 'INDEX_BENT',
            resolvedMessage: 'Указательный палец выпрямлен! (+100 PTS)',
            scoreBonus: 100,
            timestamp: now,
          };
          this.lastErrorEndTime.set('INDEX_BENT', now);
          this.activeError = null;
          this.activeErrorType = null;
          this.straightFrameCount = 0;
          this.bentFrameCount = 0;
        }
      } else {
        this.straightFrameCount = 0;
      }
    } else if (!this.activeErrorType && isIndexBent) {
      const lastEnded = this.lastErrorEndTime.get('INDEX_BENT') || 0;
      if (now - lastEnded > 4000) {
        this.bentFrameCount++;
        if (this.bentFrameCount >= 6) {
          this.activeErrorType = 'INDEX_BENT';
          this.activeError = {
            id: 'index_bent',
            type: 'INDEX_BENT',
            message: `Указательный палец согнут (${Math.round(indexAngle)}°)`,
            suggestion: 'Выпрями палец жестче — лазерный прицел сбивается при изгибе',
            severity: 'warning',
            timestamp: now,
          };
          this.bentFrameCount = 0;
        }
      }
    }

    // 2. Check Shield Palm Completion
    if (this.activeErrorType === 'PALM_HALF_CLOSED') {
      if (isOpenPalm) {
        this.fullPalmFrameCount++;
        if (this.fullPalmFrameCount >= 4) {
          correction = {
            id: 'palm_resolved',
            type: 'PALM_HALF_CLOSED',
            resolvedMessage: 'Силовой щит полностью раскрыт! (+150 PTS)',
            scoreBonus: 150,
            timestamp: now,
          };
          this.lastErrorEndTime.set('PALM_HALF_CLOSED', now);
          this.activeError = null;
          this.activeErrorType = null;
          this.fullPalmFrameCount = 0;
        }
      } else {
        this.fullPalmFrameCount = 0;
      }
    } else if (!this.activeErrorType && isPartialPalm) {
      const lastEnded = this.lastErrorEndTime.get('PALM_HALF_CLOSED') || 0;
      if (now - lastEnded > 4500) {
        this.activeErrorType = 'PALM_HALF_CLOSED';
        this.activeError = {
          id: 'palm_half',
          type: 'PALM_HALF_CLOSED',
          message: `Щит не активирован (открыто ${openFingersCount} пальцев)`,
          suggestion: 'Раскрой все 5 пальцев шире и поверни ладонь к камере',
          severity: 'warning',
          timestamp: now,
        };
      }
    }

    // 3. Edge of frame warning
    if (this.activeErrorType === 'EDGE_OF_FRAME') {
      if (!isAtEdge) {
        this.centerFrameCount++;
        if (this.centerFrameCount >= 4) {
          correction = {
            id: 'center_resolved',
            type: 'EDGE_OF_FRAME',
            resolvedMessage: 'Рука возвращена в рабочую зону! (+50 PTS)',
            scoreBonus: 50,
            timestamp: now,
          };
          this.lastErrorEndTime.set('EDGE_OF_FRAME', now);
          this.activeError = null;
          this.activeErrorType = null;
          this.centerFrameCount = 0;
          this.edgeFrameCount = 0;
        }
      } else {
        this.centerFrameCount = 0;
      }
    } else if (!this.activeErrorType && isAtEdge) {
      const lastEnded = this.lastErrorEndTime.get('EDGE_OF_FRAME') || 0;
      if (now - lastEnded > 4000) {
        this.edgeFrameCount++;
        if (this.edgeFrameCount >= 6) {
          this.activeErrorType = 'EDGE_OF_FRAME';
          this.activeError = {
            id: 'edge_frame',
            type: 'EDGE_OF_FRAME',
            message: 'Рука на краю обзора камеры',
            suggestion: 'Смести руку ближе к центру для стабильного трекинга',
            severity: 'info',
            timestamp: now,
          };
          this.edgeFrameCount = 0;
        }
      }
    }

    if (this.activeError) {
      errors.push(this.activeError);
    }

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
        isPinch: false, // Pinching is decoupled from shooting
        openFingersCount,
        indexFingerStraightness: indexStraightness,
        confidence: 0.95,
        isMouthOpen,
        mouthRatio: rawMouthRatio,
        triggerShoot,
      },
      errors,
      correction,
    };
  }
}
