/**
 * 2D Force & Motion Simulator
 * Uses Newtonian mechanics with constant acceleration (F = ma).
 */

(function () {
  "use strict";

  // ── DOM References ──
  const canvas = document.getElementById("sim-canvas");
  const ctx = canvas.getContext("2d");
  const btnStart = document.getElementById("btn-start");
  const btnReset = document.getElementById("btn-reset");

  const inputs = {
    mass: document.getElementById("mass"),
    v0x: document.getElementById("v0x"),
    v0y: document.getElementById("v0y"),
    forceRight: document.getElementById("force-right"),
    forceLeft: document.getElementById("force-left"),
    forceDown: document.getElementById("force-down"),
    forceUp: document.getElementById("force-up"),
    duration: document.getElementById("duration"),
  };

  const displays = {
    netFx: document.getElementById("net-fx"),
    netFy: document.getElementById("net-fy"),
    accelX: document.getElementById("accel-x"),
    accelY: document.getElementById("accel-y"),
    velX: document.getElementById("vel-x"),
    velY: document.getElementById("vel-y"),
    speed: document.getElementById("speed"),
    direction: document.getElementById("direction"),
    posX: document.getElementById("pos-x"),
    posY: document.getElementById("pos-y"),
    elapsed: document.getElementById("elapsed"),
  };

  const massError = document.getElementById("mass-error");
  const durationError = document.getElementById("duration-error");

  // ── Simulation Constants ──
  const DT = 1 / 60; // 60 fps time step (seconds)
  const PIXELS_PER_METER = 18; // canvas scale
  const GRID_SPACING = 1; // meters between grid lines
  const OBJECT_RADIUS = 14; // pixels

  // Arrow / vector scaling (pixels per Newton or m/s or m/s²)
  const FORCE_ARROW_SCALE = 2.5;
  const VEL_VECTOR_SCALE = 8;
  const ACCEL_VECTOR_SCALE = 12;

  // ── Simulation State ──
  let running = false;
  let paused = false;
  let simTime = 0;
  let duration = 8;
  let lastTimestamp = null;

  // Initial conditions (set on Start)
  let mass = 1;
  let uX = 0;
  let uY = 0;
  let forceRight = 0;
  let forceLeft = 0;
  let forceDown = 0;
  let forceUp = 0;

  // Computed physics values (constant during a run)
  let netFx = 0;
  let netFy = 0;
  let accelX = 0;
  let accelY = 0;

  // Current kinematic state
  let posX = 0;
  let posY = 0;
  let velX = 0;
  let velY = 0;

  // Trajectory points in physics coordinates (meters)
  const trajectory = [];

  // Canvas origin in pixels (center of canvas)
  let originX = canvas.width / 2;
  let originY = canvas.height / 2;

  // ── Input Validation ──

  /**
   * Parse a numeric input; returns 0 for empty/invalid unless allowNegative.
   */
  function parseNumber(input, { min = -Infinity, max = Infinity, defaultValue = 0 } = {}) {
    const raw = input.value.trim();
    if (raw === "") return defaultValue;
    const val = parseFloat(raw);
    if (isNaN(val)) return null;
    if (val < min || val > max) return null;
    return val;
  }

  /**
   * Validate all inputs before starting simulation.
   * Returns config object or null if invalid.
   * @param {boolean} silent - if true, skip UI error messages (for live preview)
   */
  function readAndValidateInputs(silent = false) {
    if (!silent) {
      massError.textContent = "";
      durationError.textContent = "";
      inputs.mass.classList.remove("invalid");
      inputs.duration.classList.remove("invalid");
    }

    const m = parseNumber(inputs.mass, { min: 0.001 });
    const dur = parseNumber(inputs.duration, { min: 0.1 });

    let valid = true;

    if (m === null) {
      if (!silent) {
        massError.textContent = "Mass must be a positive number.";
        inputs.mass.classList.add("invalid");
      }
      valid = false;
    }

    if (dur === null) {
      if (!silent) {
        durationError.textContent = "Duration must be at least 0.1 s.";
        inputs.duration.classList.add("invalid");
      }
      valid = false;
    }

    const fRight = parseNumber(inputs.forceRight, { min: 0, defaultValue: 0 });
    const fLeft = parseNumber(inputs.forceLeft, { min: 0, defaultValue: 0 });
    const fDown = parseNumber(inputs.forceDown, { min: 0, defaultValue: 0 });
    const fUp = parseNumber(inputs.forceUp, { min: 0, defaultValue: 0 });

    if ([fRight, fLeft, fDown, fUp].some((v) => v === null)) {
      if (!silent) alert("Force magnitudes must be zero or positive numbers.");
      valid = false;
    }

    const vx0 = parseNumber(inputs.v0x);
    const vy0 = parseNumber(inputs.v0y);
    if (vx0 === null || vy0 === null) {
      if (!silent) alert("Initial velocities must be valid numbers.");
      valid = false;
    }

    if (!valid) return null;

    return {
      mass: m,
      duration: dur,
      uX: vx0,
      uY: vy0,
      forceRight: fRight,
      forceLeft: fLeft,
      forceDown: fDown,
      forceUp: fUp,
    };
  }

  // ── Physics Calculations ──

  /**
   * Compute net force and acceleration from applied forces and mass.
   * F_net,x = F_right - F_left
   * F_net,y = F_down - F_up  (positive = net force toward bottom)
   * a_x = F_net,x / m
   * a_y = (F_up - F_down) / m  (physics Y-up: upward acceleration is positive)
   */
  function computePhysics(config) {
    netFx = config.forceRight - config.forceLeft;
    netFy = config.forceDown - config.forceUp;
    accelX = netFx / config.mass;
    accelY = (config.forceUp - config.forceDown) / config.mass;
  }

  /**
   * Kinematic equations for constant acceleration:
   *   v = u + a*t
   *   s = u*t + 0.5*a*t²
   */
  function kinematicsAtTime(t) {
    velX = uX + accelX * t;
    velY = uY + accelY * t;
    posX = uX * t + 0.5 * accelX * t * t;
    posY = uY * t + 0.5 * accelY * t * t;
  }

  /** speed = sqrt(vx² + vy²) */
  function currentSpeed() {
    return Math.sqrt(velX * velX + velY * velY);
  }

  /** direction in degrees (0° = right, 90° = up) using atan2(vy, vx) */
  function directionDegrees() {
    if (currentSpeed() < 1e-6) return 0;
    return (Math.atan2(velY, velX) * 180) / Math.PI;
  }

  // ── Coordinate Conversion ──
  // Physics: X right, Y up. Canvas: X right, Y down.

  function toCanvasX(physicsX) {
    return originX + physicsX * PIXELS_PER_METER;
  }

  function toCanvasY(physicsY) {
    return originY - physicsY * PIXELS_PER_METER;
  }

  // ── Drawing Helpers ──

  function drawArrow(fromX, fromY, toX, toY, color, lineWidth = 2) {
    const headLen = 10;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  function drawGrid() {
    ctx.strokeStyle = "#1e2d3d";
    ctx.lineWidth = 1;

    const halfW = canvas.width / 2;
    const halfH = canvas.height / 2;
    const gridPx = GRID_SPACING * PIXELS_PER_METER;

    for (let x = originX % gridPx; x < canvas.width; x += gridPx) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let x = (originX % gridPx) - gridPx; x >= 0; x -= gridPx) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = originY % gridPx; y < canvas.height; y += gridPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    for (let y = (originY % gridPx) - gridPx; y >= 0; y -= gridPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "#3a5068";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(canvas.width, originY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, canvas.height);
    ctx.stroke();

    // Axis labels & scale markers
    ctx.fillStyle = "#5a7090";
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.textAlign = "center";

    const labelEvery = 2; // meters
    const maxMetersX = Math.ceil(halfW / PIXELS_PER_METER);
    const maxMetersY = Math.ceil(halfH / PIXELS_PER_METER);

    for (let m = -maxMetersX; m <= maxMetersX; m++) {
      if (m === 0) continue;
      if (m % labelEvery !== 0) continue;
      const px = toCanvasX(m);
      ctx.fillText(`${m}m`, px, originY + 16);
    }

    ctx.textAlign = "right";
    for (let m = -maxMetersY; m <= maxMetersY; m++) {
      if (m === 0) continue;
      if (m % labelEvery !== 0) continue;
      const py = toCanvasY(m);
      ctx.fillText(`${m}m`, originX - 6, py + 4);
    }

    ctx.fillStyle = "#3b9eff";
    ctx.textAlign = "left";
    ctx.fillText("X →", canvas.width - 30, originY - 8);
    ctx.textAlign = "right";
    ctx.fillText("Y ↑", originX + 24, 16);
  }

  function drawTrajectory() {
    if (trajectory.length < 2) return;

    ctx.strokeStyle = "#818cf8";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(toCanvasX(trajectory[0].x), toCanvasY(trajectory[0].y));
    for (let i = 1; i < trajectory.length; i++) {
      ctx.lineTo(toCanvasX(trajectory[i].x), toCanvasY(trajectory[i].y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawForceArrows(cx, cy) {
    const forces = [
      { mag: forceRight, dx: 1, dy: 0, color: "#ef4444", label: "R" },
      { mag: forceLeft, dx: -1, dy: 0, color: "#f97316", label: "L" },
      { mag: forceDown, dx: 0, dy: -1, color: "#a855f7", label: "D" },
      { mag: forceUp, dx: 0, dy: 1, color: "#06b6d4", label: "U" },
    ];

    forces.forEach(({ mag, dx, dy, color }) => {
      if (mag <= 0) return;
      const len = mag * FORCE_ARROW_SCALE;
      drawArrow(cx, cy, cx + dx * len, cy - dy * len, color, 2.5);
    });
  }

  function drawObject(cx, cy) {
    ctx.beginPath();
    ctx.arc(cx, cy, OBJECT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#3b9eff";
    ctx.fill();
    ctx.strokeStyle = "#5cb0ff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawVectors(cx, cy) {
    // Velocity vector (green)
    const vLen = currentSpeed() * VEL_VECTOR_SCALE;
    if (vLen > 2) {
      const vAngle = Math.atan2(-velY, velX); // canvas Y is flipped
      drawArrow(
        cx,
        cy,
        cx + vLen * Math.cos(vAngle),
        cy + vLen * Math.sin(vAngle),
        "#22c55e",
        2.5
      );
    }

    // Acceleration vector (yellow) — only if non-zero
    const aMag = Math.sqrt(accelX * accelX + accelY * accelY);
    const aLen = aMag * ACCEL_VECTOR_SCALE;
    if (aLen > 2) {
      const aAngle = Math.atan2(-accelY, accelX);
      drawArrow(
        cx,
        cy,
        cx + aLen * Math.cos(aAngle),
        cy + aLen * Math.sin(aAngle),
        "#eab308",
        2
      );
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawTrajectory();

    const cx = toCanvasX(posX);
    const cy = toCanvasY(posY);

    drawForceArrows(cx, cy);
    drawVectors(cx, cy);
    drawObject(cx, cy);
  }

  // ── Live Data Panel ──

  function updateDisplays() {
    displays.netFx.textContent = netFx.toFixed(2);
    displays.netFy.textContent = netFy.toFixed(2);
    displays.accelX.textContent = accelX.toFixed(2);
    displays.accelY.textContent = accelY.toFixed(2);
    displays.velX.textContent = velX.toFixed(2);
    displays.velY.textContent = velY.toFixed(2);
    displays.speed.textContent = currentSpeed().toFixed(2);
    displays.direction.textContent = directionDegrees().toFixed(1);
    displays.posX.textContent = posX.toFixed(2);
    displays.posY.textContent = posY.toFixed(2);
    displays.elapsed.textContent = simTime.toFixed(2);
  }

  // ── Simulation Loop ──

  function simulationStep() {
    if (!running || paused) return;

    simTime += DT;

    if (simTime >= duration) {
      simTime = duration;
      kinematicsAtTime(simTime);
      trajectory.push({ x: posX, y: posY });
      updateDisplays();
      render();
      stopSimulation();
      return;
    }

    kinematicsAtTime(simTime);
    trajectory.push({ x: posX, y: posY });
    updateDisplays();
    render();
  }

  function animationLoop(timestamp) {
    if (!running) return;

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const elapsed = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    // Accumulate fractional steps for consistent speed regardless of frame rate
    const steps = Math.min(Math.round(elapsed / DT), 4);
    for (let i = 0; i < steps; i++) {
      simulationStep();
      if (!running) break;
    }

    if (running) {
      requestAnimationFrame(animationLoop);
    }
  }

  // ── Control Functions ──

  function startSimulation() {
    if (running && !paused) return;

    if (paused) {
      paused = false;
      btnStart.textContent = "Pause";
      btnStart.classList.remove("paused");
      lastTimestamp = null;
      requestAnimationFrame(animationLoop);
      return;
    }

    const config = readAndValidateInputs();
    if (!config) return;

    mass = config.mass;
    duration = config.duration;
    uX = config.uX;
    uY = config.uY;
    forceRight = config.forceRight;
    forceLeft = config.forceLeft;
    forceDown = config.forceDown;
    forceUp = config.forceUp;

    computePhysics(config);

    simTime = 0;
    trajectory.length = 0;
    kinematicsAtTime(0);
    trajectory.push({ x: posX, y: posY });

    running = true;
    paused = false;
    lastTimestamp = null;
    btnStart.textContent = "Pause";
    btnStart.classList.remove("paused");

    setInputsDisabled(true);
    updateDisplays();
    render();
    requestAnimationFrame(animationLoop);
  }

  function pauseSimulation() {
    paused = true;
    btnStart.textContent = "Resume";
    btnStart.classList.add("paused");
  }

  function stopSimulation() {
    running = false;
    paused = false;
    lastTimestamp = null;
    btnStart.textContent = "Start";
    btnStart.classList.remove("paused");
    setInputsDisabled(false);
  }

  function resetSimulation() {
    stopSimulation();
    simTime = 0;
    posX = 0;
    posY = 0;
    velX = 0;
    velY = 0;
    netFx = 0;
    netFy = 0;
    accelX = 0;
    accelY = 0;
    trajectory.length = 0;

    // Preview physics from current inputs without starting
    const config = readAndValidateInputs(true);
    if (config) {
      computePhysics(config);
      uX = config.uX;
      uY = config.uY;
      forceRight = config.forceRight;
      forceLeft = config.forceLeft;
      forceDown = config.forceDown;
      forceUp = config.forceUp;
      velX = uX;
      velY = uY;
    }

    updateDisplays();
    render();
  }

  function setInputsDisabled(disabled) {
    Object.values(inputs).forEach((input) => {
      input.disabled = disabled;
    });
  }

  // ── Event Listeners ──

  btnStart.addEventListener("click", () => {
    if (running && !paused) {
      pauseSimulation();
    } else {
      startSimulation();
    }
  });

  btnReset.addEventListener("click", resetSimulation);

  // Clamp force inputs to non-negative on blur
  ["force-right", "force-left", "force-down", "force-up"].forEach((id) => {
    document.getElementById(id).addEventListener("blur", function () {
      const val = parseFloat(this.value);
      if (isNaN(val) || val < 0) {
        this.value = "0";
      }
    });
  });

  // Live preview of net force when inputs change (before simulation starts)
  Object.values(inputs).forEach((input) => {
    input.addEventListener("input", () => {
      if (running) return;
      const config = readAndValidateInputs(true);
      if (config) {
        computePhysics(config);
        uX = config.uX;
        uY = config.uY;
        forceRight = config.forceRight;
        forceLeft = config.forceLeft;
        forceDown = config.forceDown;
        forceUp = config.forceUp;
        velX = uX;
        velY = uY;
        posX = 0;
        posY = 0;
        updateDisplays();
        render();
      }
    });
  });

  // Handle canvas resize for responsiveness
  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const maxWidth = wrapper.clientWidth;
    if (maxWidth < canvas.width) {
      canvas.style.width = "100%";
    }
  }

  window.addEventListener("resize", resizeCanvas);

  // ── Initial Render ──
  resetSimulation();
})();
