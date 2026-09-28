import React, { useEffect, useRef, useCallback } from 'react';
import {
  HandDetectionResult,
  Target,
  EnemyProjectile,
  Particle,
  FloatingText,
  GameStats,
  GameMode,
} from '../types/game';
import { soundManager } from '../utils/audio';

interface GameCanvasProps {
  handResult: HandDetectionResult;
  gameActive: boolean;
  gameMode: GameMode;
  onStatsUpdate: (updater: (prev: GameStats) => GameStats) => void;
  onGameOver: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  handResult,
  gameActive,
  gameMode,
  onStatsUpdate,
  onGameOver,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Gameplay State inside Refs for 60fps sync
  const targetsRef = useRef<Target[]>([]);
  const projectilesRef = useRef<EnemyProjectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const lastShotTimeRef = useRef<number>(0);
  const wasPinchingRef = useRef<boolean>(false);
  const powerFistChargeRef = useRef<number>(0);
  const screenShakeRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);

  // Spawn a target
  const spawnTarget = useCallback(() => {
    const types: Target['type'][] = ['STANDARD', 'STANDARD', 'FAST', 'SHOOTER', 'GOLDEN', 'BOMB'];
    const randType = types[Math.floor(Math.random() * types.length)];

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
    const y = margin + Math.random() * (1 - 2 * margin);

    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

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
      shootCooldown: randType === 'SHOOTER' ? 2000 + Math.random() * 1500 : undefined,
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
  const shoot = useCallback(
    (cursorX: number, cursorY: number) => {
      const now = performance.now();
      if (now - lastShotTimeRef.current < 220) return; // Fire rate limit (220ms)
      lastShotTimeRef.current = now;

      soundManager.playShoot();
      screenShakeRef.current = 6;

      // Add laser muzzle particles
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
        const dist = Math.hypot(t.x - cursorX, t.y - cursorY);
        if (dist <= t.radius && !hitSomething) {
          hitSomething = true;
          t.health -= 1;

          if (t.health <= 0) {
            if (t.type === 'BOMB') {
              soundManager.playExplosion();
              createExplosion(t.x, t.y, '#ef4444', 30);
              addFloatingText('-200 PENALTY', t.x, t.y, '#ef4444', 1.2);
              onStatsUpdate((prev) => ({
                ...prev,
                shotsFired: prev.shotsFired + 1,
                bombHits: prev.bombHits + 1,
                currentCombo: 0,
                score: Math.max(0, prev.score - 200),
                accuracy: Math.round((prev.shotsHit / (prev.shotsFired + 1)) * 100),
              }));
            } else {
              let hitColor = '#06b6d4';
              if (t.type === 'FAST') hitColor = '#ec4899';
              if (t.type === 'GOLDEN') hitColor = '#facc15';
              if (t.type === 'SHOOTER') hitColor = '#f97316';

              createExplosion(t.x, t.y, hitColor, 25);

              onStatsUpdate((prev) => {
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
        onStatsUpdate((prev) => ({
          ...prev,
          shotsFired: prev.shotsFired + 1,
          currentCombo: 0,
          accuracy: Math.round((prev.shotsHit / (prev.shotsFired + 1)) * 100),
        }));
      }
    },
    [onStatsUpdate]
  );

  // Trigger Power EMP Shockwave (Curled Fist)
  const triggerEMPShockwave = useCallback(() => {
    soundManager.playPowerActivate();
    screenShakeRef.current = 15;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Destroy all non-bomb, non-golden targets
    const destroyed = targetsRef.current.filter((t) => t.type !== 'BOMB');
    const gained = destroyed.reduce((acc, t) => acc + t.points, 0);

    destroyed.forEach((t) => {
      createExplosion(t.x, t.y, '#38bdf8', 30);
    });

    targetsRef.current = targetsRef.current.filter((t) => t.type === 'BOMB');
    projectilesRef.current = []; // Wipe all enemy bullets

    addFloatingText(`⚡ EMP BLAST! +${gained}`, 0.5, 0.4, '#38bdf8', 1.8);

    onStatsUpdate((prev) => ({
      ...prev,
      score: prev.score + gained,
      targetsDestroyed: prev.targetsDestroyed + destroyed.length,
    }));
  }, [onStatsUpdate]);

  // Main Canvas Render Loop
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

      // Screen Shake offset
      ctx.save();
      if (screenShakeRef.current > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeRef.current;
        const shakeY = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(shakeX, shakeY);
        screenShakeRef.current = Math.max(0, screenShakeRef.current - dt * 0.03);
      }

      // Clear Canvas with cyber gradient
      ctx.clearRect(0, 0, width, height);

      // Handle Game Logic if playing
      if (gameActive) {
        // Target Spawning
        const maxActiveTargets = gameMode === 'DRONE_DEFENSE' ? 6 : 5;
        if (time - lastSpawnTimeRef.current > 1100 && targetsRef.current.length < maxActiveTargets) {
          spawnTarget();
          lastSpawnTimeRef.current = time;
        }

        // Gesture Action Checking: Trigger Shot on Pinch Edge
        if (handResult.detected && handResult.cursor) {
          const isPinchNow = handResult.gesture === 'PINCH_SHOOT' || (handResult.isPinch && handResult.isAiming);
          if (isPinchNow && !wasPinchingRef.current) {
            shoot(handResult.cursor.x, handResult.cursor.y);
          }
          wasPinchingRef.current = isPinchNow;

          // Power Fist Charging Check
          if (handResult.gesture === 'POWER_FIST') {
            powerFistChargeRef.current += dt;
            if (powerFistChargeRef.current >= 900) {
              triggerEMPShockwave();
              powerFistChargeRef.current = 0;
            }
          } else {
            powerFistChargeRef.current = Math.max(0, powerFistChargeRef.current - dt * 1.5);
          }

          // Shield Active Hum
          if (handResult.gesture === 'SHIELD_PALM') {
            soundManager.startShieldHum();
          } else {
            soundManager.stopShieldHum();
          }
        } else {
          wasPinchingRef.current = false;
          soundManager.stopShieldHum();
        }

        // Update Targets
        const now = performance.now();
        targetsRef.current.forEach((t) => {
          // Scale In Animation
          if (t.scale < 1.0) {
            t.scale = Math.min(1.0, t.scale + dt * 0.0035);
          }

          // Move
          t.x += t.vx * (dt / 16);
          t.y += t.vy * (dt / 16);

          // Bounce off boundaries
          if (t.x - t.radius < 0.05 || t.x + t.radius > 0.95) t.vx *= -1;
          if (t.y - t.radius < 0.05 || t.y + t.radius > 0.95) t.vy *= -1;

          // Shooter AI: shoot plasma orb at player
          if (t.type === 'SHOOTER' && t.shootCooldown !== undefined) {
            t.shootCooldown -= dt;
            if (t.shootCooldown <= 0) {
              t.shootCooldown = 2600 + Math.random() * 1200;
              // Spawn projectile towards center or hand cursor
              const targetX = handResult.cursor ? handResult.cursor.x : 0.5;
              const targetY = handResult.cursor ? handResult.cursor.y : 0.7;
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
                createdAt: now,
              });
            }
          }
        });

        // Filter expired targets
        targetsRef.current = targetsRef.current.filter((t) => now - t.createdAt < t.duration);

        // Update Projectiles (Shooter enemy attacks)
        const activeProjectiles: EnemyProjectile[] = [];
        const isShieldActive = handResult.detected && handResult.gesture === 'SHIELD_PALM' && handResult.cursor;
        const shieldX = isShieldActive ? handResult.cursor!.x : -1;
        const shieldY = isShieldActive ? handResult.cursor!.y : -1;
        const shieldRadius = 0.14;

        projectilesRef.current.forEach((p) => {
          p.x += p.vx * (dt / 16);
          p.y += p.vy * (dt / 16);

          // Check Shield Deflect
          if (isShieldActive) {
            const distToShield = Math.hypot(p.x - shieldX, p.y - shieldY);
            if (distToShield <= shieldRadius + p.radius) {
              // Deflected! Reverse velocity with boost
              soundManager.playShieldDeflect();
              p.vx = -p.vx * 2.2;
              p.vy = -p.vy * 2.2;
              createExplosion(p.x, p.y, '#10b981', 16);
              addFloatingText('🛡️ BLOCKED!', shieldX, shieldY - 0.08, '#10b981', 1.3);

              onStatsUpdate((prev) => ({
                ...prev,
                score: prev.score + 150,
                projectilesBlocked: prev.projectilesBlocked + 1,
              }));
              activeProjectiles.push(p);
              return;
            }
          }

          // Check Deflected Projectile hitting Shooter Target
          if (p.vx < 0 || p.vy < 0) {
            let hitTarget = false;
            targetsRef.current.forEach((t) => {
              if (t.type === 'SHOOTER') {
                const dist = Math.hypot(t.x - p.x, t.y - p.y);
                if (dist <= t.radius + p.radius) {
                  hitTarget = true;
                  t.health = 0;
                  soundManager.playHit(3);
                  createExplosion(t.x, t.y, '#10b981', 30);
                  addFloatingText('🎯 COUNTER HIT! +400', t.x, t.y, '#10b981', 1.4);
                  onStatsUpdate((prev) => ({
                    ...prev,
                    score: prev.score + 400,
                    targetsDestroyed: prev.targetsDestroyed + 1,
                  }));
                }
              }
            });
            if (hitTarget) return; // Projectile consumed
          }

          // Check Player Damage
          if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) {
            // Out of screen
          } else if (p.y > 0.88 && !isShieldActive) {
            // Reached player defense line
            soundManager.playExplosion();
            screenShakeRef.current = 10;
            onStatsUpdate((prev) => {
              const nextHp = Math.max(0, prev.health - p.damage);
              if (nextHp <= 0) {
                onGameOver();
              }
              return { ...prev, health: nextHp, currentCombo: 0 };
            });
            addFloatingText(`-${p.damage} HP!`, 0.5, 0.8, '#f43f5e', 1.4);
          } else {
            activeProjectiles.push(p);
          }
        });

        projectilesRef.current = activeProjectiles;
      }

      // ==========================================
      // DRAW GAME ELEMENTS
      // ==========================================

      // 1. Draw Target Drones
      targetsRef.current.forEach((t) => {
        const px = t.x * width;
        const py = t.y * height;
        const r = t.radius * Math.min(width, height) * t.scale;

        ctx.save();
        ctx.translate(px, py);

        // Rotation & Pulsing
        t.pulsePhase += dt * 0.003;
        const pulseScale = 1 + Math.sin(t.pulsePhase) * 0.08;

        if (t.type === 'STANDARD') {
          // Cyan Cyber Target
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 12;

          // Outer Ring
          ctx.beginPath();
          ctx.arc(0, 0, r * pulseScale, 0, Math.PI * 2);
          ctx.stroke();

          // Inner Crosshair
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
          ctx.fill();
          ctx.stroke();

          // Center Bullseye
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#22d3ee';
          ctx.fill();
        } else if (t.type === 'FAST') {
          // Magenta Speed Drone
          ctx.strokeStyle = '#ec4899';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#ec4899';
          ctx.shadowBlur = 15;

          // Diamond / Speed Wings
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.2);
          ctx.lineTo(r, 0);
          ctx.lineTo(0, r * 1.2);
          ctx.lineTo(-r, 0);
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = 'rgba(236, 72, 153, 0.2)';
          ctx.fill();

          // Core
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = '#f472b6';
          ctx.fill();
        } else if (t.type === 'SHOOTER') {
          // Red Combat Turret
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 16;

          // Hexagon
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
          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.fill();

          // Cannon barrel pointing down
          ctx.fillStyle = '#f87171';
          ctx.fillRect(-3, 0, 6, r * 1.1);

          // Warning indicator
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#ff0000';
          ctx.fill();
        } else if (t.type === 'GOLDEN') {
          // Golden Star / Multiplier Core
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 20;

          // 8-Point Star
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
          // Hazard Bomb
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 10;

          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fill();
          ctx.stroke();

          // Skull / Cross Danger mark
          ctx.fillStyle = '#f87171';
          ctx.font = `bold ${Math.round(r * 1.1)}px Orbitron, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✕', 0, 0);
        }

        ctx.restore();
      });

      // 2. Draw Enemy Projectiles (Fireballs / Plasma Orbs)
      projectilesRef.current.forEach((p) => {
        const px = p.x * width;
        const py = p.y * height;
        const pr = p.radius * Math.min(width, height);

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#ef4444');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = grad;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.restore();
      });

      // 3. Draw Particles (Sparks & Explosions)
      const activeParticles: Particle[] = [];
      particlesRef.current.forEach((pt) => {
        pt.life += dt;
        if (pt.life < pt.maxLife) {
          pt.x += pt.vx * (dt / 16);
          pt.y += pt.vy * (dt / 16);
          pt.alpha = 1 - pt.life / pt.maxLife;

          ctx.save();
          ctx.globalAlpha = pt.alpha;
          ctx.fillStyle = pt.color;
          ctx.shadowColor = pt.color;
          ctx.shadowBlur = 6;

          const px = pt.x * width;
          const py = pt.y * height;

          ctx.beginPath();
          ctx.arc(px, py, pt.size * pt.alpha, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          activeParticles.push(pt);
        }
      });
      particlesRef.current = activeParticles;

      // 4. Draw Floating Score / Feedback Texts
      const activeTexts: FloatingText[] = [];
      floatingTextsRef.current.forEach((ft) => {
        const elapsed = time - ft.createdAt;
        if (elapsed < 1200) {
          ft.alpha = Math.max(0, 1 - elapsed / 1200);
          ft.y -= (dt * 0.00006);

          ctx.save();
          ctx.globalAlpha = ft.alpha;
          ctx.font = `bold ${Math.round(20 * ft.scale)}px Orbitron, sans-serif`;
          ctx.fillStyle = ft.color;
          ctx.shadowColor = ft.color;
          ctx.shadowBlur = 10;
          ctx.textAlign = 'center';
          ctx.fillText(ft.text, ft.x * width, ft.y * height);
          ctx.restore();

          activeTexts.push(ft);
        }
      });
      floatingTextsRef.current = activeTexts;

      // 5. Draw Hand Controlled Reticle & Gestures
      if (handResult.detected && handResult.cursor) {
        const cx = handResult.cursor.x * width;
        const cy = handResult.cursor.y * height;

        ctx.save();

        // Check if Shield is Active
        if (handResult.gesture === 'SHIELD_PALM') {
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

          // Hexagonal Shield Pattern
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3 + time * 0.001;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * shieldRadiusPx, cy + Math.sin(a) * shieldRadiusPx);
            ctx.stroke();
          }

          // Caption
          ctx.font = 'bold 12px Orbitron, sans-serif';
          ctx.fillStyle = '#34d399';
          ctx.textAlign = 'center';
          ctx.fillText('SHIELD BARRIER ACTIVE', cx, cy + shieldRadiusPx + 20);
        }

        // Check Power Fist Charging Bar
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

        // Aiming / Reticle Sight
        let reticleColor = '#06b6d4';
        if (handResult.gesture === 'PINCH_SHOOT' || handResult.isPinch) reticleColor = '#ec4899';
        else if (handResult.gesture === 'POWER_FIST') reticleColor = '#f59e0b';
        else if (handResult.gesture === 'SHIELD_PALM') reticleColor = '#10b981';

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
        if (handResult.isAiming || handResult.gesture === 'PINCH_SHOOT') {
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
  }, [gameActive, gameMode, handResult, onGameOver, onStatsUpdate, shoot, spawnTarget, triggerEMPShockwave]);

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
