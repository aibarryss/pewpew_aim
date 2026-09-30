import React, { useEffect, useRef, useCallback } from 'react';
import {
  HandDetectionResult,
  Target,
  EnemyProjectile,
  Particle,
  FloatingText,
  GameStats,
} from '../types/game';
import { soundManager } from '../utils/audio';

interface GameCanvasProps {
  handResult: HandDetectionResult;
  gameActive: boolean;
  onStatsUpdate: (updater: (prev: GameStats) => GameStats) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  handResult,
  gameActive,
  onStatsUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Stable Refs for Props to isolate the 60fps Game Loop
  const handResultRef = useRef<HandDetectionResult>(handResult);
  handResultRef.current = handResult; // Always keep fresh synchronously
  const onStatsUpdateRef = useRef(onStatsUpdate);
  const gameActiveRef = useRef(gameActive);
  const lastKnownCursorRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const wasTriggerShootRef = useRef<boolean>(false);

  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
  }, [onStatsUpdate]);

  useEffect(() => {
    gameActiveRef.current = gameActive;
  }, [gameActive]);

  // Gameplay State inside Refs
  const targetsRef = useRef<Target[]>([]);
  const projectilesRef = useRef<EnemyProjectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const lastShotTimeRef = useRef<number>(0);
  const wasPinchingRef = useRef<boolean>(false);
  const powerFistChargeRef = useRef<number>(0);
  const screenShakeRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const lastEmpTimeRef = useRef<number>(-16000);
  const lastEmpWarningTimeRef = useRef<number>(0);
  const roundStartTimeRef = useRef<number>(0);
  const hasSpawnedFirstShooterRef = useRef<boolean>(false);

  // Reset state on game start / restart, AND on exit (stop rendering stale targets
  // when returning to the menu or hitting game-over — rendering below is unconditional
  // on gameActive, so leftover refs would otherwise stay visible on screen).
  useEffect(() => {
    targetsRef.current = [];
    projectilesRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    powerFistChargeRef.current = 0;
    wasPinchingRef.current = false;
    lastShotTimeRef.current = 0;
    lastSpawnTimeRef.current = 0;
    screenShakeRef.current = 0;
    lastEmpTimeRef.current = -16000;
    lastEmpWarningTimeRef.current = 0;
    hasSpawnedFirstShooterRef.current = false;

    if (gameActive) {
      roundStartTimeRef.current = performance.now();
    }
  }, [gameActive]);

  // Deterministic Spawn & Wave Director
  const spawnTarget = useCallback(() => {
    const elapsed = (performance.now() - roundStartTimeRef.current) / 1000;

    let randType: Target['type'] = 'STANDARD';

    if (elapsed < 10) {
      // 0–10s: Calm onboarding - only STANDARD targets
      randType = 'STANDARD';
    } else if (elapsed < 25) {
      // 10–25s: Introduce SHOOTER + STANDARD (first SHOOTER guaranteed)
      if (!hasSpawnedFirstShooterRef.current) {
        randType = 'SHOOTER';
        hasSpawnedFirstShooterRef.current = true;
      } else {
        const pool: Target['type'][] = ['STANDARD', 'STANDARD', 'SHOOTER'];
        randType = pool[Math.floor(Math.random() * pool.length)];
      }
    } else if (elapsed < 40) {
      // 25–40s: FAST + GOLDEN + BOMB + STANDARD (Cognitive choice & speed)
      const pool: Target['type'][] = ['FAST', 'FAST', 'GOLDEN', 'BOMB', 'STANDARD'];
      randType = pool[Math.floor(Math.random() * pool.length)];
    } else if (elapsed < 55) {
      // 40–55s: Threat Escalation - SHOOTER + FAST + BOMB + STANDARD
      const hasActiveShooter = targetsRef.current.some((t) => t.type === 'SHOOTER' && t.health > 0);
      if (!hasActiveShooter) {
        randType = 'SHOOTER';
      } else {
        const pool: Target['type'][] = ['SHOOTER', 'FAST', 'BOMB', 'STANDARD'];
        randType = pool[Math.floor(Math.random() * pool.length)];
      }
    } else {
      // 55–60s: Climax Rush - only GOLDEN + FAST (No new BOMB or SHOOTER)
      const pool: Target['type'][] = ['GOLDEN', 'GOLDEN', 'FAST', 'FAST'];
      randType = pool[Math.floor(Math.random() * pool.length)];
    }

    let radius = 0.055;
    let points = 100;
    let maxHealth = 1;
    let speed = 0.0008;

    if (randType === 'FAST') {
      radius = 0.04;
      points = 250;
      speed = 0.0022;
    } else if (randType === 'SHOOTER') {
      radius = 0.065;
      points = 300;
      maxHealth = 1;
      speed = 0.0006;
    } else if (randType === 'GOLDEN') {
      radius = 0.045;
      points = 500;
      speed = 0.0012;
    } else if (randType === 'BOMB') {
      radius = 0.05;
      points = -200;
      speed = 0.0007;
    }

    const margin = 0.15;
    const x = margin + Math.random() * (1 - 2 * margin);
    // Keep SHOOTER in upper region (y: 0.15 - 0.45) for natural overhead turret look
    const y = randType === 'SHOOTER'
      ? 0.15 + Math.random() * 0.30
      : margin + Math.random() * (1 - 2 * margin);

    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // First shooter starts with predictable 1.4s cooldown (~1.2-1.5s), subsequent 2.0-3.0s
    const isFirstShooterSpawn = randType === 'SHOOTER' && elapsed < 25;
    const shootCooldown = randType === 'SHOOTER'
      ? (isFirstShooterSpawn ? 1400 : 2000 + Math.random() * 1000)
      : undefined;

    const newTarget: Target = {
      id: Math.random().toString(36).substring(2, 9),
      type: randType,
      x,
      y,
      radius,
      vx,
      vy,
      maxHealth,
      health: maxHealth,
      points,
      createdAt: performance.now(),
      duration: randType === 'GOLDEN' ? 5000 : 7000,
      scale: 0.1,
      pulsePhase: Math.random() * Math.PI,
      shootCooldown,
    };

    targetsRef.current.push(newTarget);
  }, []);

  // Add floating text
  const addFloatingText = (text: string, x: number, y: number, color: string, scale: number = 1.0) => {
    floatingTextsRef.current.push({
      id: Math.random().toString(36).substring(2, 9),
      text,
      x,
      y,
      color,
      alpha: 1.0,
      createdAt: performance.now(),
      scale,
    });
  };

  // Create explosion particles
  const createExplosion = (x: number, y: number, color: string, count: number = 22) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.001 + Math.random() * 0.004;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        alpha: 1.0,
        size: 3 + Math.random() * 5,
        maxLife: 400 + Math.random() * 300,
        life: 0,
        shape: Math.random() > 0.4 ? 'spark' : 'circle',
      });
    }
  };

  // Trigger weapon shot
  const shoot = useCallback((cursorX: number, cursorY: number) => {
    const now = performance.now();
    if (now - lastShotTimeRef.current < 150) return; // Fire rate limit (150ms)
    lastShotTimeRef.current = now;

    soundManager.playShoot();
    screenShakeRef.current = 6;

    // Laser muzzle particles
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      particlesRef.current.push({
        x: cursorX,
        y: cursorY,
        vx: Math.cos(angle) * 0.002,
        vy: Math.sin(angle) * 0.002,
        color: '#ec4899',
        alpha: 0.9,
        size: 4,
        maxLife: 200,
        life: 0,
        shape: 'spark',
      });
    }

    let hitSomething = false;
    const remainingTargets: Target[] = [];

    targetsRef.current.forEach((t) => {
      if (t.health <= 0) return; // Skip already dead targets

      const dist = Math.hypot(t.x - cursorX, t.y - cursorY);
      if (dist <= t.radius && !hitSomething) {
        hitSomething = true;
        t.health -= 1;

        if (t.health <= 0) {
          if (t.type === 'BOMB') {
            soundManager.playExplosion();
            createExplosion(t.x, t.y, '#ef4444', 30);
            addFloatingText('-200 PENALTY', t.x, t.y, '#ef4444', 1.2);
            onStatsUpdateRef.current((prev) => {
              const nextTotalShots = prev.shotsFired + 1;
              return {
                ...prev,
                shotsFired: nextTotalShots,
                bombHits: prev.bombHits + 1,
                currentCombo: 0,
                score: Math.max(0, prev.score - 200),
                accuracy: Math.round((prev.shotsHit / nextTotalShots) * 100),
              };
            });
          } else {
            let hitColor = '#06b6d4';
            if (t.type === 'FAST') hitColor = '#ec4899';
            if (t.type === 'GOLDEN') hitColor = '#facc15';
            if (t.type === 'SHOOTER') hitColor = '#f97316';

            createExplosion(t.x, t.y, hitColor, 25);

            onStatsUpdateRef.current((prev) => {
              const nextCombo = prev.currentCombo + 1;
              const comboMult = Math.min(5, 1 + Math.floor(nextCombo / 3) * 0.5);
              const gainedScore = Math.round(t.points * comboMult);
              const nextHitCount = prev.shotsHit + 1;
              const nextTotalShots = prev.shotsFired + 1;

              soundManager.playHit(nextCombo);
              if (nextCombo > 1 && nextCombo % 5 === 0) {
                soundManager.playComboUp();
                addFloatingText(`🔥 COMBO x${nextCombo}!`, cursorX, cursorY - 0.06, '#facc15', 1.4);
              } else {
                addFloatingText(`+${gainedScore}`, cursorX, cursorY, hitColor, 1.1);
              }

              return {
                ...prev,
                score: prev.score + gainedScore,
                shotsFired: nextTotalShots,
                shotsHit: nextHitCount,
                targetsDestroyed: prev.targetsDestroyed + 1,
                currentCombo: nextCombo,
                maxCombo: Math.max(prev.maxCombo, nextCombo),
                accuracy: Math.round((nextHitCount / nextTotalShots) * 100),
              };
            });
          }
        } else {
          remainingTargets.push(t);
        }
      } else {
        remainingTargets.push(t);
      }
    });

    targetsRef.current = remainingTargets;

    if (!hitSomething) {
      addFloatingText('MISS', cursorX, cursorY, '#94a3b8', 0.8);
      onStatsUpdateRef.current((prev) => {
        const nextTotalShots = prev.shotsFired + 1;
        return {
          ...prev,
          shotsFired: nextTotalShots,
          currentCombo: 0,
          accuracy: Math.round((prev.shotsHit / nextTotalShots) * 100),
        };
      });
    }
  }, []);

  // Trigger Power EMP Shockwave (Curled Fist)
  const triggerEMPShockwave = useCallback(() => {
    lastEmpTimeRef.current = performance.now();
    soundManager.playPowerActivate();
    screenShakeRef.current = 15;

    const destroyed = targetsRef.current.filter((t) => t.type !== 'BOMB' && t.health > 0);
    const gained = Math.round(destroyed.reduce((acc, t) => acc + t.points, 0) * 0.5);

    destroyed.forEach((t) => {
      createExplosion(t.x, t.y, '#38bdf8', 30);
    });

    targetsRef.current = targetsRef.current.filter((t) => t.type === 'BOMB' && t.health > 0);
    projectilesRef.current = []; // Wipe all enemy bullets

    addFloatingText(`⚡ EMP BLAST! +${gained}`, 0.5, 0.4, '#38bdf8', 1.8);

    onStatsUpdateRef.current((prev) => ({
      ...prev,
      score: prev.score + gained,
      targetsDestroyed: prev.targetsDestroyed + destroyed.length,
    }));
  }, []);

  // Clean, Isolated Game Loop Effect (Runs at 60 FPS without tearing down)
  useEffect(() => {
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(time - lastTime, 64);
      lastTime = time;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const curHand = handResultRef.current;

      // Screen Shake offset
      ctx.save();
      if (screenShakeRef.current > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeRef.current;
        const shakeY = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(shakeX, shakeY);
        screenShakeRef.current = Math.max(0, screenShakeRef.current - dt * 0.03);
      }

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // Handle Game Logic if playing
      if (gameActiveRef.current) {
        const now = performance.now();
        const elapsedRoundTime = (now - roundStartTimeRef.current) / 1000;

        // Target Spawning with gentle ramp-up
        const maxActiveTargets = 6;
        const spawnInterval = elapsedRoundTime > 40 ? 950 : 1150;

        if (time - lastSpawnTimeRef.current > spawnInterval && targetsRef.current.length < maxActiveTargets) {
          spawnTarget();
          lastSpawnTimeRef.current = time;
        }

        // Action: Shoot on Mouth Open Trigger (confirmed 1-shot per opening)
        if (curHand.cursor) {
          lastKnownCursorRef.current = curHand.cursor;
        }

        if (curHand.triggerShoot && !wasTriggerShootRef.current) {
          const aimX = curHand.cursor ? curHand.cursor.x : lastKnownCursorRef.current.x;
          const aimY = curHand.cursor ? curHand.cursor.y : lastKnownCursorRef.current.y;
          shoot(aimX, aimY);
        }
        wasTriggerShootRef.current = !!curHand.triggerShoot;

        // Power Fist Charging Check with 16s cooldown
        if (curHand.detected && curHand.cursor) {
          if (curHand.gesture === 'POWER_FIST') {
            if (time - lastEmpTimeRef.current < 16000) {
              powerFistChargeRef.current = 0;
              if (time - lastEmpWarningTimeRef.current >= 1000) {
                lastEmpWarningTimeRef.current = time;
                addFloatingText('EMP RECHARGING', curHand.cursor.x, curHand.cursor.y - 0.08, '#f59e0b', 1.0);
              }
            } else {
              powerFistChargeRef.current += dt;
              if (powerFistChargeRef.current >= 900) {
                triggerEMPShockwave();
                powerFistChargeRef.current = 0;
              }
            }
          } else {
            powerFistChargeRef.current = Math.max(0, powerFistChargeRef.current - dt * 1.5);
          }

          // Shield Active Hum
          if (curHand.gesture === 'SHIELD_PALM') {
            soundManager.startShieldHum();
          } else {
            soundManager.stopShieldHum();
          }
        } else {
          wasPinchingRef.current = false;
          soundManager.stopShieldHum();
        }

        // Update Targets
        targetsRef.current.forEach((t) => {
          if (t.health <= 0) return;

          if (t.scale < 1.0) {
            t.scale = Math.min(1.0, t.scale + dt * 0.0035);
          }

          // Move
          t.x += t.vx * (dt / 16);
          t.y += t.vy * (dt / 16);

          // Bounce off boundaries
          if (t.x - t.radius < 0.05 || t.x + t.radius > 0.95) t.vx *= -1;
          if (t.y - t.radius < 0.05 || t.y + t.radius > 0.95) t.vy *= -1;

          // Shooter AI: shoot plasma orb at player defense zone (y=1.0)
          if (t.type === 'SHOOTER' && t.shootCooldown !== undefined) {
            t.shootCooldown -= dt;
            if (t.shootCooldown <= 0) {
              t.shootCooldown = 2600 + Math.random() * 1200;
              const targetX = curHand.cursor?.x ?? 0.5;
              const targetY = 1.0;
              const angle = Math.atan2(targetY - t.y, targetX - t.x);
              const pSpeed = 0.0016;

              projectilesRef.current.push({
                id: Math.random().toString(36).substring(2, 9),
                x: t.x,
                y: t.y,
                vx: Math.cos(angle) * pSpeed,
                vy: Math.sin(angle) * pSpeed,
                radius: 0.02,
                damage: 20,
                deflected: false,
                createdAt: now,
              });
            }
          }
        });

        // Filter expired and dead targets
        targetsRef.current = targetsRef.current.filter((t) => t.health > 0 && now - t.createdAt < t.duration);

        // Update Projectiles
        const activeProjectiles: EnemyProjectile[] = [];
        const isShieldActive = curHand.detected && curHand.gesture === 'SHIELD_PALM' && curHand.cursor;
        const shieldX = isShieldActive ? curHand.cursor!.x : -1;
        const shieldY = isShieldActive ? curHand.cursor!.y : -1;
        const shieldRadius = 0.14;

        projectilesRef.current.forEach((p) => {
          p.x += p.vx * (dt / 16);
          p.y += p.vy * (dt / 16);

          // Check Shield Deflect (only if not already deflected)
          if (isShieldActive && !p.deflected) {
            const distToShield = Math.hypot(p.x - shieldX, p.y - shieldY);
            if (distToShield <= shieldRadius + p.radius) {
              soundManager.playShieldDeflect();
              p.deflected = true;

              // Aim deflected projectile toward active SHOOTER or upward away from player
              let targetShooter: Target | null = null;
              let minDist = Infinity;
              targetsRef.current.forEach((t) => {
                if (t.type === 'SHOOTER' && t.health > 0) {
                  const d = Math.hypot(t.x - p.x, t.y - p.y);
                  if (d < minDist) {
                    minDist = d;
                    targetShooter = t;
                  }
                }
              });

              if (targetShooter) {
                const angle = Math.atan2((targetShooter as Target).y - p.y, (targetShooter as Target).x - p.x);
                const returnSpeed = 0.0032;
                p.vx = Math.cos(angle) * returnSpeed;
                p.vy = Math.sin(angle) * returnSpeed;
              } else {
                p.vx = -p.vx * 1.5;
                p.vy = -Math.abs(p.vy) * 1.5;
              }

              createExplosion(p.x, p.y, '#10b981', 16);
              addFloatingText('🛡️ BLOCKED!', shieldX, shieldY - 0.08, '#10b981', 1.3);

              onStatsUpdateRef.current((prev) => ({
                ...prev,
                score: prev.score + 150,
                projectilesBlocked: prev.projectilesBlocked + 1,
              }));
              activeProjectiles.push(p);
              return;
            }
          }

          // Check Deflected Projectile hitting Shooter Target (Counter Hit)
          if (p.deflected) {
            let hitTarget = false;
            targetsRef.current.forEach((t) => {
              if (t.type === 'SHOOTER' && t.health > 0 && !hitTarget) {
                const dist = Math.hypot(t.x - p.x, t.y - p.y);
                if (dist <= t.radius + p.radius) {
                  hitTarget = true;
                  t.health = 0;
                  soundManager.playHit(3);
                  createExplosion(t.x, t.y, '#10b981', 30);
                  addFloatingText('🎯 COUNTER HIT! +400', t.x, t.y, '#10b981', 1.4);
                  onStatsUpdateRef.current((prev) => ({
                    ...prev,
                    score: prev.score + 400,
                    targetsDestroyed: prev.targetsDestroyed + 1,
                  }));
                }
              }
            });
            if (hitTarget) {
              // Immediately purge the destroyed target and consume the projectile
              targetsRef.current = targetsRef.current.filter((t) => t.health > 0);
              return;
            }
          }

          // Check Player Damage or Offscreen
          if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) {
            // Out of screen -> removed
          } else if (p.y > 0.88 && !p.deflected && !isShieldActive) {
            soundManager.playExplosion();
            screenShakeRef.current = 10;
            onStatsUpdateRef.current((prev) => {
              if (prev.health <= 0) return prev;
              const nextHp = Math.max(0, prev.health - p.damage);
              return { ...prev, health: nextHp, currentCombo: 0 };
            });
            addFloatingText(`-${p.damage} HP!`, 0.5, 0.8, '#f43f5e', 1.4);
          } else {
            activeProjectiles.push(p);
          }
        });

        projectilesRef.current = activeProjectiles;
      }

      // Update Particles
      particlesRef.current.forEach((p) => {
        p.life += dt;
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.alpha = Math.max(0, 1.0 - p.life / p.maxLife);
      });
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife);

      // Update Floating Texts
      const now = performance.now();
      floatingTextsRef.current.forEach((ft) => {
        ft.y -= 0.0006 * (dt / 16);
        const age = now - ft.createdAt;
        ft.alpha = Math.max(0, 1.0 - age / 1200);
      });
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => now - ft.createdAt < 1200);

      // ==========================================
      // RENDER CANVAS OBJECTS
      // ==========================================

      // 1. Render Targets (only live targets)
      targetsRef.current.forEach((t) => {
        if (t.health <= 0) return;

        const tx = t.x * width;
        const ty = t.y * height;
        const r = t.radius * Math.min(width, height) * t.scale;

        ctx.save();
        ctx.translate(tx, ty);

        if (t.type === 'STANDARD') {
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 12;

          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = '#22d3ee';
          ctx.fill();
        } else if (t.type === 'FAST') {
          ctx.strokeStyle = '#ec4899';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#ec4899';
          ctx.shadowBlur = 15;

          ctx.beginPath();
          ctx.moveTo(0, -r * 1.2);
          ctx.lineTo(r, 0);
          ctx.lineTo(0, r * 1.2);
          ctx.lineTo(-r, 0);
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = 'rgba(236, 72, 153, 0.2)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = '#f472b6';
          ctx.fill();
        } else if (t.type === 'SHOOTER') {
          // Visual charging telegraph during ~1s before shooting
          const isCharging = typeof t.shootCooldown === 'number' && t.shootCooldown <= 1000;
          const chargeProgress = typeof t.shootCooldown === 'number' && isCharging 
            ? Math.max(0, 1.0 - t.shootCooldown / 1000) 
            : 0;

          ctx.strokeStyle = isCharging ? '#ff3344' : '#ef4444';
          ctx.lineWidth = isCharging ? 3.5 + chargeProgress * 2.5 : 3.5;
          ctx.shadowColor = isCharging ? '#ff0033' : '#ef4444';
          ctx.shadowBlur = isCharging ? 16 + chargeProgress * 20 : 16;

          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const hx = Math.cos(angle) * r;
            const hy = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = isCharging
            ? `rgba(255, 40, 40, ${0.25 + chargeProgress * 0.35})`
            : 'rgba(239, 68, 68, 0.25)';
          ctx.fill();

          // Barrel / muzzle aiming down
          ctx.fillStyle = isCharging ? '#ff5555' : '#f87171';
          ctx.fillRect(-3, 0, 6, r * 1.1 + (isCharging ? chargeProgress * 4 : 0));

          // Core plasma node (pulsing when charging)
          const coreRadius = isCharging
            ? 5 + Math.sin(time * 0.02) * 2 + chargeProgress * 4
            : 5;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(2, coreRadius), 0, Math.PI * 2);
          ctx.fillStyle = isCharging ? '#ffffff' : '#ff0000';
          ctx.shadowColor = '#ff0044';
          ctx.shadowBlur = isCharging ? 25 : 10;
          ctx.fill();

          // Charging warning ring when close to firing
          if (isCharging) {
            ctx.beginPath();
            ctx.arc(0, 0, r * (1.15 + Math.sin(time * 0.025) * 0.15), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 60, 60, ${0.4 + chargeProgress * 0.6})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (t.type === 'GOLDEN') {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 20;

          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4 + t.pulsePhase;
            const dist = i % 2 === 0 ? r * 1.1 : r * 0.5;
            const sx = Math.cos(angle) * dist;
            const sy = Math.sin(angle) * dist;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
          ctx.fill();
          ctx.stroke();
        } else if (t.type === 'BOMB') {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 10;

          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
          ctx.fill();
          ctx.stroke();

          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = '#fca5a5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💣', 0, 0);
        }

        ctx.restore();
      });

      // 2. Render Enemy Projectiles
      projectilesRef.current.forEach((p) => {
        const px = p.x * width;
        const py = p.y * height;
        const pr = p.radius * Math.min(width, height);

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = p.deflected ? '#34d399' : '#f43f5e';
        ctx.shadowColor = p.deflected ? '#10b981' : '#e11d48';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.restore();
      });

      // 3. Render Particles
      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        if (p.shape === 'spark') {
          ctx.rect(p.x * width - p.size / 2, p.y * height - p.size / 2, p.size * 1.5, p.size * 1.5);
        } else {
          ctx.arc(p.x * width, p.y * height, p.size, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      });

      // 4. Render Floating Texts
      floatingTextsRef.current.forEach((ft) => {
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.font = `bold ${Math.round(18 * ft.scale)}px Orbitron, sans-serif`;
        ctx.fillStyle = ft.color;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x * width, ft.y * height);
        ctx.restore();
      });

      // 5. Render Player Reticle & Shield
      if (curHand.detected && curHand.cursor) {
        const cx = curHand.cursor.x * width;
        const cy = curHand.cursor.y * height;

        ctx.save();

        // Check Shield Palm Barrier
        if (curHand.gesture === 'SHIELD_PALM') {
          const shieldRadiusPx = 0.14 * Math.min(width, height);
          ctx.beginPath();
          ctx.arc(cx, cy, shieldRadiusPx, 0, Math.PI * 2);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 4;
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 25;
          ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.fill();
          ctx.stroke();

          ctx.lineWidth = 1.5;
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3 + time * 0.001;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * shieldRadiusPx, cy + Math.sin(a) * shieldRadiusPx);
            ctx.stroke();
          }

          ctx.font = 'bold 12px Orbitron, sans-serif';
          ctx.fillStyle = '#34d399';
          ctx.textAlign = 'center';
          ctx.fillText('SHIELD BARRIER ACTIVE', cx, cy + shieldRadiusPx + 20);
        }

        // Power Fist Charging Bar
        if (powerFistChargeRef.current > 0) {
          const chargeProgress = Math.min(1.0, powerFistChargeRef.current / 900);
          ctx.beginPath();
          ctx.arc(cx, cy, 45, -Math.PI / 2, -Math.PI / 2 + chargeProgress * Math.PI * 2);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 5;
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 15;
          ctx.stroke();

          ctx.font = 'bold 11px Orbitron, sans-serif';
          ctx.fillStyle = '#fbbf24';
          ctx.textAlign = 'center';
          ctx.fillText(`EMP CHARGE ${Math.round(chargeProgress * 100)}%`, cx, cy - 55);
        }

        // Reticle Sight
        let reticleColor = '#06b6d4';
        if (curHand.gesture === 'MOUTH_SHOOT' || curHand.isMouthOpen) reticleColor = '#ec4899';
        else if (curHand.gesture === 'POWER_FIST') reticleColor = '#f59e0b';
        else if (curHand.gesture === 'SHIELD_PALM') reticleColor = '#10b981';

        ctx.strokeStyle = reticleColor;
        ctx.shadowColor = reticleColor;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2.5;

        // Outer Reticle Ring
        ctx.beginPath();
        ctx.arc(cx, cy, 26, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs
        const crossLen = 14;
        ctx.beginPath();
        ctx.moveTo(cx - 26 - crossLen, cy);
        ctx.lineTo(cx - 26, cy);
        ctx.moveTo(cx + 26, cy);
        ctx.lineTo(cx + 26 + crossLen, cy);
        ctx.moveTo(cx, cy - 26 - crossLen);
        ctx.lineTo(cx, cy - 26);
        ctx.moveTo(cx, cy + 26);
        ctx.lineTo(cx, cy + 26 + crossLen);
        ctx.stroke();

        // Center Laser Dot
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = reticleColor;
        ctx.fill();

        // Laser beam guide if aiming
        if (curHand.isAiming || curHand.gesture === 'MOUTH_SHOOT') {
          ctx.beginPath();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
          ctx.moveTo(cx, height);
          ctx.lineTo(cx, cy);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      }

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [spawnTarget, shoot, triggerEMPShockwave]);

  // Handle Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full cursor-none pointer-events-none z-10"
    />
  );
};
