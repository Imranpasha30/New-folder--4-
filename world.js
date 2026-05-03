// world.js — Three.js scene + Cannon-es physics + car + zones
// Bruno Simon style synthwave 3D portfolio for Imran Pasha

(function bootstrap() {
  // THREE is loaded as an ESM module that exposes window.THREE on `three-ready` event.
  // CANNON is a synchronous UMD global. Wait for both before running.
  if (!window.THREE || !window.PP) {
    window.addEventListener('three-ready', bootstrap, { once: true });
    return;
  }
  if (!window.CANNON) {
    console.error('CANNON missing');
    return;
  }
  const THREE = window.THREE;
  const CANNON = window.CANNON;

  // Colors
  const COL = { pink: 0xff3e8a, purple: 0x8a3eff, cyan: 0x5ce5ff, yellow: 0xffe066, red: 0xc63030, dark: 0x1d1a2e };

  // ─────────────── SOUND MANAGER (Web Audio, procedural — no asset downloads) ───────────────
  const Sound = (function () {
    let ctx = null, master = null, muted = false;
    let engineOsc = null, engineSubOsc = null, engineGain = null, engineFilter = null;
    let lastJump = 0, lastHonk = 0, lastCrash = 0;

    const MASTER_VOL = 0.30;     // dropped from 0.6 — was harsh
    function unlock() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER_VOL;
      // Master lowpass to roll off harsh top-end across ALL sounds
      const masterLP = ctx.createBiquadFilter();
      masterLP.type = 'lowpass';
      masterLP.frequency.value = 4500;
      masterLP.Q.value = 0.4;
      master.connect(masterLP).connect(ctx.destination);
    }

    function ensure() { if (!ctx) unlock(); return !!ctx; }

    function setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : MASTER_VOL;
    }

    function startEngine() {
      if (!ensure() || engineOsc) return;
      // Soft triangle wave + sub-octave sine for a deep purr (was harsh sawtooth)
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'triangle';
      engineOsc.frequency.value = 60;
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.value = 30;            // sub-octave fundamental
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;     // very dark
      engineFilter.Q.value = 1.2;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter);
      subOsc.connect(engineFilter);
      engineFilter.connect(engineGain).connect(master);
      engineOsc.start(); subOsc.start();
      engineSubOsc = subOsc;
    }

    function updateEngine(speed, throttle) {
      if (!engineOsc) return;
      const t = ctx.currentTime;
      // Lower frequency range (30-100 Hz fundamental — was 80-410)
      const targetFreq = 50 + Math.min(speed, 24) * 5;
      engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.10);
      if (engineSubOsc) engineSubOsc.frequency.setTargetAtTime(targetFreq * 0.5, t, 0.10);
      const targetGain = 0.025 + Math.min(Math.abs(throttle), 1) * 0.06 + Math.min(speed / 24, 1) * 0.03;
      engineGain.gain.setTargetAtTime(targetGain, t, 0.15);
      engineFilter.frequency.setTargetAtTime(280 + Math.min(speed, 24) * 30, t, 0.12);
    }

    function thunder() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      // Long rumbling noise pass with heavy lowpass
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(2.0);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(180, t);
      filt.frequency.exponentialRampToValueAtTime(60, t + 1.8);
      filt.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.05);    // sharp crack
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.35); // settle
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.95);// long rumble out
      src.connect(filt).connect(g).connect(master);
      src.start(t); src.stop(t + 2.0);
    }

    function noiseBuffer(duration) {
      const len = Math.floor(ctx.sampleRate * duration);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    }

    function jump() {
      if (!ensure()) return;
      const now = performance.now();
      if (now - lastJump < 250) return;
      lastJump = now;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.25);
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(800, t);
      filt.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
      filt.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(filt).connect(g).connect(master);
      src.start(t); src.stop(t + 0.26);
    }

    function crash(impulse) {
      if (!ensure()) return;
      const now = performance.now();
      if (now - lastCrash < 60) return;
      lastCrash = now;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.35);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1800;
      const g = ctx.createGain();
      const peak = Math.min(0.55, 0.15 + impulse * 0.08);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      src.connect(filt).connect(g).connect(master);
      src.start(t); src.stop(t + 0.36);
    }

    function click() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = 880;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.11);
    }

    function honk() {
      if (!ensure()) return;
      const now = performance.now();
      if (now - lastHonk < 200) return;
      lastHonk = now;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'square'; o.frequency.value = 220;
      const o2 = ctx.createOscillator();
      o2.type = 'square'; o2.frequency.value = 277;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.setValueAtTime(0.22, t + 0.32);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
      o.connect(g); o2.connect(g); g.connect(master);
      o.start(t); o2.start(t); o.stop(t + 0.41); o2.stop(t + 0.41);
    }

    let ambientStarted = false;
    function startAmbient() {
      if (!ensure() || ambientStarted) return;
      ambientStarted = true;
      // SPACE AMBIENT — very low ethereal drone with a slow shimmer overhead.
      // Soft, warm, breathing — designed not to fatigue the ears.
      const padGain = ctx.createGain();
      padGain.gain.value = 0.05;
      // Slow LFO modulating the master pad gain → "breathing" feel
      const breathLfo = ctx.createOscillator();
      breathLfo.frequency.value = 0.07;
      const breathDepth = ctx.createGain();
      breathDepth.gain.value = 0.018;
      breathLfo.connect(breathDepth).connect(padGain.gain);
      breathLfo.start();
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 700;
      padFilter.Q.value = 0.5;
      padGain.connect(padFilter).connect(master);
      // Layer 1: deep sub bass + perfect-fifth — like a stretched cosmic chord
      const layers = [
        { type: 'sine',     freq: 55,  detune: 0,   gain: 0.40 },   // A1 — sub
        { type: 'sine',     freq: 82.5, detune: 0,  gain: 0.28 },   // E2
        { type: 'sine',     freq: 110, detune: 5,   gain: 0.22 },   // A2
        { type: 'sine',     freq: 165, detune: -5,  gain: 0.16 },   // E3
        { type: 'triangle', freq: 220, detune: 8,   gain: 0.08 },   // A3 — soft shimmer
      ];
      for (const layer of layers) {
        const o = ctx.createOscillator();
        o.type = layer.type;
        o.frequency.value = layer.freq;
        o.detune.value = layer.detune;
        const lg = ctx.createGain();
        lg.gain.value = layer.gain;
        // Slow detune wander for "stars drifting" quality
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.04 + Math.random() * 0.08;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 8;
        lfo.connect(lfoDepth).connect(o.detune);
        lfo.start();
        o.connect(lg).connect(padGain);
        o.start();
      }
    }

    return { unlock, setMuted, startEngine, updateEngine, jump, crash, click, honk, thunder, startAmbient, isMuted: () => muted };
  })();
  window.imranSound = Sound;

  // ─────────────── BOOT ───────────────
  const container = document.getElementById('world');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  // Cap pixel ratio at 1.5 — caps GPU work on retina/4K (was 2 = 4x more pixels)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;     // sunset is naturally bright
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Sunset palette — warm peach sky (was deep purple synthwave night)
  scene.background = new THREE.Color(0xffb070);
  scene.fog = new THREE.Fog(0xffc79a, 80, 320);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 600);
  camera.position.set(0, 8, 16);
  camera.lookAt(0, 0, 0);

  // Bloom post-processing — only true emissives bloom (sunset sky shouldn't)
  const { EffectComposer, RenderPass, UnrealBloomPass } = window.PP;
  const composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.35,   // strength (further reduced for performance)
    0.40,   // radius (smaller halo = less per-pixel work)
    0.92    // threshold (only true emissives bloom)
  );
  composer.addPass(bloom);
  let useBloom = true;

  // ─────────────── PHYSICS WORLD ───────────────
  const world = new CANNON.World();
  world.gravity.set(0, -22, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  const groundMat = new CANNON.Material('ground');
  const wheelMat = new CANNON.Material('wheel');
  const bodyMat = new CANNON.Material('body');
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, wheelMat, { friction: 0.6, restitution: 0.2 }));
  // Low chassis-ground friction so the driving force (1400 N) decisively beats
  // static friction. With gravity -22 and mass 240, friction force = mu * 240 * 22.
  // mu = 0.05 → 264 N (driving force easily overcomes it).
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, bodyMat, { friction: 0.0, restitution: 0.2 }));

  // ─────────────── LIGHTS (golden-hour sunset) ───────────────
  // Hemisphere sky→ground bounce — replaces flat ambient, adds warm color flow
  scene.add(new THREE.HemisphereLight(0xffc79a, 0x7a5a48, 0.55));
  // Residual ambient warm fill
  scene.add(new THREE.AmbientLight(0xffe0bc, 0.15));
  // Sun (low, warm, golden raking light) — replaces moon
  const moon = new THREE.DirectionalLight(0xffc890, 1.6);
  moon.position.set(40, 28, 30);          // low golden-hour angle from south-east
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);     // half-resolution shadow map for perf
  moon.shadow.camera.left = -120; moon.shadow.camera.right = 120;
  moon.shadow.camera.top = 120; moon.shadow.camera.bottom = -120;
  moon.shadow.camera.far = 200;
  moon.shadow.bias = -0.0005;
  moon.shadow.radius = 6;
  scene.add(moon);
  // Neon accent point lights (still pop on warm sky)
  const rimPink = new THREE.PointLight(COL.pink, 1.2, 80, 2);
  rimPink.position.set(0, 14, 30); scene.add(rimPink);              // over project billboard
  const rimCyan = new THREE.PointLight(COL.cyan, 1.0, 70, 2);
  rimCyan.position.set(32, 14, 32); scene.add(rimCyan);             // over loop-the-loop
  const rimPurple = new THREE.PointLight(COL.purple, 1.1, 80, 2);
  rimPurple.position.set(22, 14, -16); scene.add(rimPurple);        // over skills cluster

  // ─────────────── GROUND + GRID ───────────────
  const groundGeo = new THREE.PlaneGeometry(400, 400);
  // Sunset palette — sandy beige (was near-black synthwave)
  const groundMatT = new THREE.MeshStandardMaterial({ color: 0xe8c290, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(groundGeo, groundMatT);
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

  // Gridlines — keep Tron-purple grid as cybersecurity flag, soften for warm ground
  const grid = new THREE.GridHelper(400, 80, 0x8a3eff, 0xc49ee6);
  grid.material.transparent = true; grid.material.opacity = 0.28;
  grid.position.y = 0.01;
  scene.add(grid);

  // X markers as little glowing pluses
  const markerGroup = new THREE.Group();
  const markerMat = new THREE.MeshBasicMaterial({ color: COL.pink });
  const xGeo1 = new THREE.PlaneGeometry(0.5, 0.08);
  const xGeo2 = new THREE.PlaneGeometry(0.08, 0.5);
  for (let x = -180; x <= 180; x += 10) {
    for (let z = -180; z <= 180; z += 10) {
      const g = new THREE.Group();
      const a = new THREE.Mesh(xGeo1, markerMat);
      const b = new THREE.Mesh(xGeo2, markerMat);
      g.add(a); g.add(b);
      g.rotation.x = -Math.PI/2;
      g.position.set(x, 0.02, z);
      markerGroup.add(g);
    }
  }
  scene.add(markerGroup);

  // ─────────────── ROADS (grid network — purely visual) ───────────────
  // The car can drive anywhere on the ground; roads are visual guides
  // that connect the zones and give the world structure.
  const roadGroup = new THREE.Group();
  const ROAD_W = 5;
  const ROAD_LEN = 100;
  // Sunset palette: warm charcoal asphalt, yellow lane stripes (read as road), warm orange edges
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x3e3848, roughness: 0.92, metalness: 0.05,
    emissive: 0x1a1228, emissiveIntensity: 0.04,
  });
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xff8e5c, transparent: true, opacity: 0.55 });

  // Grid coordinates aligned with existing zones
  const ROADS_NS_X = [-32, -22, -12, 0, 12, 22, 32];        // north-south streets (run along Z)
  const ROADS_EW_Z = [-32, -22, -12, 0, 12, 22, 32, 38];    // east-west avenues (run along X)

  function addRoadStrip(isNS, x, z, len) {
    const w = ROAD_W;
    // Asphalt
    const r = new THREE.Mesh(
      isNS ? new THREE.PlaneGeometry(w, len) : new THREE.PlaneGeometry(len, w),
      asphaltMat
    );
    r.rotation.x = -Math.PI/2;
    r.position.set(x, 0.02, z);
    r.receiveShadow = true;
    roadGroup.add(r);
    // Center dashed lane markers (pink dashes)
    const dashCount = Math.floor(len / 4);
    for (let i = 0; i < dashCount; i++) {
      const t = -len/2 + 2 + i * 4;
      const dash = new THREE.Mesh(
        isNS ? new THREE.PlaneGeometry(0.25, 1.6) : new THREE.PlaneGeometry(1.6, 0.25),
        laneMat
      );
      dash.rotation.x = -Math.PI/2;
      dash.position.set(isNS ? x : x + t, 0.04, isNS ? z + t : z);
      roadGroup.add(dash);
    }
    // Cyan edge lines on both sides
    for (const off of [-w/2 + 0.12, w/2 - 0.12]) {
      const edge = new THREE.Mesh(
        isNS ? new THREE.PlaneGeometry(0.12, len) : new THREE.PlaneGeometry(len, 0.12),
        edgeMat
      );
      edge.rotation.x = -Math.PI/2;
      edge.position.set(isNS ? x + off : x, 0.03, isNS ? z : z + off);
      roadGroup.add(edge);
    }
  }

  // North-South streets
  for (const x of ROADS_NS_X) addRoadStrip(true, x, 0, ROAD_LEN);
  // East-West avenues
  for (const z of ROADS_EW_Z) addRoadStrip(false, 0, z, ROAD_LEN);

  // Intersection accents — small glowing pads where main roads cross
  const interMat = new THREE.MeshBasicMaterial({ color: COL.purple, transparent: true, opacity: 0.4 });
  for (const x of [-22, 0, 22]) {
    for (const z of [-22, 0, 22]) {
      const inter = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), interMat);
      inter.rotation.x = -Math.PI/2;
      inter.position.set(x, 0.05, z);
      roadGroup.add(inter);
    }
  }

  scene.add(roadGroup);

  // ─────────────── CLOUDS (drifting puffs in the sky) ───────────────
  // Each cloud is a small group of overlapping spheres. Cheap, soft, low draw cost.
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xfff3e8, roughness: 1.0, metalness: 0,
    emissive: 0xffd9b8, emissiveIntensity: 0.18,
    transparent: true, opacity: 0.92,
  });
  const clouds = [];
  function addCloud(x, y, z, scale = 1) {
    const g = new THREE.Group();
    const puffs = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < puffs; i++) {
      const r = (1.5 + Math.random() * 1.2) * scale;
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), cloudMat);
      p.position.set((Math.random() - 0.5) * 4 * scale, (Math.random() - 0.5) * 1.2 * scale, (Math.random() - 0.5) * 4 * scale);
      g.add(p);
    }
    g.position.set(x, y, z);
    cloudGroup.add(g);
    clouds.push({ group: g, driftSpeed: 0.4 + Math.random() * 0.6, baseY: y });
  }
  // Scatter ~30 clouds at altitudes 11-23 — comfortable distance above the buildings
  for (let i = 0; i < 30; i++) {
    addCloud(
      (Math.random() - 0.5) * 200,
      11 + Math.random() * 12,
      (Math.random() - 0.5) * 200,
      1.3 + Math.random() * 1.5
    );
  }
  scene.add(cloudGroup);

  // ─────────────── STARS (visible at night, twinkle) ───────────────
  const STAR_COUNT = 600;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starSizes = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Distribute on a hemisphere (above horizon only)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.9 + 0.05);   // mostly upper hemisphere
    const r = 200;
    starPos[i*3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i*3 + 1] = r * Math.cos(phi) + 30;
    starPos[i*3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    starSizes[i] = 0.4 + Math.random() * 1.0;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.0, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ─────────────── METEORS (occasional shooting stars at night) ───────────────
  const METEOR_MAX = 5;
  const meteors = [];
  for (let i = 0; i < METEOR_MAX; i++) {
    const lineGeo = new THREE.BufferGeometry();
    const linePos = new Float32Array(2 * 3);   // 2 vertices per meteor
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);
    meteors.push({ line, pos: linePos, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let meteorCooldown = 4;
  function spawnMeteor() {
    const m = meteors.find(x => x.life <= 0);
    if (!m) return;
    const startX = (Math.random() - 0.5) * 200;
    const startY = 60 + Math.random() * 30;
    const startZ = (Math.random() - 0.5) * 200;
    m.pos[0] = startX; m.pos[1] = startY; m.pos[2] = startZ;
    m.pos[3] = startX; m.pos[4] = startY; m.pos[5] = startZ;
    m.vx = (Math.random() - 0.5) * 60;
    m.vy = -20 - Math.random() * 25;
    m.vz = (Math.random() - 0.5) * 60;
    m.life = 1.2;     // seconds visible
  }

  // ─────────────── SKY-WRITING AIRPLANE ───────────────
  // A small plane that flies across the sky every 35-70 sec, trailing "imran ." in white particles.
  const planeGroup = new THREE.Group();
  const planeBody = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2, emissive: 0xfff5e0, emissiveIntensity: 0.3 })
  );
  planeBody.rotation.z = -Math.PI/2;
  planeGroup.add(planeBody);
  const planeWing = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: 0xff3e8a, emissiveIntensity: 0.4 })
  );
  planeGroup.add(planeWing);
  const planeTail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: 0xff3e8a, emissiveIntensity: 0.4 })
  );
  planeTail.position.set(-0.7, 0.2, 0);
  planeGroup.add(planeTail);
  scene.add(planeGroup);
  planeGroup.visible = false;

  // Banner trail — pre-allocated Points pool that the plane drops behind itself
  const TRAIL_MAX = 120;
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL_MAX * 3);
  const trailLives = new Float32Array(TRAIL_MAX);
  for (let i = 0; i < TRAIL_MAX; i++) trailPos[i*3 + 1] = -1000;
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.2, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const trail = new THREE.Points(trailGeo, trailMat);
  scene.add(trail);

  // Plane state machine
  const planeState = {
    active: false,
    cooldown: 18,                 // first appearance after 18s
    progress: 0,                   // 0..1 across the sky
    duration: 22,                  // takes 22 seconds to cross
    startX: -120, endX: 120,
    altitude: 38,
    z: 0,
    trailCursor: 0,
  };
  function spawnPlane() {
    planeState.active = true;
    planeState.progress = 0;
    planeState.altitude = 32 + Math.random() * 14;
    planeState.z = -60 + Math.random() * 120;
    // Random direction: half the time fly the other way
    if (Math.random() < 0.5) { planeState.startX = -120; planeState.endX = 120; planeState.duration = 22; }
    else                      { planeState.startX = 120;  planeState.endX = -120; planeState.duration = 22; }
    planeGroup.visible = true;
  }
  function dropTrail(x, y, z) {
    const i = planeState.trailCursor;
    planeState.trailCursor = (planeState.trailCursor + 1) % TRAIL_MAX;
    trailPos[i*3 + 0] = x;
    trailPos[i*3 + 1] = y;
    trailPos[i*3 + 2] = z;
    trailLives[i] = 6.0;       // trail particle lives 6 seconds (slow fade so banner stays readable)
  }

  // ─────────────── HOLOGRAPHIC GLOBE (relocated to top of observation tower) ───────────────
  // Smaller, mounted at the top of the tower as a network beacon. Visible from across the city
  // without blocking the spawn area.
  const globeGroup = new THREE.Group();
  const globeWire = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x5ce5ff, wireframe: true, transparent: true, opacity: 0.55 })
  );
  globeGroup.add(globeWire);
  const globeCore = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0x5ce5ff, transparent: true, opacity: 0.05 })
  );
  globeGroup.add(globeCore);
  const globeNodes = [];
  for (let i = 0; i < 6; i++) {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3e8a })
    );
    const orbitR = 1.6 + Math.random() * 0.6;
    const angle = Math.random() * Math.PI * 2;
    const tilt = (Math.random() - 0.5) * Math.PI * 0.6;
    node.position.set(orbitR * Math.cos(angle), Math.sin(tilt) * orbitR, orbitR * Math.sin(angle));
    globeGroup.add(node);
    globeNodes.push({ mesh: node, orbitR, angle, tilt, speed: 0.3 + Math.random() * 0.6 });
  }
  // Mount on top of the observation tower (positioned later when tower is built — set here based on plan)
  globeGroup.position.set(85, 44, 65);
  scene.add(globeGroup);
  // "imran . net" label floating beside the globe (drawn later, stays facing camera)
  const netLabel = makeLabel('imran . net', '#5ce5ff', 100);
  netLabel.position.set(85, 48, 65);
  netLabel.scale.set(1.2, 1.2, 1.2);
  scene.add(netLabel);

  // ─────────────── COIN COLLECTIBLES (scattered around the city) ───────────────
  const coins = [];
  function addCoin(x, z) {
    const cMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.10, 24),
      new THREE.MeshStandardMaterial({
        color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 1.0, metalness: 0.9, roughness: 0.2,
      })
    );
    cMesh.rotation.z = Math.PI / 2;       // stand on edge
    cMesh.position.set(x, 1.2, z);
    cMesh.castShadow = true;
    scene.add(cMesh);
    coins.push({ mesh: cMesh, x, z, collected: false });
  }
  // 28 coins placed in OPEN road / ground areas only.
  // Audited against every prop — no overlap with buildings, river, lake, bridges,
  // observation tower, ramp, brick wall, bowling pins, loop, zone pads, parked cars, or arch.
  const COIN_SPOTS = [
    // Spawn ring (just out from spawn pad in 4 directions)
    [-6, 6], [6, 6], [-6, -6], [6, -6],
    // Imran Avenue south (clean road heading toward contact)
    [0, -16], [0, -28], [0, -42], [0, -56], [0, -68],
    // Imran Avenue north (toward projects + social boulevard)
    [0, 18], [0, 40], [0, 50], [0, 72],
    // Pasha Boulevard east (open road to skills/projects)
    [16, 0], [26, 0], [38, 0],
    // Pasha Boulevard west (open road toward downtown)
    [-16, 0], [-26, 0], [-38, 0],
    // Cross-street intersections
    [-12, -12], [12, -12], [-12, 12], [12, 12],
    // Bridge approaches (just before each river bridge — visible coin to grab)
    [50, 22], [50, -22],
    // Around the observation tower (NOT under it — outside the tower footprint)
    [78, 65], [85, 75],
    // Park east edge (visible above grass disc, not in cherry trees)
    [-50, -55],
  ];
  for (const [x, z] of COIN_SPOTS) addCoin(x, z);
  // State
  let coinsCollected = 0;
  const coinTotal = coins.length;

  // ─────────────── TOAST HELPER (for plane/rain/coin notifications) ───────────────
  // Fires a toast event the HTML side already listens for.
  window.__imranToast = function (msg) {
    window.dispatchEvent(new CustomEvent('imran:toast', { detail: msg }));
  };

  // ─────────────── RAIN (auto, driven by weather state) ───────────────
  const RAIN_MAX = 800;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_MAX * 3);
  for (let i = 0; i < RAIN_MAX; i++) {
    rainPos[i*3 + 0] = (Math.random() - 0.5) * 200;
    rainPos[i*3 + 1] = Math.random() * 60;
    rainPos[i*3 + 2] = (Math.random() - 0.5) * 200;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0xc8e8ff, size: 0.55, sizeAttenuation: true,
    transparent: true, opacity: 0.75, depthWrite: false,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.visible = false;
  scene.add(rain);

  // ─────────────── WEATHER CYCLE (deterministic, like day/night) ───────────────
  // Cycles through clear → cloudy → rain → storm → clear over 180 seconds.
  // Predictable so visitors see each phase, NOT random.
  const WEATHER_LABELS = { clear: '☀ clear skies', cloudy: '☁ cloudy', rain: '🌧 light rain', storm: '⛈ thunderstorm' };
  // Phase boundaries within one cycle (0..1). Each phase ~25-40s of the 180s cycle.
  const WEATHER_PHASES = [
    { until: 0.25, name: 'clear'  },   // 0–45s   sunny
    { until: 0.40, name: 'cloudy' },   // 45–72s  clouding up
    { until: 0.60, name: 'rain'   },   // 72–108s rain
    { until: 0.70, name: 'storm'  },   // 108–126s storm with lightning
    { until: 0.85, name: 'cloudy' },   // 126–153s clearing
    { until: 1.00, name: 'clear'  },   // 153–180s back to clear
  ];
  const WEATHER_CYCLE_LEN = 180;       // seconds per full cycle
  let weatherCycleT = 0.04;            // start a tiny bit in so 'clear' shows on first frame
  let weather = 'clear';
  let lightningCooldown = 0;
  let lightningFlashT = 0;

  function setWeather(w) {
    if (w === weather) return;
    weather = w;
    rain.visible = (w === 'rain' || w === 'storm');
    cloudMat.opacity = (w === 'clear' ? 0.92 : 0.95);
    if (window.__imranToast) window.__imranToast(WEATHER_LABELS[w]);
  }

  function weatherForT(u) {
    for (const p of WEATHER_PHASES) {
      if (u <= p.until) return p.name;
    }
    return 'clear';
  }

  function flashLightning() {
    lightningFlashT = 0.18;
    if (window.imranSound && window.imranSound.thunder) window.imranSound.thunder();
  }

  // ─────────────── CHERRY BLOSSOM PETALS (drifting at the park) ───────────────
  const PETAL_MAX = 220;
  const petalGeo = new THREE.BufferGeometry();
  const petalPos = new Float32Array(PETAL_MAX * 3);
  const petalVel = new Float32Array(PETAL_MAX * 3);
  for (let i = 0; i < PETAL_MAX; i++) {
    // Park is at (-65, -55), radius ~22. Spread petals around there.
    petalPos[i*3 + 0] = -65 + (Math.random() - 0.5) * 30;
    petalPos[i*3 + 1] = 4 + Math.random() * 12;
    petalPos[i*3 + 2] = -55 + (Math.random() - 0.5) * 30;
    petalVel[i*3 + 0] = (Math.random() - 0.5) * 0.6;
    petalVel[i*3 + 1] = -(0.4 + Math.random() * 0.6);
    petalVel[i*3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
  const petalMat = new THREE.PointsMaterial({
    color: 0xffb8de, size: 0.55, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const petals = new THREE.Points(petalGeo, petalMat);
  scene.add(petals);

  // ─────────────── DRIFT SMOKE (when cornering hard at speed) ───────────────
  const SMOKE_MAX = 180;
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new Float32Array(SMOKE_MAX * 3);
  const smokeLives = new Float32Array(SMOKE_MAX);
  for (let i = 0; i < SMOKE_MAX; i++) smokePos[i*3 + 1] = -1000;
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smokeMat = new THREE.PointsMaterial({
    color: 0xeef0f5, size: 1.4, sizeAttenuation: true,
    transparent: true, opacity: 0.55, depthWrite: false,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  scene.add(smoke);
  let smokeCursor = 0;
  function emitSmoke(x, z) {
    const i = smokeCursor;
    smokeCursor = (smokeCursor + 1) % SMOKE_MAX;
    smokePos[i*3 + 0] = x + (Math.random() - 0.5) * 0.4;
    smokePos[i*3 + 1] = 0.4;
    smokePos[i*3 + 2] = z + (Math.random() - 0.5) * 0.4;
    smokeLives[i] = 1.5 + Math.random() * 0.8;
  }

  // ─────────────── FIREWORKS (burst at celebration moments) ───────────────
  const FW_MAX = 240;
  const fwGeo = new THREE.BufferGeometry();
  const fwPos = new Float32Array(FW_MAX * 3);
  const fwVel = new Float32Array(FW_MAX * 3);
  const fwLives = new Float32Array(FW_MAX);
  const fwColors = new Float32Array(FW_MAX * 3);
  for (let i = 0; i < FW_MAX; i++) fwPos[i*3 + 1] = -1000;
  fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPos, 3));
  fwGeo.setAttribute('color', new THREE.BufferAttribute(fwColors, 3));
  const fwMat = new THREE.PointsMaterial({
    size: 0.6, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 1.0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const fireworks = new THREE.Points(fwGeo, fwMat);
  scene.add(fireworks);
  let fwCursor = 0;
  function fireBurst(x, y, z, color = null) {
    const palette = [
      [1.0, 0.24, 0.54],   // pink
      [0.36, 0.90, 1.0],   // cyan
      [1.0, 0.88, 0.40],   // yellow
      [0.54, 0.24, 1.0],   // purple
      [0.76, 1.0, 0.07],   // lime
    ];
    for (let p = 0; p < 60; p++) {
      const i = fwCursor;
      fwCursor = (fwCursor + 1) % FW_MAX;
      fwPos[i*3 + 0] = x;
      fwPos[i*3 + 1] = y;
      fwPos[i*3 + 2] = z;
      // Random direction on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const sp = 6 + Math.random() * 6;
      fwVel[i*3 + 0] = Math.sin(phi) * Math.cos(theta) * sp;
      fwVel[i*3 + 1] = Math.cos(phi) * sp;
      fwVel[i*3 + 2] = Math.sin(phi) * Math.sin(theta) * sp;
      fwLives[i] = 1.6 + Math.random() * 0.6;
      const col = color || palette[Math.floor(Math.random() * palette.length)];
      fwColors[i*3 + 0] = col[0];
      fwColors[i*3 + 1] = col[1];
      fwColors[i*3 + 2] = col[2];
    }
    fwGeo.attributes.position.needsUpdate = true;
    fwGeo.attributes.color.needsUpdate = true;
  }
  // Expose so HTML / other systems can trigger
  window.__imranFireworks = fireBurst;

  // ─────────────── DAY/NIGHT CYCLE STATE ───────────────
  // Cycles every 90 seconds: dawn → noon → sunset → twilight → night → dawn
  let timeOfDay = 0.35;          // 0..1 (0=dawn, 0.25=noon, 0.5=sunset, 0.75=night)
  let timeAutoAdvance = true;    // automatic cycle on by default
  function toggleDayNightAuto() {
    timeAutoAdvance = !timeAutoAdvance;
    if (window.__imranToast) window.__imranToast(timeAutoAdvance ? '🕐 time cycle ON' : '⏸ time cycle PAUSED');
  }

  // Ground physics
  const groundBody = new CANNON.Body({ mass: 0, material: groundMat });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
  world.addBody(groundBody);

  // ─────────────── RIVER + LAKE + BRIDGES ───────────────
  // Sunset-tinted water shader (deep blue → light cyan)
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x3d7fb8) },
      uColorB: { value: new THREE.Color(0x9ce6ff) },
    },
    vertexShader: `
      uniform float uTime;
      varying float vWave;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x * 0.35 + uTime * 1.1) * 0.20
                + sin(p.y * 0.55 + uTime * 0.7) * 0.12;
        p.z += w;
        vWave = w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vWave;
      varying vec2 vUv;
      void main() {
        float ripple = sin(vUv.x * 28.0 + uTime * 2.5) * 0.06
                     + sin(vUv.y * 16.0 - uTime * 1.4) * 0.06;
        float t = clamp(0.45 + vWave * 1.6 + ripple, 0.0, 1.0);
        vec3 col = mix(uColorA, uColorB, t);
        gl_FragColor = vec4(col, 0.88);
      }
    `,
  });
  // Reuse same uniforms for lake — link the time uniform
  const waterMatLake = waterMat.clone();
  waterMatLake.uniforms = waterMat.uniforms;        // share time so they sync
  // Keep a riverMat alias since the tick loop already references it
  const riverMat = waterMat;

  // RIVER — winding strip built from straight segments
  // Path approximated with straight box-segments instead of curve extrusion (simpler, lighter).
  const RIVER_PATH = [
    [85, 60],   // entry from NE
    [70, 35],
    [55, 10],
    [50, -15],
    [60, -40],
    [70, -55],
  ];
  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const [ax, az] = RIVER_PATH[i];
    const [bx, bz] = RIVER_PATH[i+1];
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az) + 1.2;
    const ang = Math.atan2(bx - ax, bz - az);
    const segGeo = new THREE.PlaneGeometry(13, len, 6, Math.ceil(len/2));
    const seg = new THREE.Mesh(segGeo, waterMat);
    seg.rotation.x = -Math.PI/2;
    seg.rotation.z = -ang;
    seg.position.set(cx, 0.08, cz);
    scene.add(seg);
  }
  // LAKE — large oval at the river's southern end
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(20, 64),
    waterMatLake
  );
  lake.rotation.x = -Math.PI/2;
  lake.position.set(72, 0.07, -65);
  scene.add(lake);

  // BRIDGES — wooden plank spans crossing the river at two points
  function addBridge(x, z, rotY = 0, len = 18) {
    const g = new THREE.Group();
    // Deck (planks)
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.4, 4.5),
      new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
    );
    deck.position.y = 1.0;
    deck.castShadow = true; deck.receiveShadow = true;
    g.add(deck);
    // Side rails (left + right)
    for (const dz of [-2.4, 2.4]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.18, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x4a3018 })
      );
      rail.position.set(0, 1.9, dz);
      g.add(rail);
      // Posts every 3m
      for (let p = -len/2 + 1; p <= len/2 - 1; p += 3) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 1.2, 0.18),
          new THREE.MeshStandardMaterial({ color: 0x4a3018 })
        );
        post.position.set(p, 1.5, dz);
        g.add(post);
      }
    }
    // Underside support beams at each end
    for (const dx of [-len/2 + 0.5, len/2 - 0.5]) {
      const support = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1.0, 5),
        new THREE.MeshStandardMaterial({ color: 0x4a3018 })
      );
      support.position.set(dx, 0.5, 0);
      g.add(support);
    }
    // Light strands along rails
    for (const dz of [-2.4, 2.4]) {
      for (let p = -len/2 + 2; p <= len/2 - 2; p += 4) {
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 1.4 })
        );
        bulb.position.set(p, 2.1, dz);
        g.add(bulb);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  }
  // North bridge crosses the upper river bend (around x=60, z=20)
  addBridge(60, 22, Math.PI/2, 18);
  // South bridge crosses just before the lake (around x=55, z=-30)
  addBridge(55, -25, Math.PI/2 + 0.35, 18);

  // Wooden pier extending from lake's west bank
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.3, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
  );
  pier.position.set(60, 0.6, -65);
  pier.castShadow = true; scene.add(pier);
  // Pier support posts dipping into water
  for (const dx of [-4, 0, 4]) {
    const ppost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3018 })
    );
    ppost.position.set(60 + dx, 0.0, -65);
    scene.add(ppost);
  }

  // ─────────────── OBSERVATION TOWER (40m, sweeping beacon) ───────────────
  // Tall landmark at (+85, +65) — visible from across the city.
  const towerGroup = new THREE.Group();
  const towerH = 36;
  // 4 corner support legs (slim cylinders)
  for (const dx of [-2.5, 2.5]) {
    for (const dz of [-2.5, 2.5]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.35, towerH, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
      );
      leg.position.set(dx, towerH/2, dz);
      leg.castShadow = true;
      towerGroup.add(leg);
    }
  }
  // Cross bracing — diagonal X struts at 3 heights
  for (const y of [9, 18, 27]) {
    for (const side of [['x', -2.5], ['x', 2.5], ['z', -2.5], ['z', 2.5]]) {
      const [axis, off] = side;
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(axis === 'x' ? 0.18 : 5, 0.18, axis === 'z' ? 0.18 : 5),
        new THREE.MeshStandardMaterial({ color: 0x4a3018 })
      );
      strut.position.set(axis === 'x' ? off : 0, y, axis === 'z' ? off : 0);
      towerGroup.add(strut);
    }
  }
  // Observation deck (cylindrical pod near top)
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 2.5, 24),
    new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
  );
  deck.position.y = towerH - 1.5;
  deck.castShadow = true;
  towerGroup.add(deck);
  // Glass band around deck (cyan glow)
  const deckGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(4.05, 4.05, 1.4, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.05, side: THREE.DoubleSide })
  );
  deckGlass.position.y = towerH - 1.5;
  towerGroup.add(deckGlass);
  // Roof cone
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 3.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x7a2e1f, roughness: 0.85 })
  );
  roof.position.y = towerH + 1.4;
  roof.castShadow = true;
  towerGroup.add(roof);
  // Beacon orb — sphere on top, animated
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: 0xff3e8a, emissiveIntensity: 1.8 })
  );
  beacon.position.y = towerH + 3.4;
  towerGroup.add(beacon);
  const beaconLight = new THREE.SpotLight(0xff3e8a, 1.8, 80, Math.PI/4, 0.5, 1.2);
  beaconLight.position.y = towerH + 3.4;
  beaconLight.target.position.set(20, 0, 0);    // initial
  towerGroup.add(beaconLight);
  towerGroup.add(beaconLight.target);
  towerGroup.position.set(85, 0, 65);
  scene.add(towerGroup);

  // ─────────────── HTB SKULL STATUE (cybersec easter egg) ───────────────
  // Small statue at (-30, +45) — pedestal + skull.
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.5, 1.6, 16),
    new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
  );
  pedestal.position.set(-30, 0.8, 45); pedestal.castShadow = true; scene.add(pedestal);
  const skullBase = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 16, 14),
    new THREE.MeshStandardMaterial({ color: 0xfff5e0, emissive: 0xc1ff12, emissiveIntensity: 0.4, roughness: 0.4 })
  );
  skullBase.position.set(-30, 2.5, 45); skullBase.castShadow = true; scene.add(skullBase);
  // Eye sockets (dark spheres slightly inset)
  for (const dx of [-0.28, 0.28]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x000, emissive: 0xc1ff12, emissiveIntensity: 1.6 })
    );
    eye.position.set(-30 + dx, 2.65, 45 + 0.7);
    scene.add(eye);
  }
  // HTB nameplate
  const plateLab = makeLabel('HTB', '#c1ff12', 90);
  plateLab.position.set(-30, 1.3, 45 + 1.55);
  plateLab.scale.set(0.3, 0.3, 0.3);
  scene.add(plateLab);

  // Hold a reference for the beacon sweep animation in the tick loop.
  window.__imranBeacon = { light: beaconLight, target: beaconLight.target, beacon };

  // ─────────────── PARK AREA (grass + benches + lamps) ───────────────
  // Downtown's green lung at (-65, -55) per civil engineer plan
  const parkX = -65, parkZ = -55;
  // Saturated chartreuse grass for sunset palette (was deep forest)
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x7bc04a, roughness: 0.95, metalness: 0,
    emissive: 0x3e8c2f, emissiveIntensity: 0.10,
  });
  const grass = new THREE.Mesh(new THREE.CircleGeometry(16, 48), grassMat);
  grass.rotation.x = -Math.PI/2;
  grass.position.set(parkX, 0.04, parkZ);
  grass.receiveShadow = true;
  scene.add(grass);
  // Bench
  function addBench(x, z, rotY = 0) {
    const benchGroup = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x6a4028, roughness: 0.7 }));
    seat.position.y = 0.55; seat.castShadow = true;
    benchGroup.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x6a4028, roughness: 0.7 }));
    back.position.set(0, 0.95, -0.3); back.castShadow = true;
    benchGroup.add(back);
    for (const dx of [-1.0, 1.0]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x222 }));
      leg.position.set(dx, 0.27, 0); leg.castShadow = true;
      benchGroup.add(leg);
    }
    benchGroup.position.set(x, 0, z);
    benchGroup.rotation.y = rotY;
    scene.add(benchGroup);
  }
  addBench(parkX - 4, parkZ + 3, Math.PI/2);
  addBench(parkX + 5, parkZ - 4, -Math.PI/3);
  addBench(parkX + 2, parkZ + 6, Math.PI);

  // Park lamps
  function addLamp(x, z, color = COL.yellow) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a1226 }));
    post.position.set(x, 2, z); post.castShadow = true; scene.add(post);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 }));
    head.position.set(x, 4.2, z); scene.add(head);
    const light = new THREE.PointLight(color, 1.0, 14, 2);
    light.position.set(x, 4.2, z); scene.add(light);
  }
  addLamp(parkX - 8, parkZ - 6, COL.yellow);
  addLamp(parkX + 8, parkZ + 6, COL.cyan);
  addLamp(parkX, parkZ + 10, COL.pink);

  // ─────────────── TREES (3 varieties scattered around the map) ───────────────
  function addTree(x, z, type) {
    const trunkH = type === 'pine' ? 4 : 3;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, trunkH, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a1f10 })
    );
    trunk.position.set(x, trunkH/2, z); trunk.castShadow = true;
    scene.add(trunk);

    if (type === 'cherry') {
      for (let i = 0; i < 6; i++) {
        const r = 1.0 + Math.random() * 0.5;
        const blossom = new THREE.Mesh(
          new THREE.SphereGeometry(r, 10, 8),
          new THREE.MeshStandardMaterial({ color: COL.pink, emissive: COL.pink, emissiveIntensity: 0.25, roughness: 0.7 })
        );
        blossom.position.set(x + (Math.random()-0.5)*1.6, trunkH + Math.random()*1.2, z + (Math.random()-0.5)*1.6);
        blossom.castShadow = true;
        scene.add(blossom);
      }
    } else if (type === 'pine') {
      for (let i = 0; i < 3; i++) {
        const r = 1.6 - i * 0.35;
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(r, 1.6, 10),
          new THREE.MeshStandardMaterial({ color: 0x1a4a2a, roughness: 0.8, emissive: 0x0a2a1a, emissiveIntensity: 0.15 })
        );
        cone.position.set(x, trunkH + 0.4 + i * 1.0, z); cone.castShadow = true;
        scene.add(cone);
      }
    } else { // oak
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x2a5a1a, roughness: 0.85, emissive: 0x0a2a0a, emissiveIntensity: 0.18 })
      );
      ball.position.set(x, trunkH + 0.8, z); ball.castShadow = true;
      scene.add(ball);
    }
  }

  // Scatter trees, avoiding zones and roads
  const TREE_SPOTS = [
    // Park trees (cherry blossom cluster)
    [parkX - 6, parkZ - 2, 'cherry'], [parkX - 3, parkZ - 8, 'cherry'],
    [parkX + 6, parkZ + 2, 'oak'], [parkX + 4, parkZ + 8, 'pine'],
    // Around the about zone
    [-32, -16, 'pine'], [-28, -4, 'oak'],
    // Behind projects
    [-22, 32, 'cherry'], [-8, 32, 'oak'], [8, 32, 'pine'], [22, 32, 'cherry'],
    // Around skills
    [32, -10, 'pine'], [32, -22, 'oak'], [16, -28, 'cherry'],
    // Around socials
    [-32, 44, 'oak'], [22, 44, 'pine'],
    // Around contact mailbox
    [-8, -34, 'cherry'], [10, -34, 'oak'],
    // Random fillers
    [-44, 8, 'pine'], [-44, 24, 'oak'], [-44, -10, 'cherry'],
    [44, 8, 'oak'], [44, 24, 'pine'], [44, -28, 'cherry'],
    [-12, -44, 'pine'], [12, -44, 'oak'], [0, -44, 'cherry'],
    [-32, 48, 'pine'], [0, 48, 'cherry'], [12, 48, 'oak'],
  ];
  for (const [x, z, t] of TREE_SPOTS) addTree(x, z, t);

  // ─────────────── NPCs (simple bobbing pedestrians) ───────────────
  const npcs = [];
  function addNPC(x, z, color = 0xff9eb5, wanderRadius = 14) {
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xffd1b3, roughness: 0.6 }));
    head.position.y = 1.55; head.castShadow = true; g.add(head);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.35),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.7 }));
    body.position.y = 0.85; body.castShadow = true; g.add(body);
    // Legs (top-pivot for proper walking swing)
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.7 }));
    lLeg.geometry.translate(0, -0.25, 0);
    lLeg.position.set(-0.13, 0.55, 0);
    g.add(lLeg);
    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.7 }));
    rLeg.geometry.translate(0, -0.25, 0);
    rLeg.position.set(0.13, 0.55, 0);
    g.add(rLeg);
    // Arms (top-pivot at the shoulder so they swing/wave naturally)
    const armGeo = new THREE.BoxGeometry(0.14, 0.6, 0.18);
    armGeo.translate(0, -0.30, 0);          // pivot at shoulder
    const armMat = new THREE.MeshStandardMaterial({ color: 0xffd1b3, roughness: 0.7 });
    const lArm = new THREE.Mesh(armGeo, armMat);
    lArm.position.set(-0.36, 1.20, 0);     // left shoulder
    g.add(lArm);
    const rArm = new THREE.Mesh(armGeo, armMat);
    rArm.position.set(0.36, 1.20, 0);      // right shoulder
    g.add(rArm);
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
    npcs.push({
      group: g, lLeg, rLeg, lArm, rArm,
      homeX: x, homeZ: z,
      targetX: x + (Math.random()-0.5) * wanderRadius,
      targetZ: z + (Math.random()-0.5) * wanderRadius,
      speed: 1.2 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
      wanderRadius,
      waveT: 0,                      // 0..1 wave animation progress
    });
  }
  // Cluster in the park + a couple wandering elsewhere
  addNPC(parkX - 4, parkZ + 2, 0xff3e8a);
  addNPC(parkX + 3, parkZ - 5, 0x5ce5ff);
  addNPC(parkX - 2, parkZ - 7, 0xffe066);
  addNPC(parkX + 6, parkZ + 4, 0xc1ff12);
  addNPC(-12, 18, 0xff9eb5);
  addNPC(14, -22, 0x8a3eff);
  addNPC(28, 30, 0xff6a3a);

  // ─────────────── TRAFFIC LIGHTS at major intersections ───────────────
  const trafficLights = [];   // {lights:[red,yellow,green], state:0, t:0}
  function addTrafficLight(x, z) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x222 }));
    post.position.set(x, 2.25, z); post.castShadow = true; scene.add(post);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.8 }));
    housing.position.set(x, 5.0, z); housing.castShadow = true; scene.add(housing);
    const colors = [0xff3030, 0xffe066, 0x30ff60];
    const lights = [];
    for (let i = 0; i < 3; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10),
        new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 0.15 }));
      bulb.position.set(x, 5.55 - i * 0.55, z + 0.3);
      scene.add(bulb);
      lights.push(bulb);
    }
    trafficLights.push({ lights, state: Math.floor(Math.random()*3), t: Math.random()*4 });
  }
  // Place at 4 main intersections
  addTrafficLight(-11, -11);
  addTrafficLight(11, -11);
  addTrafficLight(-11, 11);
  addTrafficLight(11, 11);

  // ─────────────── PARKED DECORATIVE CARS ───────────────
  function addParkedCar(x, z, rotY, color) {
    const g = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 3.4),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 }));
    cab.position.y = 0.5; cab.castShadow = true; g.add(cab);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.8),
      new THREE.MeshStandardMaterial({ color: color * 0.6 | 0, roughness: 0.5 }));
    top.position.set(0, 1.25, -0.2); top.castShadow = true; g.add(top);
    // Wheels (just visuals)
    const wheelGeoP = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12);
    wheelGeoP.rotateZ(Math.PI/2);
    const wmat = new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.9 });
    for (const [wx, wz] of [[-1.0, 1.2], [1.0, 1.2], [-1.0, -1.2], [1.0, -1.2]]) {
      const w = new THREE.Mesh(wheelGeoP, wmat);
      w.position.set(wx, 0.45, wz); w.castShadow = true; g.add(w);
    }
    // Headlight or taillight glow
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xff2a4a, emissive: 0xff2a4a, emissiveIntensity: 0.7 }));
    tl.position.set(-0.6, 0.6, -1.74); g.add(tl);
    const tl2 = tl.clone(); tl2.position.x = 0.6; g.add(tl2);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  }
  // Park along the streets (offset from road edge)
  addParkedCar(-19, 4, Math.PI/2, 0x3effc8);
  addParkedCar(-19, 16, Math.PI/2, 0xffe066);
  addParkedCar(19, -4, -Math.PI/2, 0x8a3eff);
  addParkedCar(19, -16, -Math.PI/2, 0xff6a3a);
  addParkedCar(-9, -19, 0, 0x5ce5ff);
  addParkedCar(-29, -2, Math.PI/2, 0xff3e8a);
  addParkedCar(29, 14, -Math.PI/2, 0xc1ff12);
  addParkedCar(4, 19, Math.PI, 0x6a3aff);

  // Distant glowing sun/moon ring on horizon
  const sunGeo = new THREE.RingGeometry(28, 30, 64);
  const sunMat = new THREE.MeshBasicMaterial({ color: COL.pink, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(0, 22, -160); scene.add(sun);
  const sunDisk = new THREE.Mesh(new THREE.CircleGeometry(28, 64), new THREE.MeshBasicMaterial({ color: 0x501830, transparent: true, opacity: 0.4 }));
  sunDisk.position.set(0, 22, -161); scene.add(sunDisk);

  // ─────────────── HELPERS ───────────────
  const objects = []; // { mesh, body } for sync
  function addBox(w, h, d, x, y, z, color, mass = 0, opts = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.5, metalness: opts.metal ?? 0.2, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveI ?? 0 })
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    const body = new CANNON.Body({ mass, material: bodyMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
    body.position.set(x, y, z);
    world.addBody(body);
    if (mass > 0) {
      body.addEventListener('collide', (ev) => {
        const imp = ev.contact && ev.contact.getImpactVelocityAlongNormal
          ? Math.abs(ev.contact.getImpactVelocityAlongNormal()) : 4;
        if (imp > 2.5) Sound.crash(imp);
      });
    }
    objects.push({ mesh, body });
    return { mesh, body };
  }

  // ─────────────── SPAWN AREA ───────────────
  // Glowing circular platform
  const padGeo = new THREE.CylinderGeometry(6, 6, 0.2, 48);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x2a1a4e, emissive: COL.pink, emissiveIntensity: 0.4, roughness: 0.4 });
  const spawnPad = new THREE.Mesh(padGeo, padMat);
  spawnPad.position.set(0, 0.05, 0); spawnPad.receiveShadow = true; scene.add(spawnPad);
  // Glow ring
  const ringMat = new THREE.MeshBasicMaterial({ color: COL.pink, transparent: true, opacity: 0.7 });
  const spawnRing = new THREE.Mesh(new THREE.RingGeometry(5.8, 6.2, 64), ringMat);
  spawnRing.rotation.x = -Math.PI/2; spawnRing.position.y = 0.06; scene.add(spawnRing);

  // Lamp post
  const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 12), new THREE.MeshStandardMaterial({ color: 0x1a1226 }));
  lampPost.position.set(5, 2.5, 5); lampPost.castShadow = true; scene.add(lampPost);
  const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: COL.yellow, emissive: COL.yellow, emissiveIntensity: 1.2 }));
  lampHead.position.set(5, 5.2, 5); scene.add(lampHead);
  const lampLight = new THREE.PointLight(COL.yellow, 1.5, 20, 2);
  lampLight.position.set(5, 5.2, 5); scene.add(lampLight);

  // Cherry blossom tree
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 4, 10), new THREE.MeshStandardMaterial({ color: 0x4a2818 }));
  trunk.position.set(-5, 2, 5); trunk.castShadow = true; scene.add(trunk);
  for (let i = 0; i < 8; i++) {
    const r = 1.2 + Math.random() * 0.6;
    const blossom = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshStandardMaterial({ color: COL.pink, emissive: COL.pink, emissiveIntensity: 0.3, roughness: 0.6 }));
    blossom.position.set(-5 + (Math.random()-0.5)*2, 4 + Math.random()*1.5, 5 + (Math.random()-0.5)*2);
    blossom.castShadow = true;
    scene.add(blossom);
  }

  // ─────────────── HAND-DRAWN LABELS via CanvasTexture ───────────────
  function makeLabel(text, color = '#ffffff', size = 96) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0,0,canvas.width, canvas.height);
    ctx.font = `${size}px "Permanent Marker", "Caveat", cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width/2, canvas.height/2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), mat);
    return mesh;
  }
  const startLabel = makeLabel('CLICK TO START →', '#ffffff', 90);
  startLabel.position.set(0, 4.5, 0);
  scene.add(startLabel);

  // ─────────────── SUPERCAR (low, wide, mid-engine silhouette) ───────────────
  // Front of car = -Z (headlights direction), rear = +Z (taillights face the chase camera).
  const carGroup = new THREE.Group();
  // Ferrari Rosso Corsa — iconic racing red, brighter and more saturated
  const supercarRed = new THREE.MeshStandardMaterial({
    color: 0xd40404, roughness: 0.16, metalness: 0.88,
    emissive: 0x3a0606, emissiveIntensity: 0.08,
  });
  // Brighter "carbon" — dark navy-grey with strong metallic sheen so it catches sunset highlights
  // (was nearly pure black which read as flat shadow against the warm palette)
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x232a35, roughness: 0.30, metalness: 0.85,
    emissive: 0x080a14, emissiveIntensity: 0.15,
  });
  // Bright accent material for trim edges (cyan-tinted chrome)
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 1.2, metalness: 0.7, roughness: 0.2,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd5d5d5, roughness: 0.18, metalness: 0.95,
  });

  // Lower body pan — long flat plinth (the chassis line)
  const lowerBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.40, 4.0),
    supercarRed
  );
  lowerBody.position.y = 0.45;
  lowerBody.castShadow = true; carGroup.add(lowerBody);

  // Front hood — slopes down to the nose
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.28, 1.6),
    supercarRed
  );
  hood.position.set(0, 0.78, -1.05);
  hood.rotation.x = -0.10;
  hood.castShadow = true; carGroup.add(hood);

  // Nose splitter — black aero piece at front bumper
  const splitter = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.16, 0.45),
    carbonMat
  );
  splitter.position.set(0, 0.32, -1.95);
  carGroup.add(splitter);
  // Front lip air-dam (small angle wedge under the splitter)
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.10, 0.18),
    carbonMat
  );
  lip.position.set(0, 0.20, -2.05);
  carGroup.add(lip);
  // Cyan accent strip across the front splitter edge
  const splitterTrim = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.04, 0.04),
    accentMat
  );
  splitterTrim.position.set(0, 0.32, -2.18);
  carGroup.add(splitterTrim);

  // Cockpit canopy — small bubble in the middle (mid-engine proportions)
  const cockpit = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.50, 1.20),
    carbonMat
  );
  cockpit.position.set(0, 1.10, 0.05);
  cockpit.castShadow = true; carGroup.add(cockpit);

  // Windshield — smoked glass, raked back
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.62, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x0a1426, transparent: true, opacity: 0.55,
      emissive: 0x002233, emissiveIntensity: 0.35,
      roughness: 0.06, metalness: 0.55,
    })
  );
  windshield.position.set(0, 1.05, -0.62);
  windshield.rotation.x = 0.55;
  carGroup.add(windshield);

  // Rear window — slopes the other way
  const rearGlass = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.55, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x0a1426, transparent: true, opacity: 0.55,
      emissive: 0x002233, emissiveIntensity: 0.30,
      roughness: 0.06, metalness: 0.55,
    })
  );
  rearGlass.position.set(0, 1.05, 0.70);
  rearGlass.rotation.x = -0.55;
  carGroup.add(rearGlass);

  // Rear engine cover — slightly raised hump behind the cockpit
  const engineCover = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.42, 1.30),
    supercarRed
  );
  engineCover.position.set(0, 0.92, 1.20);
  engineCover.castShadow = true; carGroup.add(engineCover);
  // Engine cover slats (3 black strips, fake intercooler vents)
  for (let i = -1; i <= 1; i++) {
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.05, 0.18),
      carbonMat
    );
    slat.position.set(0, 1.16, 1.20 + i * 0.28);
    carGroup.add(slat);
  }

  // Rear spoiler — wing on two uprights
  for (const dx of [-0.78, 0.78]) {
    const upright = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.45, 0.18),
      carbonMat
    );
    upright.position.set(dx, 1.35, 1.85);
    carGroup.add(upright);
  }
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(2.10, 0.08, 0.50),
    carbonMat
  );
  wing.position.set(0, 1.62, 1.85);
  wing.castShadow = true; carGroup.add(wing);
  // Accent strip along the trailing edge of the wing (cyan glow line)
  const wingTrim = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.04, 0.04),
    accentMat
  );
  wingTrim.position.set(0, 1.66, 2.07);
  carGroup.add(wingTrim);

  // Side skirts — low panels along the bottom doors with a glowing accent line
  for (const sx of [-1.02, 1.02]) {
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.28, 2.4),
      carbonMat
    );
    skirt.position.set(sx, 0.30, 0);
    carGroup.add(skirt);
    // Cyan accent stripe along the top edge of the skirt
    const skirtTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 2.30),
      accentMat
    );
    skirtTrim.position.set(sx + (sx > 0 ? 0.07 : -0.07), 0.43, 0);
    carGroup.add(skirtTrim);
  }

  // Side air intakes — cyan glowing slits just behind the doors (cybersec accent)
  for (const sx of [-1.05, 1.05]) {
    const intake = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.22, 0.55),
      new THREE.MeshStandardMaterial({
        color: 0x080808, emissive: 0x5ce5ff, emissiveIntensity: 0.85,
        roughness: 0.4,
      })
    );
    intake.position.set(sx, 0.78, 0.65);
    carGroup.add(intake);
  }

  // Door cuts (decorative thin black lines so the body reads as a 2-door coupe)
  for (const sx of [-1.01, 1.01]) {
    const cut = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.55, 0.04),
      carbonMat
    );
    cut.position.set(sx, 0.65, 0);
    carGroup.add(cut);
  }

  // ─── Scuderia Ferrari shield on each front fender ───
  // Yellow shield with black "horse" silhouette painted on it (procedural)
  function makeShieldTexture() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 160;
    const c = cv.getContext('2d');
    // Yellow shield background with rounded shape
    c.fillStyle = '#ffe600';
    c.beginPath();
    c.moveTo(20, 10); c.lineTo(108, 10);
    c.lineTo(108, 110); c.quadraticCurveTo(64, 158, 20, 110);
    c.closePath(); c.fill();
    // Black border
    c.strokeStyle = '#1a1a1a'; c.lineWidth = 5; c.stroke();
    // Top "SF" letters
    c.fillStyle = '#1a1a1a';
    c.font = 'bold 24px sans-serif';
    c.textAlign = 'center';
    c.fillText('SF', 64, 36);
    // Stylized prancing horse — body + 4 legs + head + tail (geometric primitives)
    c.beginPath();
    // body
    c.ellipse(64, 80, 18, 14, 0, 0, Math.PI*2);
    c.fill();
    // head (smaller circle up-left)
    c.beginPath(); c.ellipse(46, 60, 8, 6, -0.4, 0, Math.PI*2); c.fill();
    // ear/horn
    c.beginPath(); c.moveTo(40, 54); c.lineTo(36, 44); c.lineTo(44, 54); c.closePath(); c.fill();
    // legs (4 small rectangles)
    c.fillRect(50, 88, 4, 14);
    c.fillRect(58, 92, 4, 14);
    c.fillRect(68, 92, 4, 14);
    c.fillRect(76, 88, 4, 14);
    // tail (curve up-right)
    c.beginPath(); c.moveTo(82, 75); c.quadraticCurveTo(96, 60, 92, 50); c.lineTo(86, 70); c.closePath(); c.fill();
    // green-white-red Italian stripe at top
    const stripeY = 0;
    c.fillStyle = '#009246'; c.fillRect(20, stripeY, 30, 8);
    c.fillStyle = '#ffffff'; c.fillRect(50, stripeY, 30, 8);
    c.fillStyle = '#ce2b37'; c.fillRect(80, stripeY, 28, 8);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const shieldTex = makeShieldTexture();
  const shieldMat = new THREE.MeshStandardMaterial({
    map: shieldTex, transparent: true, alphaTest: 0.05,
    emissive: 0x222200, emissiveIntensity: 0.3, roughness: 0.4,
  });
  for (const sx of [-1.04, 1.04]) {
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.40), shieldMat);
    shield.position.set(sx, 0.72, -0.30);     // front fender, just behind the headlight
    shield.rotation.y = sx > 0 ? -Math.PI/2 : Math.PI/2;
    carGroup.add(shield);
  }

  // Hood center stripe — black racing stripe down the middle of the hood
  const hoodStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.02, 1.6),
    carbonMat
  );
  hoodStripe.position.set(0, 0.94, -1.05);
  hoodStripe.rotation.x = -0.10;
  carGroup.add(hoodStripe);

  // Headlights — angular slits at the front-top corners
  const hlMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff2b0, emissiveIntensity: 1.8, roughness: 0.18,
  });
  for (const s of [-0.75, 0.75]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.10, 0.06), hlMat);
    hl.position.set(s, 0.78, -1.96);
    carGroup.add(hl);
    // Daylight running light strip (thin cyan accent above headlight)
    const drl = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.04, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 1.4,
      })
    );
    drl.position.set(s, 0.92, -1.95);
    carGroup.add(drl);
  }

  // Taillight strip — full-width red bar across the back
  const tlStrip = new THREE.Mesh(
    new THREE.BoxGeometry(1.90, 0.14, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0xff2a4a, emissive: 0xff2a4a, emissiveIntensity: 1.7, roughness: 0.30,
    })
  );
  tlStrip.position.set(0, 0.92, 1.97);
  carGroup.add(tlStrip);
  // Twin exhaust tips (centered, below taillight)
  for (const sx of [-0.35, 0.35]) {
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.18, 12),
      chromeMat
    );
    exhaust.rotation.x = Math.PI/2;
    exhaust.position.set(sx, 0.50, 2.03);
    carGroup.add(exhaust);
  }

  // Headlight spotlight (projects forward)
  const carHL = new THREE.SpotLight(0xfff2b0, 1.6, 30, Math.PI/4, 0.6, 1.5);
  carHL.position.set(0, 1, -2);
  carGroup.add(carHL);
  carGroup.add(carHL.target);
  carHL.target.position.set(0, 0, -8);

  // ─── Wings (hidden until plane mode) ───
  const wings = new THREE.Group();
  wings.scale.set(0, 0.001, 0);
  // Left wing
  const lWing = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.08, 0.9),
    supercarRed
  );
  lWing.position.set(-2.2, 0.7, 0.2); lWing.castShadow = true;
  wings.add(lWing);
  // Right wing
  const rWing = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.08, 0.9),
    supercarRed
  );
  rWing.position.set(2.2, 0.7, 0.2); rWing.castShadow = true;
  wings.add(rWing);
  // Wing tip lights (cyan strobes)
  for (const sx of [-3.4, 3.4]) {
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 1.6 })
    );
    tip.position.set(sx, 0.74, 0.2);
    wings.add(tip);
  }
  // Tail rudder (vertical fin at back)
  const tailFin = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.7, 0.55),
    carbonMat
  );
  tailFin.position.set(0, 1.5, 1.7);
  tailFin.castShadow = true;
  wings.add(tailFin);
  // Horizontal stabilizers (small wings at the tail)
  for (const sx of [-0.6, 0.6]) {
    const stab = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.06, 0.4),
      supercarRed
    );
    stab.position.set(sx, 1.45, 1.85);
    wings.add(stab);
  }
  carGroup.add(wings);

  // ─── Performance wheels (low-profile, silver rim, cyan-glow center) ───
  const wheelMeshes = [];
  const wheelGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.42, 20);
  wheelGeo.rotateZ(Math.PI/2);
  const wMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.85 });
  const wheelOffsets = [
    [-1.05, 0.58, 1.30], [1.05, 0.58, 1.30],     // rear (visible from chase cam)
    [-1.05, 0.58, -1.30], [1.05, 0.58, -1.30],   // front
  ];
  for (const [x, y, z] of wheelOffsets) {
    const w = new THREE.Mesh(wheelGeo, wMat);
    w.position.set(x, y, z); w.castShadow = true;
    // Multi-spoke silver rim (single disc — fakes spokes via stripe)
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.44, 16),
      chromeMat
    );
    rim.rotation.z = Math.PI/2;
    w.add(rim);
    // Cyan center hub (glow accent)
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.46, 12),
      new THREE.MeshStandardMaterial({
        color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 1.0,
      })
    );
    hub.rotation.z = Math.PI/2;
    w.add(hub);
    carGroup.add(w);
    wheelMeshes.push(w);
  }
  scene.add(carGroup);

  // ─────────────── DUST PARTICLES (behind rear wheels) ───────────────
  const DUST_MAX = 200;
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(DUST_MAX * 3);
  const dustAlphas = new Float32Array(DUST_MAX);
  const dustLives = new Float32Array(DUST_MAX);   // remaining seconds
  const dustVels = new Float32Array(DUST_MAX * 3);
  for (let i = 0; i < DUST_MAX; i++) {
    dustPositions[i*3 + 1] = -1000; // park offscreen
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeo.setAttribute('alpha', new THREE.BufferAttribute(dustAlphas, 1));
  const dustMat = new THREE.PointsMaterial({
    color: 0xffb8e0,
    size: 0.55,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);
  let dustCursor = 0;
  function emitDust(x, y, z) {
    const i = dustCursor;
    dustCursor = (dustCursor + 1) % DUST_MAX;
    dustPositions[i*3 + 0] = x;
    dustPositions[i*3 + 1] = y;
    dustPositions[i*3 + 2] = z;
    dustVels[i*3 + 0] = (Math.random() - 0.5) * 1.4;
    dustVels[i*3 + 1] = 0.6 + Math.random() * 0.8;
    dustVels[i*3 + 2] = (Math.random() - 0.5) * 1.4;
    dustLives[i] = 0.6 + Math.random() * 0.3;
    dustAlphas[i] = 1.0;
  }
  function updateDust(dt) {
    for (let i = 0; i < DUST_MAX; i++) {
      if (dustLives[i] > 0) {
        dustLives[i] -= dt;
        dustPositions[i*3 + 0] += dustVels[i*3 + 0] * dt;
        dustPositions[i*3 + 1] += dustVels[i*3 + 1] * dt;
        dustPositions[i*3 + 2] += dustVels[i*3 + 2] * dt;
        dustVels[i*3 + 1] -= 1.2 * dt; // gentle gravity
        if (dustLives[i] <= 0) { dustPositions[i*3 + 1] = -1000; }
      }
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  // Physics: simple chassis box (not RaycastVehicle for simplicity & robustness)
  const chassis = new CANNON.Body({ mass: 240, material: bodyMat });
  chassis.addShape(new CANNON.Box(new CANNON.Vec3(1.1, 0.5, 1.8)));
  chassis.position.set(0, 2, 0);
  chassis.linearDamping = 0.2;
  chassis.angularDamping = 0.6;
  // CRITICAL: cannon.js 0.6.2 silently ignores applyForce() on sleeping bodies.
  // The chassis would fall to rest, sleep, and never accept driving forces again.
  chassis.allowSleep = false;
  world.addBody(chassis);

  // ─────────────── INPUT ───────────────
  const keys = { f: false, b: false, l: false, r: false, jump: false };
  const touch = { x: 0, y: 0, jump: false }; // joystick offset -1..1
  let cameraMode = 0; // 0 follow, 1 high, 2 first

  const keyMap = {
    'ArrowUp': 'f', 'KeyW': 'f',
    'ArrowDown': 'b', 'KeyS': 'b',
    'ArrowLeft': 'l', 'KeyA': 'l',
    'ArrowRight': 'r', 'KeyD': 'r',
    'Space': 'jump',
  };
  window.addEventListener('keydown', (e) => {
    if (keyMap[e.code]) {
      keys[keyMap[e.code]] = true;
      e.preventDefault();
    }
    if (e.code === 'KeyR') resetCar();
    if (e.code === 'KeyC') cameraMode = (cameraMode + 1) % 4;     // 0 chase, 1 top, 2 first, 3 drone
    if (e.code === 'KeyF') cameraMode = (cameraMode === 3) ? 0 : 3;  // F toggles drone cam
    if (e.code === 'KeyH') Sound.honk();
    if (e.code === 'KeyL') toggleFlyMode();        // takeoff / land
    if (e.code === 'KeyY') toggleDayNightAuto();   // freeze/resume day-night cycle
    // Project billboard cycling — only meaningful when active zone is 'projects'
    if ((e.code === 'KeyN' || e.code === 'BracketRight') && activeZone && activeZone.key === 'projects') {
      window.__imranProjectCycle(+1);
    }
    if ((e.code === 'KeyP' || e.code === 'BracketLeft') && activeZone && activeZone.key === 'projects') {
      window.__imranProjectCycle(-1);
    }
    if (e.code === 'KeyE' || e.code === 'Enter') {
      // If on the projects pad, open the currently displayed project
      if (activeZone && activeZone.key === 'projects') {
        window.__imranProjectOpen();
      } else {
        window.dispatchEvent(new Event('imran:interact'));
      }
    }
  });
  window.addEventListener('keyup', (e) => { 
    if (keyMap[e.code]) { 
      keys[keyMap[e.code]] = false; 
      e.preventDefault(); 
    } 
  });

  // ─────────────── MOUSE ORBIT (Blender-style hold + drag) ───────────────
  // Hold middle mouse button (or right-click) and drag to orbit the camera around the car.
  // Wheel zooms in/out. Releasing returns to chase smoothly.
  const orbit = {
    dragging: false,
    yawOff: 0, pitchOff: 0, zoom: 0,
    lastX: 0, lastY: 0,
  };
  const canvas = renderer.domElement;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) {  // middle or right
      orbit.dragging = true;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!orbit.dragging) return;
    const dx = e.clientX - orbit.lastX;
    const dy = e.clientY - orbit.lastY;
    orbit.lastX = e.clientX;
    orbit.lastY = e.clientY;
    orbit.yawOff -= dx * 0.005;
    orbit.pitchOff = Math.max(-0.6, Math.min(1.0, orbit.pitchOff - dy * 0.004));
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 1 || e.button === 2) orbit.dragging = false;
  });
  canvas.addEventListener('wheel', (e) => {
    orbit.zoom = Math.max(-6, Math.min(20, orbit.zoom + e.deltaY * 0.01));
    e.preventDefault();
  }, { passive: false });

  // Mobile joystick
  const joystick = document.querySelector('.joystick');
  const nub = document.querySelector('.joystick .nub');
  if (joystick) {
    let active = false; let cx = 0, cy = 0;
    const setPos = (e) => {
      const rect = joystick.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - (rect.left + rect.width/2);
      const dy = t.clientY - (rect.top + rect.height/2);
      const max = rect.width/2 - 28;
      const len = Math.min(Math.hypot(dx, dy), max);
      const ang = Math.atan2(dy, dx);
      const x = Math.cos(ang) * len, y = Math.sin(ang) * len;
      nub.style.transform = `translate(${x}px, ${y}px)`;
      touch.x = x / max; touch.y = y / max;
    };
    const reset = () => { active = false; nub.style.transform = ''; touch.x = 0; touch.y = 0; };
    joystick.addEventListener('touchstart', (e) => { active = true; setPos(e); }, { passive: true });
    joystick.addEventListener('touchmove', (e) => { if (active) setPos(e); }, { passive: true });
    joystick.addEventListener('touchend', reset);
    joystick.addEventListener('touchcancel', reset);
  }
  const btnJump = document.querySelector('.btn-jump');
  if (btnJump) {
    btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); touch.jump = true; }, { passive: false });
    btnJump.addEventListener('touchend', () => { touch.jump = false; });
  }
  const btnReset = document.querySelector('.btn-reset');
  if (btnReset) btnReset.addEventListener('touchstart', resetCar, { passive: true });

  // ─────────────── CAR DRIVING ───────────────
  let yaw = 0;
  function resetCar() {
    chassis.velocity.set(0,0,0); chassis.angularVelocity.set(0,0,0);
    chassis.position.set(0, 3, 0);
    chassis.quaternion.set(0,0,0,1);
    yaw = 0;
  }

  // ─────────────── PLANE MODE (L key — toggle flight) ───────────────
  let flyMode = false;
  let flyAlt = 6;
  let flySpeed = 8;
  let wingScale = 0;       // animation 0..1

  function toggleFlyMode() {
    flyMode = !flyMode;
    if (flyMode) {
      flyAlt = Math.max(10, chassis.position.y + 8);
      flySpeed = 10;
      // Tower-style chase angle is more dramatic when flying
      cameraMode = 0;
      orbit.zoom = 6;        // pull camera back automatically
      orbit.pitchOff = 0.25; // tilt up to show horizon
      if (window.imranSound) {
        window.imranSound.honk();   // takeoff "horn"
      }
      if (window.__imranToast) window.__imranToast('✈ TAKEOFF — W/S thrust · A/D yaw · SPC climb · L land');
    } else {
      // Landing — drop velocity, let physics take over
      chassis.velocity.set(0, 0, 0);
      chassis.angularVelocity.set(0, 0, 0);
      chassis.position.y = Math.max(2, chassis.position.y);
      orbit.zoom = 0;
      orbit.pitchOff = 0;
      if (window.__imranToast) window.__imranToast('🛬 LANDED — back on the ground');
    }
  }

  function flyStep(dt) {
    let thrust = 0, yawIn = 0, alt = 0;
    if (keys.f) thrust += 1;
    if (keys.b) thrust -= 0.6;
    if (keys.l) yawIn += 1;
    if (keys.r) yawIn -= 1;
    if (keys.jump) alt += 1;            // Space = climb
    // Touch joystick: forward = throttle, side = yaw
    if (Math.abs(touch.y) > 0.15) thrust -= touch.y;
    if (Math.abs(touch.x) > 0.15) yawIn -= touch.x;

    // Smooth speed
    flySpeed = Math.max(2, Math.min(30, flySpeed + thrust * 12 * dt));
    flySpeed *= 0.985;     // slight drag so it doesn't stay at max
    yaw += yawIn * 1.4 * dt;
    // Climb / passive descent
    flyAlt = Math.max(5, Math.min(70, flyAlt + alt * 18 * dt - dt * 1.4));

    // Apply position + rotation
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    chassis.position.x += fx * flySpeed * dt;
    chassis.position.z += fz * flySpeed * dt;
    chassis.position.y = flyAlt;
    chassis.velocity.set(0, 0, 0);
    chassis.angularVelocity.set(0, 0, 0);
    // Bank into turns (slight roll)
    const bankRoll = -yawIn * 0.35;
    const qYaw = new CANNON.Quaternion();
    qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    const qRoll = new CANNON.Quaternion();
    qRoll.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), bankRoll);
    chassis.quaternion.copy(qYaw.mult(qRoll));
    // Animate wings up
    wingScale = Math.min(1, wingScale + dt * 4);
    wings.scale.set(wingScale, wingScale, wingScale);
    // Sync mesh
    carGroup.position.copy(chassis.position);
    carGroup.quaternion.copy(chassis.quaternion);
    return { speed: flySpeed, throttle: thrust };
  }

  // ─────────────── PUBLIC WORLD API (for minimap + UI integration) ───────────────
  window.imranWorld = {
    getCarPos: () => ({ x: chassis.position.x, z: chassis.position.z }),
    getCarYaw: () => yaw,
    getZones: () => zones.map(z => ({
      x: z.x, z: z.z, radius: z.radius, key: z.key, label: z.label || z.key,
    })),
    teleport: (tx, tz, faceYaw = null) => {
      chassis.velocity.set(0, 0, 0);
      chassis.angularVelocity.set(0, 0, 0);
      chassis.position.set(tx, 2, tz);
      if (faceYaw !== null) {
        yaw = faceYaw;
        chassis.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
      } else {
        chassis.quaternion.set(0, 0, 0, 1);
        yaw = 0;
      }
      if (chassis.wakeUp) chassis.wakeUp();
      if (window.imranSound) window.imranSound.click();
    },
  };

  let lastJump = 0;
  function driveStep(dt) {
    // Belt & suspenders: ensure chassis is awake whenever the user inputs.
    if (keys.f || keys.b || keys.l || keys.r || keys.jump || touch.jump
        || Math.abs(touch.x) > 0.15 || Math.abs(touch.y) > 0.15) {
      if (chassis.wakeUp) chassis.wakeUp();
    }
    // Determine input
    let throttle = 0, steer = 0, jump = false;
    if (keys.f) throttle += 1;
    if (keys.b) throttle -= 1;
    if (keys.l) steer += 1;
    if (keys.r) steer -= 1;
    if (keys.jump) jump = true;
    // Joystick: y- is forward (touch.y negative when up)
    if (Math.abs(touch.y) > 0.15) throttle -= touch.y;
    if (Math.abs(touch.x) > 0.15) steer -= touch.x;
    if (touch.jump) jump = true;

    // Detect on-ground (rough): y velocity small and chassis low
    const onGround = chassis.position.y < 1.3 && Math.abs(chassis.velocity.y) < 1.5;

    // Forward direction from yaw
    const fwd = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const speed = chassis.velocity.dot(fwd);

    if (onGround) {
      // Steering: tank-turn at low speed, normal at speed
      const minSpeedForTurn = 0.3;
      const sp0 = Math.hypot(chassis.velocity.x, chassis.velocity.z);
      const steerEffective = sp0 > minSpeedForTurn ? steer * 1.8 : steer * 1.0;
      yaw += steerEffective * dt;
      // Apply chassis quaternion (arcade: snap rotation, no torque)
      chassis.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), yaw);
      chassis.angularVelocity.set(0,0,0);

      // DIRECT VELOCITY CONTROL (bypasses cannon's force accumulator entirely).
      // applyForce was being silently dropped in cannon.js 0.6.2 — direct vector
      // assignment cannot be ignored by any physics engine.
      const accel = throttle * 14;            // m/s² when key held
      chassis.velocity.x += fwd.x * accel * dt;
      chassis.velocity.z += fwd.z * accel * dt;

      // Lateral damping (kill sideways drift)
      const right = new CANNON.Vec3(-fwd.z, 0, fwd.x);
      const lat = chassis.velocity.x * right.x + chassis.velocity.z * right.z;
      chassis.velocity.x -= right.x * lat * 0.85;
      chassis.velocity.z -= right.z * lat * 0.85;

      // Forward drag (slows the car when no throttle)
      const dragFactor = throttle === 0 ? 0.96 : 0.998;
      chassis.velocity.x *= dragFactor;
      chassis.velocity.z *= dragFactor;

      // Clamp top speed
      const sp = Math.hypot(chassis.velocity.x, chassis.velocity.z);
      const MAX = 22;
      if (sp > MAX) {
        chassis.velocity.x *= MAX/sp;
        chassis.velocity.z *= MAX/sp;
      }
      // Jump
      if (jump && performance.now() - lastJump > 700) {
        chassis.velocity.y = 9;
        lastJump = performance.now();
        Sound.jump();
      }
    } else {
      // Air: small steer for style
      yaw += steer * dt * 0.6;
    }

    // Auto-flip recovery when upside down
    const up = new CANNON.Vec3(0,1,0);
    const carUp = new CANNON.Vec3(0,1,0);
    chassis.quaternion.vmult(carUp, carUp);
    if (carUp.y < -0.2 && Math.hypot(chassis.velocity.x, chassis.velocity.z) < 1) {
      // upright after 1s
      autoFlipTimer += dt;
      if (autoFlipTimer > 1.2) { resetCar(); autoFlipTimer = 0; }
    } else autoFlipTimer = 0;

    // Sync mesh
    carGroup.position.copy(chassis.position);
    carGroup.quaternion.copy(chassis.quaternion);
    // Spin wheels
    const wheelSpin = (speed * dt) / 0.6;
    for (const w of wheelMeshes) w.rotation.x -= wheelSpin;
    return { speed, throttle, steer };
  }
  let autoFlipTimer = 0;

  // ─────────────── ZONES ───────────────
  // Each zone: position + radius + key (for UI to show)
  const zones = [];
  function addZonePad(x, z, color, label, key, radius = 4) {
    const padG = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.18, 48),
      new THREE.MeshStandardMaterial({ color: 0x1a1432, emissive: color, emissiveIntensity: 0.35, roughness: 0.5 })
    );
    padG.position.set(x, 0.05, z); padG.receiveShadow = true; scene.add(padG);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.2, radius + 0.05, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = -Math.PI/2; ring.position.set(x, 0.07, z); scene.add(ring);
    // Label floating
    const lab = makeLabel(label, '#ffffff', 84);
    lab.position.set(x, 5, z);
    scene.add(lab);
    zones.push({ x, z, radius, key, label, ring, lab });
  }

  // ─────────────── WELCOME ARCH (landmark over spawn) ───────────────
  // Pink+cyan neon arch spanning Pasha Boulevard at the spawn pad.
  // Made of two posts + arched top + "imran." letters glowing on the keystone.
  const archGroup = new THREE.Group();
  // Two thick posts on either side of the road
  for (const dx of [-7, 7]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 9, 12),
      new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
    );
    post.position.set(dx, 4.5, 12);
    post.castShadow = true;
    archGroup.add(post);
    // Decorative neon ring at the base of each post
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.10, 10, 28),
      new THREE.MeshStandardMaterial({ color: COL.pink, emissive: COL.pink, emissiveIntensity: 1.4 })
    );
    ring.rotation.x = Math.PI/2;
    ring.position.set(dx, 0.3, 12);
    archGroup.add(ring);
  }
  // Arched top — half torus
  const archTop = new THREE.Mesh(
    new THREE.TorusGeometry(7, 0.45, 16, 48, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
  );
  archTop.rotation.set(0, 0, 0);
  archTop.position.set(0, 9, 12);
  archTop.castShadow = true;
  archGroup.add(archTop);
  // Inner glowing arch (neon pink)
  const archGlow = new THREE.Mesh(
    new THREE.TorusGeometry(6.6, 0.18, 12, 48, Math.PI),
    new THREE.MeshBasicMaterial({ color: COL.pink, transparent: true, opacity: 0.95 })
  );
  archGlow.position.set(0, 9, 12.05);
  archGroup.add(archGlow);
  // Cyan inner trim
  const archGlow2 = new THREE.Mesh(
    new THREE.TorusGeometry(6.0, 0.08, 8, 48, Math.PI),
    new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.85 })
  );
  archGlow2.position.set(0, 9, 12.10);
  archGroup.add(archGlow2);
  // Keystone plank with "imran." label
  const keystone = new THREE.Mesh(
    new THREE.BoxGeometry(5.4, 1.6, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
  );
  keystone.position.set(0, 11.0, 12);
  keystone.castShadow = true;
  archGroup.add(keystone);
  const archLabel = makeLabel('imran .', '#ff3e8a', 130);
  archLabel.position.set(0, 11.0, 12.42);
  archLabel.scale.set(1.0, 1.0, 1.0);
  archGroup.add(archLabel);
  // Spotlights pointed at the arch from underneath for drama
  const archSpot = new THREE.PointLight(COL.pink, 1.4, 30, 2);
  archSpot.position.set(0, 8, 12);
  archGroup.add(archSpot);
  scene.add(archGroup);

  // ─────────────── PROCEDURAL BUILDINGS (3 variants, district-themed) ───────────────
  // A: Terracotta home (warm earthy)
  // B: Cream brick studio (lighter day-warm)
  // C: Tron-neon hacker tower (cybersecurity flag)
  function addBuilding(x, z, type, rotY = 0) {
    const g = new THREE.Group();
    if (type === 'A') {
      const w = 7, h = 6, d = 7;
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0xd9694a, roughness: 0.85, metalness: 0 })
      );
      walls.position.y = h/2; walls.castShadow = true; walls.receiveShadow = true;
      g.add(walls);
      // Sloped roof (squashed pyramid via cone with 4 segments)
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(w * 0.78, 2.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x7a2e1f, roughness: 0.85 })
      );
      roof.position.y = h + 1.2;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
      // Window grid (3x2 yellow squares per face)
      for (const [face, sign] of [[0, 1], [Math.PI, 1]]) {
        for (let wx = -1; wx <= 1; wx++) {
          for (let wy = 0; wy <= 1; wy++) {
            if (Math.random() > 0.7) continue;
            const win = new THREE.Mesh(
              new THREE.PlaneGeometry(0.8, 1.0),
              new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 0.7 })
            );
            win.position.set(wx * 1.6, 1.7 + wy * 1.8, sign * (d/2 + 0.02));
            win.rotation.y = face;
            g.add(win);
          }
        }
      }
    } else if (type === 'B') {
      const w = 8, h = 8, d = 6;
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0xf0dcb4, roughness: 0.8, metalness: 0 })
      );
      walls.position.y = h/2; walls.castShadow = true; walls.receiveShadow = true;
      g.add(walls);
      // Awning trim
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, 0.4, d + 0.5),
        new THREE.MeshStandardMaterial({ color: 0xa07a4e, roughness: 0.85 })
      );
      awning.position.y = 3.0;
      g.add(awning);
      // Tall cyan windows
      for (const sign of [-1, 1]) {
        for (let wx = -1; wx <= 1; wx++) {
          if (Math.random() > 0.75) continue;
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(1.0, 2.4),
            new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 0.5 })
          );
          win.position.set(wx * 2.2, 5.0, sign * (d/2 + 0.02));
          win.rotation.y = sign === -1 ? Math.PI : 0;
          g.add(win);
        }
      }
    } else { // C — Tron neon hacker tower
      const w = 5, h = 14, d = 5;
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0x1a1432, roughness: 0.6, metalness: 0.2 })
      );
      walls.position.y = h/2; walls.castShadow = true; walls.receiveShadow = true;
      g.add(walls);
      // Horizontal neon stripes (purple) at 3 heights
      for (const stripeY of [3, 7.5, 12]) {
        for (const side of [-1, 1]) {
          for (const axis of ['x', 'z']) {
            const stripe = new THREE.Mesh(
              new THREE.BoxGeometry(axis === 'x' ? w + 0.05 : 0.2, 0.2, axis === 'x' ? 0.2 : d + 0.05),
              new THREE.MeshStandardMaterial({ color: 0x8a3eff, emissive: 0x8a3eff, emissiveIntensity: 1.6 })
            );
            stripe.position.set(
              axis === 'x' ? 0 : side * (w/2 + 0.05),
              stripeY,
              axis === 'z' ? 0 : side * (d/2 + 0.05)
            );
            g.add(stripe);
          }
        }
      }
      // Vertical pink corner edges
      for (const cx of [-1, 1]) {
        for (const cz of [-1, 1]) {
          const edge = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, h, 6),
            new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: 0xff3e8a, emissiveIntensity: 1.4 })
          );
          edge.position.set(cx * (w/2), h/2, cz * (d/2));
          g.add(edge);
        }
      }
      // Antenna on top
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x222 })
      );
      antenna.position.y = h + 1.25;
      g.add(antenna);
      const blink = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: 0xff3e8a, emissiveIntensity: 1.6 })
      );
      blink.position.y = h + 2.5;
      g.add(blink);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  }

  // Place ~30 buildings around the perimeter, away from main driving zones
  const BUILDING_SPOTS = [
    // Downtown cluster (north-west, near about zone)
    [-44, -32, 'A'], [-44, -42, 'B'], [-32, -44, 'A'], [-44, -22, 'C'],
    [-58, -34, 'B'], [-32, -55, 'A'], [-44, -52, 'C'],
    // Tech park (north-east, around projects/billboard)
    [44, 16, 'C'], [44, 28, 'C'], [56, 18, 'B'], [44, 38, 'A'],
    [56, 28, 'C'], [38, 44, 'A'],
    // Skill alley (east side)
    [44, -16, 'C'], [44, -28, 'C'], [56, -22, 'B'], [44, -38, 'A'],
    // Mailroom (south)
    [-18, -55, 'A'], [16, -55, 'A'], [-30, -68, 'B'], [22, -68, 'B'],
    // Social Boulevard backdrop — moved behind the social arches at z=78
    [-40, 78, 'C'], [-22, 78, 'C'], [-2, 78, 'C'], [22, 78, 'C'], [40, 78, 'C'],
    // Riverside east tall buildings
    [54, 0, 'C'], [54, -8, 'B'],
    // Edge fillers
    [-58, 4, 'A'], [-58, 16, 'B'],
  ];
  for (const [x, z, t] of BUILDING_SPOTS) {
    addBuilding(x, z, t, Math.random() * Math.PI * 2);
  }

  // ─ ABOUT ZONE (Downtown anchor — civil engineer plan)
  addZonePad(-30, -25, COL.cyan, 'ABOUT ME', 'about', 5);
  // Info sign post
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 8), new THREE.MeshStandardMaterial({ color: 0x222 }));
  signPost.position.set(-30, 1.5, -25); scene.add(signPost);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x2a1a4a, emissive: COL.cyan, emissiveIntensity: 0.2 }));
  signBoard.position.set(-30, 3.3, -25); signBoard.castShadow = true; scene.add(signBoard);
  const signLab = makeLabel('hello !', '#ffffff', 100);
  signLab.position.set(-30, 3.3, -24.85); signLab.scale.set(0.45, 0.45, 0.45); scene.add(signLab);

  // ─ PROJECTS ZONE — 5 floating billboards
  const PROJECTS = [
    { name: 'MERN+GraphQL', url: 'https://github.com/Imranpasha30/MERN-GraphQL', color: 0xff3e8a },
    { name: 'ChatZ', url: 'https://github.com/Imranpasha30/ChatZ', color: 0x8a3eff },
    { name: 'Logistics', url: 'https://github.com/Imranpasha30/Logistics', color: 0x5ce5ff },
    { name: 'Travellers', url: 'https://github.com/Imranpasha30/Travellers', color: 0xffe066 },
    { name: 'Map_OJ', url: 'https://github.com/Imranpasha30/Map_OJ', color: 0xff6a3a },
  ];
  // ─── SINGLE ROTATING PROJECT BILLBOARD (Bruno Simon style) ───
  // One large wooden-framed billboard. Press N (next) / P (prev) to cycle
  // through projects on the same screen, E to open the active project URL.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85, metalness: 0.05 });
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 });

  const billX = 30, billZ = 30;         // Tech Park centerpiece (civil engineer plan)
  const billW = 14, billH = 8;
  const billY = 6;                       // center height of screen
  const frameT = 0.5;

  // Two big wooden posts (taller than the frame so they read as supports)
  for (const dx of [-billW/2 - 0.6, billW/2 + 0.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, billY + billH/2 + 1.2, 0.7), woodDarkMat);
    post.position.set(billX + dx, (billY + billH/2 + 1.2)/2, billZ);
    post.castShadow = true; scene.add(post);
  }

  // Top header plank with "PROJECTS" title
  const header = new THREE.Mesh(new THREE.BoxGeometry(billW + 2.0, 1.0, 0.6), woodMat);
  header.position.set(billX, billY + billH/2 + 1.0, billZ);
  header.castShadow = true; scene.add(header);
  const headerLab = makeLabel('PROJECTS', '#ffffff', 110);
  headerLab.position.set(billX, billY + billH/2 + 1.0, billZ + 0.32);
  headerLab.scale.set(0.85, 0.85, 0.85);
  scene.add(headerLab);

  // Wooden frame around the screen
  const ftop = new THREE.Mesh(new THREE.BoxGeometry(billW + frameT*2, frameT, frameT), woodMat);
  ftop.position.set(billX, billY + billH/2 + frameT/2, billZ); ftop.castShadow = true; scene.add(ftop);
  const fbot = new THREE.Mesh(new THREE.BoxGeometry(billW + frameT*2, frameT, frameT), woodMat);
  fbot.position.set(billX, billY - billH/2 - frameT/2, billZ); fbot.castShadow = true; scene.add(fbot);
  const flt  = new THREE.Mesh(new THREE.BoxGeometry(frameT, billH, frameT), woodMat);
  flt.position.set(billX - billW/2 - frameT/2, billY, billZ); flt.castShadow = true; scene.add(flt);
  const frt  = new THREE.Mesh(new THREE.BoxGeometry(frameT, billH, frameT), woodMat);
  frt.position.set(billX + billW/2 + frameT/2, billY, billZ); frt.castShadow = true; scene.add(frt);

  // Glowing screen face — material we mutate when project changes
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0a0612, emissive: PROJECTS[0].color, emissiveIntensity: 0.9, roughness: 0.4,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(billW, billH), screenMat);
  screen.position.set(billX, billY, billZ + 0.22);
  scene.add(screen);

  // Project name label — single CanvasTexture we redraw on cycle
  function makeMutableLabel(w, h, canvasW = 1024, canvasH = 256) {
    const cv = document.createElement('canvas'); cv.width = canvasW; cv.height = canvasH;
    const cx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    return { mesh, ctx: cx, canvas: cv, tex };
  }
  const nameLab = makeMutableLabel(billW * 0.85, billH * 0.4);
  nameLab.mesh.position.set(billX, billY + 0.6, billZ + 0.25);
  scene.add(nameLab.mesh);
  const subLab = makeMutableLabel(billW * 0.45, billH * 0.13, 512, 96);
  subLab.mesh.position.set(billX, billY - billH * 0.32, billZ + 0.25);
  scene.add(subLab.mesh);

  // Slideshow indicator dots below the screen
  const indicatorDots = [];
  const dotSpacing = 0.9;
  for (let i = 0; i < PROJECTS.length; i++) {
    const dot = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 0.45),
      new THREE.MeshBasicMaterial({ color: 0x666, transparent: true, opacity: 0.8 })
    );
    dot.position.set(
      billX - (PROJECTS.length - 1) * dotSpacing / 2 + i * dotSpacing,
      billY - billH/2 + 0.5,
      billZ + 0.26
    );
    scene.add(dot);
    indicatorDots.push(dot);
  }

  // Side controls panel — chalkboard with NEXT/PREV/OPEN/EXIT (right side)
  const ctrlX = billX + billW/2 + 3.0;
  const ctrlPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), woodDarkMat);
  ctrlPost.position.set(ctrlX, 2.0, billZ); ctrlPost.castShadow = true; scene.add(ctrlPost);
  const ctrlBoard = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 3.2, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x14101e, emissive: 0x1a1432, emissiveIntensity: 0.2, roughness: 0.7 })
  );
  ctrlBoard.position.set(ctrlX + 1.4, 3.0, billZ); ctrlBoard.castShadow = true; scene.add(ctrlBoard);
  // Wooden frame around the chalkboard
  for (const [dx, dy, w, h] of [[0, 1.6, 2.6, 0.15], [0, -1.6, 2.6, 0.15], [-1.3, 0, 0.15, 3.2], [1.3, 0, 0.15, 3.2]]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), woodMat);
    plank.position.set(ctrlX + 1.4 + dx, 3.0 + dy, billZ);
    scene.add(plank);
  }
  // Control labels
  const ctrlLines = [
    { text: 'NEXT  N→', color: '#ff3e8a' },
    { text: 'PREV  ←P', color: '#5ce5ff' },
    { text: 'OPEN  E↵', color: '#ffe066' },
    { text: 'EXIT  ESC', color: '#888888' },
  ];
  ctrlLines.forEach((cl, i) => {
    const lab = makeLabel(cl.text, cl.color, 80);
    lab.position.set(ctrlX + 1.4, 4.1 - i * 0.7, billZ + 0.10);
    lab.scale.set(0.32, 0.32, 0.32);
    scene.add(lab);
  });

  // Driveway pad in front
  const billPad = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 4.5, 0.16, 40),
    new THREE.MeshStandardMaterial({ color: 0x1a1432, emissive: PROJECTS[0].color, emissiveIntensity: 0.4 })
  );
  billPad.position.set(billX, 0.05, billZ - 6); scene.add(billPad);
  const billRing = new THREE.Mesh(
    new THREE.RingGeometry(4.3, 4.6, 64),
    new THREE.MeshBasicMaterial({ color: PROJECTS[0].color, transparent: true, opacity: 0.7 })
  );
  billRing.rotation.x = -Math.PI/2; billRing.position.set(billX, 0.07, billZ - 6); scene.add(billRing);

  // Single zone for the whole projects area
  zones.push({ x: billX, z: billZ - 6, radius: 4.5, key: 'projects', ring: billRing });

  // Project cycle state + update function
  let currentProj = 0;
  function drawScreenLabels() {
    const p = PROJECTS[currentProj];
    // Big project name
    const c = nameLab.ctx, w = nameLab.canvas.width, h = nameLab.canvas.height;
    c.clearRect(0, 0, w, h);
    c.font = '120px "Permanent Marker", "Caveat", cursive';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 14; c.shadowOffsetY = 4;
    c.fillStyle = '#ffffff';
    c.fillText(p.name, w/2, h/2);
    nameLab.tex.needsUpdate = true;
    // Subtitle
    const sc = subLab.ctx, sw = subLab.canvas.width, sh = subLab.canvas.height;
    sc.clearRect(0, 0, sw, sh);
    sc.font = '60px "Permanent Marker", cursive';
    sc.textAlign = 'center'; sc.textBaseline = 'middle';
    sc.shadowColor = 'rgba(0,0,0,0.5)'; sc.shadowBlur = 8;
    sc.fillStyle = '#ffe066';
    sc.fillText(`PROJECT 0${currentProj+1} / 0${PROJECTS.length}`, sw/2, sh/2);
    subLab.tex.needsUpdate = true;
    // Screen color
    screenMat.emissive.setHex(p.color);
    billPad.material.emissive.setHex(p.color);
    billRing.material.color.setHex(p.color);
    // Indicator dots
    for (let i = 0; i < indicatorDots.length; i++) {
      indicatorDots[i].material.color.setHex(i === currentProj ? p.color : 0x444444);
      indicatorDots[i].material.opacity = i === currentProj ? 1.0 : 0.4;
    }
  }
  drawScreenLabels();
  // Expose for keyboard handlers
  window.__imranProjectCycle = function (delta) {
    currentProj = (currentProj + delta + PROJECTS.length) % PROJECTS.length;
    drawScreenLabels();
    if (window.imranSound) window.imranSound.click();
  };
  window.__imranProjectOpen = function () {
    const p = PROJECTS[currentProj];
    if (window.imranSound) window.imranSound.click();
    window.open(p.url, '_blank');
    return p;
  };

  // ─ SKILLS ZONE — bowling-pin style stack of 9 boxes with logos labels
  // Featured skills as knockable icon cubes (top 9 visible in 3D).
  // Full skill list (used by Portfolio.html "View all" panel) is exposed via window.imranSkills.
  const SKILLS = [
    { name: 'React',    icon: '⚛',  color: 0x5ce5ff },
    { name: 'Node',     icon: 'JS', color: 0x9bc41a },
    { name: 'Mongo',    icon: '🍃', color: 0x4ad962 },
    { name: 'GraphQL',  icon: '◆',  color: 0xff3e8a },
    { name: 'Python',   icon: '🐍', color: 0xffe066 },
    { name: 'Docker',   icon: '🐳', color: 0x5cb8ff },
    { name: 'AWS',      icon: '☁',  color: 0xff9933 },
    { name: 'Burp',     icon: '🛡', color: 0xff6a3a },
    { name: 'Linux',    icon: '🐧', color: 0x8a3eff },
  ];
  // Full taxonomy for the "View all" list panel
  window.imranSkills = {
    languages: ['JavaScript', 'TypeScript', 'Python', 'Java', 'Bash', 'C/C++'],
    frontend:  ['React', 'Next.js', 'Redux', 'TailwindCSS', 'Three.js'],
    backend:   ['Node.js', 'Express', 'GraphQL', 'REST', 'WebSocket'],
    databases: ['MongoDB', 'PostgreSQL', 'Redis', 'MySQL'],
    devops:    ['Docker', 'Kubernetes', 'AWS', 'GitHub Actions', 'Linux'],
    security:  ['Burp Suite', 'Nmap', 'Metasploit', 'OWASP Top 10', 'HackTheBox', 'CTF'],
    mobile:    ['React Native', 'Android (Java/Kotlin)'],
    tools:     ['Git', 'Vim', 'VSCode', 'Wireshark', 'Postman'],
  };

  // Helper: render an icon onto a CanvasTexture (used for the front face of each block)
  function makeIconTexture(symbol, bgColor) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const c = cv.getContext('2d');
    // Painted background (slightly darker than block emissive for contrast)
    c.fillStyle = '#1a1432';
    c.fillRect(0, 0, 256, 256);
    // Color stripe at top
    c.fillStyle = '#' + bgColor.toString(16).padStart(6, '0');
    c.fillRect(0, 0, 256, 32);
    // Big icon glyph centered
    c.font = '160px "Permanent Marker", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    c.fillText(symbol, 128, 138);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const skillBodies = [];
  SKILLS.forEach((s, i) => {
    const ang = (i / SKILLS.length) * Math.PI * 2;
    const r = 5;
    const x = 30 + Math.cos(ang) * r;
    const z = -28 + Math.sin(ang) * r;
    const w = 1.5, h = 1.5, d = 1.5;        // square icon-cubes (was tall pins)
    const sideMat = new THREE.MeshStandardMaterial({
      color: s.color, emissive: s.color, emissiveIntensity: 0.25, roughness: 0.4
    });
    const iconTex = makeIconTexture(s.icon, s.color);
    const iconMat = new THREE.MeshStandardMaterial({
      map: iconTex, color: 0xffffff,
      emissive: 0x222222, emissiveIntensity: 0.6,
      roughness: 0.5,
    });
    // Cube material order: +x, -x, +y, -y, +z, -z. Icon shows on all 4 vertical faces.
    const mats = [iconMat, iconMat.clone(), sideMat, sideMat, iconMat.clone(), iconMat.clone()];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    mesh.position.set(x, h/2 + 0.05, z); mesh.castShadow = true; scene.add(mesh);
    // Small caption label below the cube
    const lab = makeLabel(s.name, '#3E2418', 80);
    lab.position.set(x, h + 0.4, z); lab.scale.set(0.4, 0.4, 0.4); scene.add(lab);
    // Knockable physics
    const body = new CANNON.Body({ mass: 6, material: bodyMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
    body.position.set(x, h/2 + 0.05, z);
    body.linearDamping = 0.1; body.angularDamping = 0.2;
    body.addEventListener('collide', (ev) => {
      const imp = ev.contact && ev.contact.getImpactVelocityAlongNormal
        ? Math.abs(ev.contact.getImpactVelocityAlongNormal()) : 4;
      if (imp > 2.5) Sound.crash(imp);
    });
    world.addBody(body);
    objects.push({ mesh, body, lab, labYOffset: 0 });
    skillBodies.push(body);
  });
  addZonePad(30, -28, COL.purple, 'SKILLS', 'skills', 7.5);

  // ─ CONTACT ZONE — giant mailbox in Mailroom cul-de-sac (south terminus)
  const mailboxX = 0, mailboxZ = -70;
  addZonePad(mailboxX, mailboxZ, COL.yellow, 'CONTACT', 'contact', 5);
  const mbBox = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: COL.pink, emissiveIntensity: 0.2, roughness: 0.4 }));
  mbBox.position.set(mailboxX, 2.5, mailboxZ); mbBox.castShadow = true; scene.add(mbBox);
  const mbTop = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3, 16, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: COL.pink, emissiveIntensity: 0.3 }));
  mbTop.rotation.z = Math.PI/2; mbTop.position.set(mailboxX, 3.7, mailboxZ); mbTop.castShadow = true; scene.add(mbTop);
  const mbPost = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x222 }));
  mbPost.position.set(mailboxX, 0.75, mailboxZ); scene.add(mbPost);
  const mbFlag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 0.4 }));
  mbFlag.position.set(mailboxX + 1.55, 3, mailboxZ + 1); scene.add(mbFlag);

  // ─ SOCIAL ZONE — 4 floating glowing icons (drive under to "open")
  const SOCIALS = [
    { name: 'GitHub', url: 'https://github.com/Imranpasha30', color: 0xffffff, sym: 'GH' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/in/imran-pasha-/', color: 0x5ce5ff, sym: 'in' },
    { name: 'Twitter', url: 'https://twitter.com/', color: 0x8a3eff, sym: 'X' },
    { name: 'HackTheBox', url: 'https://www.hackthebox.com/', color: 0xc1ff12, sym: 'HTB' },
  ];
  SOCIALS.forEach((s, i) => {
    // Spread across Social Boulevard (-30 to +30) at z=60
    const x = -30 + i * 20;
    const z = 60;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.18, 16, 32), new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.7, roughness: 0.3 }));
    torus.position.set(x, 4, z); torus.castShadow = true; scene.add(torus);
    const lab = makeLabel(s.sym, '#ffffff', 120);
    lab.position.set(x, 4, z); lab.scale.set(0.35, 0.35, 0.35); scene.add(lab);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.14, 32), new THREE.MeshStandardMaterial({ color: 0x1a1432, emissive: s.color, emissiveIntensity: 0.25 }));
    pad.position.set(x, 0.05, z); scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.7, 48), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI/2; ring.position.set(x, 0.07, z); scene.add(ring);
    zones.push({ x, z, radius: 2.6, key: 'social_' + i, social: s, ring, label: s.name, lab, torus });
  });

  // ─ FUN ZONE — ramp, loop, breakable bricks, pins (Recreation district NW corner)
  // Ramp
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x6a3aff, emissive: 0x4020aa, emissiveIntensity: 0.2, roughness: 0.5 }));
  ramp.position.set(-55, 2, 45); ramp.rotation.x = -Math.PI/8; ramp.castShadow = true; scene.add(ramp);
  const rampBody = new CANNON.Body({ mass: 0, material: groundMat });
  rampBody.addShape(new CANNON.Box(new CANNON.Vec3(4, 0.2, 6)));
  rampBody.position.copy(ramp.position);
  rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/8);
  world.addBody(rampBody);

  // Brick wall (12 small boxes) — moved to recreation cluster
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      addBox(1.4, 1.0, 0.8, -50 + i * 1.5, 0.5 + j * 1.05, 50, 0xff6a3a, 4, { rough: 0.7 });
    }
  }
  // Bowling pins (10) — moved to recreation cluster
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const r = 4 + Math.random();
    addBox(0.6, 1.6, 0.6, -40 + Math.cos(ang) * r, 0.85, 70 + Math.sin(ang) * r, 0xffffff, 1.5, { rough: 0.6 });
  }
  // Loop-the-loop (drivable) — moved to recreation cluster
  const loopX = -65, loopZ = 65, loopR = 9;
  const loopMesh = new THREE.Mesh(
    new THREE.TorusGeometry(loopR, 1.2, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: 0xff3e8a, emissiveIntensity: 0.4, roughness: 0.4 })
  );
  loopMesh.position.set(loopX, loopR, loopZ);
  scene.add(loopMesh);

  // Physics: arc of box segments approximating the inner driving surface.
  // Inner radius (where the car actually rolls) is loopR - 1.0 ≈ 8.
  const R_inner = 8.0, T_loop = 0.3, D_loop = 5.0, N_loop = 24;
  const segWidth = 2 * R_inner * Math.sin(Math.PI / N_loop) * 1.06; // slight overlap to seal seams
  const loopBody = new CANNON.Body({ mass: 0, material: groundMat });
  // Skip ~30° at the bottom for car entry (phi = 3π/2 = bottom)
  const skipHalf = Math.PI / 12; // ±15°
  for (let i = 0; i < N_loop; i++) {
    const phi = (i / N_loop) * Math.PI * 2;
    const dPhi = Math.atan2(Math.sin(phi - 1.5 * Math.PI), Math.cos(phi - 1.5 * Math.PI));
    if (Math.abs(dPhi) < skipHalf) continue;
    const cx = (R_inner + T_loop / 2) * Math.cos(phi);
    const cy = (R_inner + T_loop / 2) * Math.sin(phi);
    const offset = new CANNON.Vec3(cx, cy, 0);
    const shape = new CANNON.Box(new CANNON.Vec3(segWidth / 2, T_loop / 2, D_loop / 2));
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), phi - Math.PI / 2);
    loopBody.addShape(shape, offset, q);
  }
  loopBody.position.set(loopX, loopR, loopZ);
  world.addBody(loopBody);

  // Entrance ramp: -X side leading up to the bottom-of-loop entry at y ≈ 1.
  const loopRamp = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.4, 5),
    new THREE.MeshStandardMaterial({ color: 0xff3e8a, emissive: 0xff3e8a, emissiveIntensity: 0.25 })
  );
  const rampAng = Math.atan2(1.0, 8.0); // rises 1 unit over 8 length
  loopRamp.position.set(loopX - R_inner - 4, 0.5, loopZ);
  loopRamp.rotation.z = -rampAng; // tilt so +X end is higher
  loopRamp.castShadow = true;
  scene.add(loopRamp);
  const loopRampBody = new CANNON.Body({ mass: 0, material: groundMat });
  loopRampBody.addShape(new CANNON.Box(new CANNON.Vec3(4, 0.2, 2.5)));
  loopRampBody.position.copy(loopRamp.position);
  loopRampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -rampAng);
  world.addBody(loopRampBody);

  // FUN label (Recreation district)
  const funLab = makeLabel('FUN ZONE !', '#ffe066', 100);
  funLab.position.set(-55, 8, 55); funLab.scale.set(1.4, 1.4, 1.4); scene.add(funLab);

  // ─────────────── LABEL BILLBOARDING + ZONE TICK ───────────────
  const billboardLabels = [];
  scene.traverse(o => { if (o.material && o.material.map && o.geometry && o.geometry.type === 'PlaneGeometry') billboardLabels.push(o); });

  // ─────────────── CAMERA ───────────────
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  // ─── CINEMATIC INTRO STATE ───
  let cinematicActive = false;
  let cinematicT = 0;
  const CINEMATIC_DURATION = 6.0;   // seconds
  function startCinematic() {
    cinematicActive = true;
    cinematicT = 0;
    // Show overlay text (HTML side picks up this event)
    window.dispatchEvent(new Event('imran:cinematic:start'));
  }

  function updateCamera(dt, isStarted) {
    if (cinematicActive) {
      // Sweeping fly-over: high in NW, swings down toward spawn
      cinematicT += dt;
      const u = Math.min(1, cinematicT / CINEMATIC_DURATION);
      // Ease in/out cubic
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      // Start position high & far, end position at chase camera resting spot
      const startPos = new THREE.Vector3(-90, 60, 80);
      const endPos = new THREE.Vector3(0, 8, 18);
      camera.position.lerpVectors(startPos, endPos, e);
      // Look at center spawn area, with slow downward tilt at the end
      const lookT = new THREE.Vector3(0, 1.5 + (1 - e) * 4, 0);
      camera.lookAt(lookT);
      if (cinematicT >= CINEMATIC_DURATION) {
        cinematicActive = false;
        window.dispatchEvent(new Event('imran:cinematic:end'));
      }
      return;
    }
    if (!isStarted) {
      // pre-start: wider, slower orbit so the warm world has room to breathe
      const t = clock.getElapsedTime();
      camera.position.set(Math.cos(t * 0.10) * 18, 5, Math.sin(t * 0.10) * 18);
      camera.lookAt(0, 1.5, 0);
      return;
    }
    // Camera follows car (chase / top-down / first-person)
    const carPos = carGroup.position;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    if (cameraMode === 0) {
      // Chase: 10 behind, 6 above + mouse-drag orbit offsets + wheel zoom
      const dist = 10 + orbit.zoom;
      const camYaw = yaw + orbit.yawOff;
      const camPitch = orbit.pitchOff;
      const horizontalDist = dist * Math.cos(camPitch);
      const camHeight = 6.0 + dist * Math.sin(camPitch);
      camTarget.set(carPos.x, carPos.y + 1.4, carPos.z);
      camPos.set(
        carPos.x + Math.sin(camYaw) * horizontalDist,
        carPos.y + camHeight,
        carPos.z + Math.cos(camYaw) * horizontalDist
      );
    } else if (cameraMode === 1) {
      // Top-down (raised + pushed back)
      camTarget.set(carPos.x, carPos.y, carPos.z);
      camPos.set(carPos.x, carPos.y + 28, carPos.z + 10);
    } else if (cameraMode === 2) {
      // First-person
      camTarget.set(carPos.x + fwd.x * 4, carPos.y + 1.4, carPos.z + fwd.z * 4);
      camPos.set(carPos.x + fwd.x * 0.1, carPos.y + 1.6, carPos.z + fwd.z * 0.1);
    } else {
      // Drone cinematic — slow orbit at high altitude, looking down at the car
      const t = clock.getElapsedTime();
      const dist = 18 + orbit.zoom;
      const ang = t * 0.25;
      camTarget.set(carPos.x, carPos.y + 1.0, carPos.z);
      camPos.set(
        carPos.x + Math.cos(ang) * dist,
        carPos.y + 14,
        carPos.z + Math.sin(ang) * dist
      );
    }
    // Tighter follow — less trailing reduces the "motion-blur" feeling when accelerating
    camera.position.lerp(camPos, 1 - Math.pow(0.005, dt));
    const lookT = new THREE.Vector3().lerpVectors(camera.userData.lookAt || camTarget, camTarget, 0.35);
    camera.lookAt(lookT);
    camera.userData.lookAt = lookT;
  }

  // ─────────────── ZONE DETECTION ───────────────
  let activeZone = null;
  function checkZones() {
    const cx = carGroup.position.x, cz = carGroup.position.z;
    let entered = null;
    for (const z of zones) {
      const d = Math.hypot(cx - z.x, cz - z.z);
      if (d < z.radius + 0.5) { entered = z; break; }
    }
    if (entered !== activeZone) {
      activeZone = entered;
      if (activeZone) onEnterZone(activeZone);
      else onExitZone();
    }
  }

  // ─────────────── ANIMATE ───────────────
  const clock = new THREE.Clock();
  let started = false;
  function setStarted(v) { started = v; }
  function doStart() {
    try {
      setStarted(true);
      Sound.unlock();
      Sound.startEngine();
      Sound.startAmbient();
      startCinematic();      // ← trigger 6-sec fly-over intro
    } catch (e) {
      console.error('[world.js] doStart failed:', e);
      started = true; // ensure car drives even if audio fails
    }
  }
  window.addEventListener('imran:start', doStart);
  // If the user already clicked play before this listener attached
  // (race: Three.js ESM may load slowly), pick it up here.
  if (window.__imranStartRequested) doStart();

  function tick() {
    requestAnimationFrame(tick);
    try {
      const dt = Math.min(clock.getDelta(), 1/30);
      if (started) {
        let drv;
        if (flyMode) {
          drv = flyStep(dt);
        } else {
          drv = driveStep(dt);
          // Animate wings closing back when not flying
          if (wingScale > 0) {
            wingScale = Math.max(0, wingScale - dt * 4);
            wings.scale.set(wingScale, wingScale, wingScale);
          }
        }
        const planarSpeed = flyMode ? drv.speed : Math.hypot(chassis.velocity.x, chassis.velocity.z);
        Sound.updateEngine(planarSpeed, drv.throttle);
        // Emit dust behind rear wheels when moving fast on ground (skip in flight)
        if (!flyMode && useBloom && planarSpeed > 4 && chassis.position.y < 1.4) {
          const wp = new THREE.Vector3();
          for (const i of [0, 1]) { // rear wheels: indices 0 & 1 (z = +1.3 in local space)
            wheelMeshes[i].getWorldPosition(wp);
            emitDust(wp.x, 0.2, wp.z);
          }
        }
        updateDust(dt);
        world.step(1/60, dt, 3);
        // Sync dynamic objects
        for (const o of objects) {
          o.mesh.position.copy(o.body.position);
          o.mesh.quaternion.copy(o.body.quaternion);
          if (o.lab) {
            o.lab.position.set(o.body.position.x, o.body.position.y, o.body.position.z + 0.7);
            o.lab.lookAt(camera.position);
          }
        }
        window.dispatchEvent(new CustomEvent('imran:speed', { detail: Math.hypot(chassis.velocity.x, chassis.velocity.z) }));
        checkZones();
      } else {
        world.step(1/60, dt, 3);
        for (const o of objects) {
          o.mesh.position.copy(o.body.position);
          o.mesh.quaternion.copy(o.body.quaternion);
        }
      }
      // Camera follow
      updateCamera(dt, started);
      // Billboard labels to camera
      billboardLabels.forEach(l => l.lookAt(camera.position));
      // Pulse rings
      const t = clock.getElapsedTime();
      spawnRing.material.opacity = 0.5 + Math.sin(t * 2) * 0.25;
      zones.forEach(z => { if (z.ring) { z.ring.material.opacity = 0.5 + Math.sin(t * 2 + z.x) * 0.3; } if (z.torus) { z.torus.rotation.y = t * 1.5; z.torus.position.y = 4 + Math.sin(t * 2 + z.x) * 0.4; } });
      // Sun spin
      sun.rotation.z = t * 0.05;
      // River wave animation
      riverMat.uniforms.uTime.value = t;

      // ─── DAY/NIGHT CYCLE ───
      if (timeAutoAdvance) timeOfDay = (timeOfDay + dt / 90) % 1;     // 90 sec per full day
      // Sun arc: rises from x=-100, peaks at y=80, sets at x=+100
      const sunAng = (timeOfDay - 0.25) * Math.PI * 2;     // 0 at noon, ±π at midnight
      const sunY = Math.cos(sunAng) * 50 + 5;
      const sunX = Math.sin(sunAng) * 80;
      moon.position.set(sunX, Math.max(sunY, -5), 30);
      const dayPhase = Math.cos(sunAng) * 0.5 + 0.5;       // 0 night, 1 noon
      moon.intensity = 0.3 + dayPhase * 1.4;
      // Sky color blend: night → dawn → noon → sunset → night
      const skyColors = {
        night:   new THREE.Color(0x1a1838),
        dawn:    new THREE.Color(0xff8a5a),
        noon:    new THREE.Color(0x88c9ff),
        sunset:  new THREE.Color(0xffb070),
      };
      let skyA, skyB, skyT;
      if (timeOfDay < 0.15)        { skyA = skyColors.night;  skyB = skyColors.dawn;   skyT = timeOfDay / 0.15; }
      else if (timeOfDay < 0.40)   { skyA = skyColors.dawn;   skyB = skyColors.noon;   skyT = (timeOfDay - 0.15) / 0.25; }
      else if (timeOfDay < 0.60)   { skyA = skyColors.noon;   skyB = skyColors.sunset; skyT = (timeOfDay - 0.40) / 0.20; }
      else if (timeOfDay < 0.85)   { skyA = skyColors.sunset; skyB = skyColors.night;  skyT = (timeOfDay - 0.60) / 0.25; }
      else                         { skyA = skyColors.night;  skyB = skyColors.night;  skyT = 0; }
      const skyCol = skyA.clone().lerp(skyB, skyT);
      scene.background.copy(skyCol);
      scene.fog.color.copy(skyCol);

      // ─── CLOUDS DRIFT ───
      for (const c of clouds) {
        c.group.position.x += c.driftSpeed * dt;
        if (c.group.position.x > 120) c.group.position.x = -120;
        c.group.position.y = c.baseY + Math.sin(t * 0.3 + c.driftSpeed * 5) * 0.4;
      }

      // ─── HOLOGRAPHIC GLOBE ───
      globeWire.rotation.y = t * 0.4;
      globeCore.rotation.y = -t * 0.2;
      for (const n of globeNodes) {
        n.angle += n.speed * dt;
        n.mesh.position.set(
          n.orbitR * Math.cos(n.angle),
          Math.sin(n.tilt) * n.orbitR + Math.sin(t * 0.6 + n.angle) * 0.15,
          n.orbitR * Math.sin(n.angle)
        );
      }

      // ─── STARS (fade in/out with day-night cycle) ───
      // dayPhase is 0 (night) to 1 (noon) — invert for star visibility
      const nightAmount = Math.max(0, 1 - dayPhase * 1.6);
      starMat.opacity = nightAmount * 0.95;
      // Subtle twinkle by rotating the points slightly
      stars.rotation.y = t * 0.005;

      // ─── METEORS (only spawn when night, occasional) ───
      meteorCooldown -= dt;
      if (nightAmount > 0.4 && meteorCooldown <= 0) {
        spawnMeteor();
        meteorCooldown = 2 + Math.random() * 8;
      }
      for (const m of meteors) {
        if (m.life <= 0) {
          m.line.material.opacity = 0;
          continue;
        }
        m.life -= dt;
        // Move tail end forward (creating streak)
        m.pos[3] += m.vx * dt;
        m.pos[4] += m.vy * dt;
        m.pos[5] += m.vz * dt;
        // Move start point forward at half speed (so streak grows then fades)
        m.pos[0] += m.vx * dt * 0.4;
        m.pos[1] += m.vy * dt * 0.4;
        m.pos[2] += m.vz * dt * 0.4;
        m.line.geometry.attributes.position.needsUpdate = true;
        m.line.material.opacity = Math.min(1, m.life * 1.5) * nightAmount;
      }

      // ─── SKY-WRITING AIRPLANE ───
      if (planeState.active) {
        planeState.progress += dt / planeState.duration;
        if (planeState.progress >= 1) {
          planeState.active = false;
          planeGroup.visible = false;
          planeState.cooldown = 35 + Math.random() * 35;
        } else {
          const px = planeState.startX + (planeState.endX - planeState.startX) * planeState.progress;
          const py = planeState.altitude + Math.sin(planeState.progress * Math.PI * 2) * 1.2;
          const pz = planeState.z;
          planeGroup.position.set(px, py, pz);
          // Face direction of travel
          planeGroup.rotation.y = (planeState.endX > planeState.startX) ? 0 : Math.PI;
          // Drop a trail particle every frame
          dropTrail(px - (planeState.endX > planeState.startX ? 0.7 : -0.7), py, pz);
        }
      } else {
        planeState.cooldown -= dt;
        if (planeState.cooldown <= 0) spawnPlane();
      }
      // Fade trail particles
      let trailDirty = false;
      for (let i = 0; i < TRAIL_MAX; i++) {
        if (trailLives[i] > 0) {
          trailLives[i] -= dt;
          if (trailLives[i] <= 0) { trailPos[i*3 + 1] = -1000; trailDirty = true; }
        }
      }
      if (trailDirty) trailGeo.attributes.position.needsUpdate = true;
      // Always update positions if plane is dropping new ones
      if (planeState.active) trailGeo.attributes.position.needsUpdate = true;
      trailMat.opacity = 0.4 + dayPhase * 0.5;

      // ─── CHERRY PETALS DRIFT (continuous, recycled) ───
      for (let i = 0; i < PETAL_MAX; i++) {
        petalPos[i*3 + 0] += petalVel[i*3 + 0] * dt + Math.sin(t * 1.4 + i) * 0.04;
        petalPos[i*3 + 1] += petalVel[i*3 + 1] * dt;
        petalPos[i*3 + 2] += petalVel[i*3 + 2] * dt + Math.cos(t * 1.1 + i) * 0.04;
        if (petalPos[i*3 + 1] < 0.2) {
          petalPos[i*3 + 0] = -65 + (Math.random() - 0.5) * 30;
          petalPos[i*3 + 1] = 14 + Math.random() * 4;
          petalPos[i*3 + 2] = -55 + (Math.random() - 0.5) * 30;
        }
      }
      petalGeo.attributes.position.needsUpdate = true;

      // ─── DRIFT SMOKE (only when steering hard at speed, not in fly mode) ───
      if (!flyMode) {
        const planarV = Math.hypot(chassis.velocity.x, chassis.velocity.z);
        const steerInput = (keys.l ? 1 : 0) - (keys.r ? 1 : 0) - touch.x;
        if (planarV > 8 && Math.abs(steerInput) > 0.6) {
          // Find rear-wheel positions
          for (const wi of [0, 1]) {
            const wp = new THREE.Vector3();
            wheelMeshes[wi].getWorldPosition(wp);
            emitSmoke(wp.x, wp.z);
          }
        }
        // Decay + raise smoke particles
        let dirty = false;
        for (let i = 0; i < SMOKE_MAX; i++) {
          if (smokeLives[i] > 0) {
            smokeLives[i] -= dt;
            smokePos[i*3 + 1] += 0.8 * dt;     // smoke rises slowly
            if (smokeLives[i] <= 0) { smokePos[i*3 + 1] = -1000; dirty = true; }
            else dirty = true;
          }
        }
        if (dirty) smokeGeo.attributes.position.needsUpdate = true;
      }

      // ─── FIREWORKS UPDATE ───
      let fwDirty = false;
      for (let i = 0; i < FW_MAX; i++) {
        if (fwLives[i] > 0) {
          fwLives[i] -= dt;
          fwPos[i*3 + 0] += fwVel[i*3 + 0] * dt;
          fwPos[i*3 + 1] += fwVel[i*3 + 1] * dt;
          fwPos[i*3 + 2] += fwVel[i*3 + 2] * dt;
          fwVel[i*3 + 1] -= 9 * dt;     // gravity pulls particles down
          if (fwLives[i] <= 0) { fwPos[i*3 + 1] = -1000; }
          fwDirty = true;
        }
      }
      if (fwDirty) fwGeo.attributes.position.needsUpdate = true;

      // ─── COIN ANIMATION + COLLECTION ───
      const cp = carGroup.position;
      for (const c of coins) {
        if (c.collected) continue;
        c.mesh.rotation.y = t * 2;
        c.mesh.position.y = 1.2 + Math.sin(t * 3 + c.x * 0.1) * 0.15;
        const d = Math.hypot(cp.x - c.x, cp.z - c.z);
        if (d < 1.6) {
          c.collected = true;
          scene.remove(c.mesh);
          coinsCollected++;
          if (window.imranSound) window.imranSound.click();
          window.dispatchEvent(new CustomEvent('imran:coin', { detail: { collected: coinsCollected, total: coinTotal } }));
          // Small fireworks at every 5th coin + huge burst on completion
          if (coinsCollected % 5 === 0) fireBurst(c.x, 4, c.z);
          if (coinsCollected === coinTotal) {
            // 5 bursts above the car for the finale
            for (let b = 0; b < 5; b++) {
              setTimeout(() => fireBurst(cp.x + (Math.random()-0.5)*12, 12 + Math.random()*4, cp.z + (Math.random()-0.5)*12), b * 250);
            }
          }
        }
      }

      // ─── WEATHER CYCLE (deterministic, advances with time) ───
      weatherCycleT = (weatherCycleT + dt / WEATHER_CYCLE_LEN) % 1;
      setWeather(weatherForT(weatherCycleT));
      // Lightning flashes during storms
      if (weather === 'storm') {
        lightningCooldown -= dt;
        if (lightningCooldown <= 0) {
          flashLightning();
          lightningCooldown = 1.5 + Math.random() * 5.5;   // 1.5–7s between flashes
        }
      }
      // Apply active lightning flash (boost sun intensity briefly + whiten sky)
      if (lightningFlashT > 0) {
        lightningFlashT -= dt;
        const intensity = Math.max(0, lightningFlashT / 0.18);
        moon.intensity = (0.3 + dayPhase * 1.4) + intensity * 4.5;
        const flashCol = new THREE.Color(0xffffff).lerp(skyCol, 1 - intensity);
        scene.background.copy(flashCol);
      }

      // ─── RAIN ANIMATION (always animates when visible, follows car) ───
      if (rain.visible) {
        const cp = carGroup.position;
        const positions = rainGeo.attributes.position.array;
        const fallSpeed = (weather === 'storm') ? 50 : 30;     // storm rain falls faster
        for (let i = 0; i < RAIN_MAX; i++) {
          positions[i*3 + 1] -= fallSpeed * dt;
          if (positions[i*3 + 1] < 0) {
            positions[i*3 + 0] = cp.x + (Math.random() - 0.5) * 80;
            positions[i*3 + 1] = 60;
            positions[i*3 + 2] = cp.z + (Math.random() - 0.5) * 80;
          }
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      // Observation tower beacon sweep — rotates target around tower base
      if (window.__imranBeacon) {
        const b = window.__imranBeacon;
        const a = t * 0.6;
        b.target.position.set(Math.cos(a) * 30, -10, Math.sin(a) * 30);
        b.beacon.material.emissiveIntensity = 1.3 + Math.sin(t * 4) * 0.6;
      }
      // NPC walking — wander, but stop and wave when car gets close
      const carHere = carGroup.position;
      for (const n of npcs) {
        // Distance to car
        const ndx = carHere.x - n.group.position.x;
        const ndz = carHere.z - n.group.position.z;
        const carDist = Math.hypot(ndx, ndz);
        const greeting = carDist < 6;        // within 6m → wave!

        if (greeting) {
          // Face the car
          n.group.rotation.y = Math.atan2(ndx, ndz);
          // Reset legs (standing)
          n.lLeg.rotation.x = 0;
          n.rLeg.rotation.x = 0;
          n.group.position.y = 0;
          n.lArm.rotation.x = 0;
          // Wave: right arm raised + oscillating sideways
          n.waveT = Math.min(1, n.waveT + dt * 4);
          const waveBase = -Math.PI * 0.85 * n.waveT;       // raise high
          const waveSwing = Math.sin(t * 8 + n.phase) * 0.4;
          n.rArm.rotation.x = waveBase;
          n.rArm.rotation.z = waveSwing;
        } else {
          // Walk toward target
          n.waveT = Math.max(0, n.waveT - dt * 3);
          if (n.rArm.rotation.x !== 0) n.rArm.rotation.z = 0;
          const dx = n.targetX - n.group.position.x;
          const dz = n.targetZ - n.group.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.5) {
            n.targetX = n.homeX + (Math.random() - 0.5) * n.wanderRadius;
            n.targetZ = n.homeZ + (Math.random() - 0.5) * n.wanderRadius;
          } else {
            const move = n.speed * dt;
            n.group.position.x += dx / d * move;
            n.group.position.z += dz / d * move;
            n.group.rotation.y = Math.atan2(dx, dz);
            // Walking: legs + arms swing opposite
            const swing = Math.sin(t * 7 + n.phase) * 0.55;
            n.lLeg.rotation.x = swing;
            n.rLeg.rotation.x = -swing;
            n.lArm.rotation.x = -swing * 0.7;
            n.rArm.rotation.x = swing * 0.7;
            n.group.position.y = Math.abs(Math.sin(t * 7 + n.phase)) * 0.05;
          }
        }
      }
      // Traffic light cycle
      for (const tl of trafficLights) {
        tl.t += dt;
        if (tl.t > 3) { tl.state = (tl.state + 1) % 3; tl.t = 0; }
        for (let i = 0; i < 3; i++) {
          const active = i === tl.state;
          tl.lights[i].material.emissiveIntensity = active ? 1.6 : 0.15;
        }
      }
      if (useBloom) composer.render();
      else renderer.render(scene, camera);
    } catch (e) {
      console.error('[world.js] tick error:', e);
    }
  }
  tick();

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloom.setSize(window.innerWidth, window.innerHeight);
  });

  // ─────────────── ZONE → UI BRIDGE ───────────────
  function onEnterZone(z) {
    window.dispatchEvent(new CustomEvent('imran:zone', { detail: z }));
  }
  function onExitZone() {
    window.dispatchEvent(new CustomEvent('imran:zone', { detail: null }));
  }

  // Lite mode toggle
  window.addEventListener('imran:lite', (e) => {
    const lite = !!e.detail;
    renderer.shadowMap.enabled = !lite;
    moon.castShadow = !lite;
    markerGroup.visible = !lite;
    useBloom = !lite;
    scene.traverse(o => { if (o.isMesh && o !== ground) o.castShadow = !lite; });
  });

  // Reset signal from UI
  window.addEventListener('imran:reset', resetCar);
})();
