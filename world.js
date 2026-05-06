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
  const COL = { pink: 0xffb070, purple: 0x8a3eff, cyan: 0x5ce5ff, yellow: 0xffe066, red: 0xc63030, dark: 0x1d1a2e };

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
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
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
  scene.fog = new THREE.Fog(0xffc79a, 130, 600);

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
  // 700m square — ample room inside the 250-radius boundary + 280 mountain ring
  const groundGeo = new THREE.PlaneGeometry(700, 700);
  // Switzerland theme — alpine green meadow (was sandy beige)
  const groundMatT = new THREE.MeshStandardMaterial({ color: 0x6ab040, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(groundGeo, groundMatT);
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

  // Gridlines — keep Tron-purple grid as cybersecurity flag, soften for warm ground
  const grid = new THREE.GridHelper(700, 140, 0x8a3eff, 0xc49ee6);
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

  // ─── PLANNED EXTENSIONS (civil-engineer plan) ───
  // Outer ring + spurs that connect previously-orphaned districts to the road grid.
  // Naming follows CIVIL_PLAN.md.
  addRoadStrip(true,   42, 0, 100);     // NS-42E "Cable Car Drive" — feeds the cable-car ramp foot at (40, -17.5)
  addRoadStrip(true,  -42, 0, 100);     // NS-42W — symmetric, feeds Hacker's Den approach
  addRoadStrip(false,  0,  50, 100);    // EW-50N — north outer avenue, services Socials + Loop area
  addRoadStrip(false,  0, -50, 100);    // EW-50S — south outer avenue, services Park + Lake + Mailbox
  addRoadStrip(false, 40, -17.5, 10);   // Cable Car Apron — short bridge from NS-42E into ramp foot at (40, -17.5)
  addRoadStrip(false, 65,  0, 30);      // EW-0 east extension — flyover east foot now lands on tarmac
  addRoadStrip(false, 65, -10, 30);     // Server Room spur — connects NS-42E to Server Room (80,-10)
  addRoadStrip(false,-65, -10, 30);     // Hacker's Den spur — connects NS-42W to Hacker's Den (-80,-10)
  addRoadStrip(false, 70,  50, 30);     // Tower Approach — leads to Observation Tower (85,65)
  addRoadStrip(false,-55,  60, 25);     // Recreation Lane — services loop / bowling area
  addRoadStrip(true, -77,  65, 16);     // Loop entry stub — lines up with loop entry ramp at x=-77

  // Intersection accents — small glowing pads where main roads cross.
  // Now includes outer-ring corners so the new junctions read as intersections.
  const interMat = new THREE.MeshBasicMaterial({ color: COL.purple, transparent: true, opacity: 0.4 });
  for (const x of [-42, -22, 0, 22, 42]) {
    for (const z of [-50, -22, 0, 22, 50]) {
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
    new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xffb070, emissiveIntensity: 0.4 })
  );
  planeGroup.add(planeWing);
  const planeTail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xffb070, emissiveIntensity: 0.4 })
  );
  planeTail.position.set(-0.7, 0.2, 0);
  planeGroup.add(planeTail);
  scene.add(planeGroup);
  planeGroup.visible = false;

  // ─────────────── HOT AIR BALLOON (drifts slowly across sky) ───────────────
  const balloonGroup = new THREE.Group();
  // Stripes of colorful bands
  const balloonColors = [0xffb070, 0xffe066, 0x5ce5ff, 0xffb070, 0xffe066];
  for (let i = 0; i < balloonColors.length; i++) {
    const band = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 16, 8, 0, Math.PI * 2, i * Math.PI / 5, Math.PI / 5),
      new THREE.MeshStandardMaterial({ color: balloonColors[i], roughness: 0.7, emissive: balloonColors[i], emissiveIntensity: 0.15 })
    );
    balloonGroup.add(band);
  }
  // Ropes
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x4a3018 })
    );
    rope.position.set(dx * 0.6, -3.2, dz * 0.6);
    balloonGroup.add(rope);
  }
  // Basket
  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.8, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
  );
  basket.position.y = -4.4;
  balloonGroup.add(basket);
  balloonGroup.position.set(-90, 35, -40);
  scene.add(balloonGroup);
  // Soft glow around balloon for visibility
  const balloonLight = new THREE.PointLight(0xffe066, 0.5, 10, 2);
  balloonLight.position.copy(balloonGroup.position);
  scene.add(balloonLight);

  // ─────────────── BIRDS (V-formation periodically) ───────────────
  const birdsGroup = new THREE.Group();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const bird = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.7, 4),
      birdMat
    );
    bird.rotation.x = Math.PI / 2;
    birdsGroup.add(bird);
    // V-formation offsets: leader at index 0, others spread out behind
    const slot = Math.ceil(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    birds.push({ mesh: bird, ox: side * slot * 1.5, oz: slot * 1.4 });
  }
  scene.add(birdsGroup);
  birdsGroup.visible = false;
  let birdsTimer = 25;     // first appearance after 25s
  let birdsProgress = 0;

  // ─────────────── PET DOG NPC (follows car when nearby) ───────────────
  const dogGroup = new THREE.Group();
  const dogBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.4, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.7 })
  );
  dogBody.position.y = 0.45;
  dogBody.castShadow = true;
  dogGroup.add(dogBody);
  const dogHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.4, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.7 })
  );
  dogHead.position.set(0, 0.65, -0.55);
  dogGroup.add(dogHead);
  const dogEar1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, 0.08), new THREE.MeshStandardMaterial({ color: 0x6a4018 }));
  dogEar1.position.set(-0.18, 0.85, -0.55); dogGroup.add(dogEar1);
  const dogEar2 = dogEar1.clone(); dogEar2.position.x = 0.18; dogGroup.add(dogEar2);
  const dogTail = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x6a4018 })
  );
  dogTail.position.set(0, 0.55, 0.55);
  dogGroup.add(dogTail);
  dogGroup.position.set(-58, 0, -50);    // starts in the park
  scene.add(dogGroup);
  let dogTarget = { x: -58, z: -50 };
  let dogState = 'wander';                 // 'wander' | 'follow'

  // ─────────────── HIDDEN BUNKER EASTER EGG ───────────────
  // Hold E for 3 seconds at (-50, 30) near the HTB skull → camera dips below ground,
  // reveals a small dark room with a CRT terminal showing scrolling code.
  // Bunker mesh sits 8m underground, directly below the new skull location.
  const bunkerGroup = new THREE.Group();
  bunkerGroup.position.set(-50, -8, 30);   // 8m below ground (under HTB skull)
  // Floor
  const bFloor = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.9 })
  );
  bFloor.position.y = 0;
  bunkerGroup.add(bFloor);
  // Walls (4 sides)
  for (const [w, d, ox, oz] of [[8, 0.2, 0, -4], [8, 0.2, 0, 4], [0.2, 8, -4, 0], [0.2, 8, 4, 0]]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, 4, d),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, emissive: 0x002200, emissiveIntensity: 0.2 })
    );
    wall.position.set(ox, 2, oz);
    bunkerGroup.add(wall);
  }
  // Ceiling
  const bCeil = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x111 })
  );
  bCeil.position.y = 4;
  bunkerGroup.add(bCeil);
  // CRT terminal screen (back wall, glowing green)
  const crtCanvas = document.createElement('canvas');
  crtCanvas.width = 512; crtCanvas.height = 256;
  const crtCtx = crtCanvas.getContext('2d');
  const crtTex = new THREE.CanvasTexture(crtCanvas);
  crtTex.colorSpace = THREE.SRGBColorSpace;
  const crtScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 1.8),
    new THREE.MeshBasicMaterial({ map: crtTex, emissive: 0x00ff00, emissiveIntensity: 0.5 })
  );
  crtScreen.position.set(0, 2.2, -3.85);
  bunkerGroup.add(crtScreen);
  const crtLight = new THREE.PointLight(0x00ff00, 1.0, 8, 2);
  crtLight.position.set(0, 2, -2);
  bunkerGroup.add(crtLight);
  // Code lines (will be animated to scroll)
  const crtLines = [
    'root@imran:~$ nmap -sV target.io',
    'PORT     STATE  SERVICE',
    '22/tcp   open   ssh OpenSSH 8.2',
    '443/tcp  open   https nginx 1.18',
    '8080/tcp open   http-proxy',
    'root@imran:~$ sudo ./escalate.sh',
    '[+] kernel exploit landed',
    '[+] root shell obtained ✓',
    'root@imran:~# whoami',
    'root',
    'root@imran:~# cat /etc/shadow',
    'root:$6$rounds=...',
    'root@imran:~# echo "owned" > flag.txt',
    'root@imran:~# nc -lvp 4444',
    'listening on [any] 4444 ...',
  ];
  let crtScroll = 0;
  function drawCrt() {
    crtCtx.fillStyle = '#001100';
    crtCtx.fillRect(0, 0, 512, 256);
    crtCtx.fillStyle = '#00ff66';
    crtCtx.font = '14px "JetBrains Mono", monospace';
    crtCtx.shadowColor = '#00ff66';
    crtCtx.shadowBlur = 4;
    for (let i = 0; i < 14; i++) {
      const lineIdx = (Math.floor(crtScroll) + i) % crtLines.length;
      crtCtx.fillText(crtLines[lineIdx], 10, 20 + i * 17);
    }
    crtTex.needsUpdate = true;
  }
  drawCrt();
  scene.add(bunkerGroup);
  // State
  let bunkerProgress = 0;             // 0..3 sec hold time at trigger spot
  let bunkerActive = false;
  const BUNKER_TRIGGER = { x: -50, z: 30, radius: 3 };   // co-located with HTB skull

  // ─────────────── REFLECTIVE LAKE WATER (faux reflection via mirror plane) ───────────────
  // Note: Real Reflector requires extra render passes which slow things down.
  // Faux version: a shiny semi-transparent plane on top of the existing lake
  // so it picks up the sky color and feels reflective.
  const lakeShine = new THREE.Mesh(
    new THREE.CircleGeometry(20, 64),
    new THREE.MeshStandardMaterial({
      color: 0xb8e6ff, transparent: true, opacity: 0.35,
      roughness: 0.05, metalness: 0.95,
      emissive: 0x88ccff, emissiveIntensity: 0.15,
    })
  );
  lakeShine.rotation.x = -Math.PI/2;
  lakeShine.position.set(72, 0.10, -65);
  scene.add(lakeShine);

  // ─────────────── ACHIEVEMENTS ───────────────
  // 8 achievements tracked locally, persisted in localStorage. Unlocking fires a toast.
  const ACHIEVEMENT_LIST = [
    { id: 'first_drive',   icon: '🚗', text: 'Welcome — your first drive!',     check: (s) => s.distance > 5 },
    { id: 'speed_demon',   icon: '⚡', text: 'Speed Demon — top 20 m/s reached', check: (s) => s.topSpeed >= 20 },
    { id: 'all_coins',     icon: '🪙', text: 'Treasure Hunter — all coins!',    check: (s) => s.coins === 28 },
    { id: 'visited_all',   icon: '🗺', text: 'Tour Guide — visited every zone', check: (s) => s.zonesVisited.size >= 7 },
    { id: 'pinball',       icon: '💥', text: 'Pinball — knocked a skill cube',  check: (s) => s.skillKnocks > 0 },
    { id: 'aviator',       icon: '✈', text: 'Aviator — entered plane mode',     check: (s) => s.flewOnce },
    { id: 'drift_king',    icon: '🌀', text: 'Drift King — 3 sec sustained drift', check: (s) => s.driftTime >= 3 },
    { id: 'easter_hunter', icon: '🥚', text: 'Easter Hunter — found the bunker', check: (s) => s.foundBunker },
  ];
  const achievements = (function loadAchievements() {
    try { return new Set(JSON.parse(localStorage.getItem('imranAchievements') || '[]')); }
    catch (e) { return new Set(); }
  })();
  const stats = {
    distance: 0, topSpeed: 0, coins: 0, zonesVisited: new Set(),
    skillKnocks: 0, flewOnce: false, driftTime: 0, foundBunker: false,
  };
  function checkAchievements() {
    for (const a of ACHIEVEMENT_LIST) {
      if (!achievements.has(a.id) && a.check(stats)) {
        achievements.add(a.id);
        try { localStorage.setItem('imranAchievements', JSON.stringify([...achievements])); } catch (e) {}
        if (window.__imranToast) window.__imranToast(`🏆 ${a.icon} ${a.text}`);
      }
    }
  }
  // Expose for HTML achievements panel
  window.imranAchievements = { list: ACHIEVEMENT_LIST, unlocked: achievements, stats };

  // ─────────────── COIN NITRO BOOST (Shift = burn collected coins for speed) ───────────────
  let nitroFuel = 0;             // increments by 1 per coin (max 6)
  let nitroActive = false;
  let nitroTimer = 0;
  function activateNitro() {
    if (nitroFuel <= 0 || nitroActive) return;
    nitroActive = true;
    nitroTimer = 3.0;
    nitroFuel--;
    if (window.__imranToast) window.__imranToast(`⚡ NITRO BOOST ×${nitroFuel} left`);
  }
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') activateNitro();
  });
  // Listen for coin collection to refill nitro
  window.addEventListener('imran:coin', (e) => {
    nitroFuel = Math.min(6, nitroFuel + 1);
  });

  // ─────────────── DRIFT SCORING ───────────────
  let driftActive = false;
  let driftDuration = 0;
  let driftScore = 0;
  let totalDriftScore = 0;

  // ─────────────── TIME TRIAL MODE ───────────────
  let trialActive = false;
  let trialStart = 0;
  let trialBest = parseFloat(localStorage.getItem('imranTrialBest') || '999');
  function startTrial() {
    if (trialActive) return;
    trialActive = true;
    trialStart = performance.now();
    if (window.__imranToast) window.__imranToast('⏱ TIME TRIAL — visit all zones, fastest wins');
  }
  function endTrial() {
    if (!trialActive) return;
    trialActive = false;
    const elapsed = (performance.now() - trialStart) / 1000;
    const best = elapsed < trialBest;
    if (best) { trialBest = elapsed; try { localStorage.setItem('imranTrialBest', elapsed); } catch(e) {} }
    const medal = elapsed < 30 ? '🥇' : elapsed < 60 ? '🥈' : elapsed < 90 ? '🥉' : '🏁';
    if (window.__imranToast) window.__imranToast(`${medal} ${elapsed.toFixed(1)}s${best ? ' — NEW BEST!' : ''}`);
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyZ') {                     // Z = toggle time trial
      if (trialActive) endTrial(); else startTrial();
    }
  });

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
      new THREE.MeshBasicMaterial({ color: 0xffb070 })
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
    new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xffb070, emissiveIntensity: 1.8 })
  );
  beacon.position.y = towerH + 3.4;
  towerGroup.add(beacon);
  const beaconLight = new THREE.SpotLight(0xffb070, 1.8, 80, Math.PI/4, 0.5, 1.2);
  beaconLight.position.y = towerH + 3.4;
  beaconLight.target.position.set(20, 0, 0);    // initial
  towerGroup.add(beaconLight);
  towerGroup.add(beaconLight.target);
  towerGroup.position.set(85, 0, 65);
  scene.add(towerGroup);

  // ─────────────── HTB SKULL STATUE (cybersec easter egg) ───────────────
  // Gateway landmark for the Hacker's Den district — relocated to (-50, 30) on
  // the path the player takes from spawn out to the western Hacker's Den.
  const SKULL_X = -50, SKULL_Z = 30;
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.5, 1.6, 16),
    new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
  );
  pedestal.position.set(SKULL_X, 0.8, SKULL_Z); pedestal.castShadow = true; scene.add(pedestal);
  const skullBase = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 16, 14),
    new THREE.MeshStandardMaterial({ color: 0xfff5e0, emissive: 0xc1ff12, emissiveIntensity: 0.4, roughness: 0.4 })
  );
  skullBase.position.set(SKULL_X, 2.5, SKULL_Z); skullBase.castShadow = true; scene.add(skullBase);
  // Eye sockets (dark spheres slightly inset)
  for (const dx of [-0.28, 0.28]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x000, emissive: 0xc1ff12, emissiveIntensity: 1.6 })
    );
    eye.position.set(SKULL_X + dx, 2.65, SKULL_Z + 0.7);
    scene.add(eye);
  }
  // HTB nameplate
  const plateLab = makeLabel('HTB', '#c1ff12', 90);
  plateLab.position.set(SKULL_X, 1.3, SKULL_Z + 1.55);
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
    // Alpine Village forest backdrop (around cable car station + chalets)
    [45, 35, 'pine'], [55, 45, 'pine'], [70, 50, 'pine'], [85, 55, 'pine'], [75, 70, 'pine'],
    [55, 25, 'pine'], [88, 40, 'pine'], [48, 60, 'pine'],
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
  addNPC(parkX - 4, parkZ + 2, 0xffb070);
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
  addParkedCar(-29, -2, Math.PI/2, 0xffb070);
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
    // DoubleSide so every label is visible from BOTH front and back of its plane.
    // Fixes the long-standing issue of signs disappearing when viewed from behind.
    // Text appears mirrored when viewed from the back, but at least the sign is readable as a marker.
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
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

  // ─────────────── PLAYER MODE STATE (car / walk / cable_ride / balloon_ride) ───────────────
  // Drives top-level branching in input, animate, and camera updates.
  let playerMode = 'car';
  let rideTarget = null;        // for ride modes — the object the camera follows (gondola, balloon)

  // ─────────────── 🚶 WALKING MAN AVATAR (toggle with M near flyover) ───────────────
  const manGroup = new THREE.Group();
  // Body (capsule-like — cylinder + 2 hemispheres approximated as cylinder + sphere)
  const manBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 1.0, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a5e8c, roughness: 0.7 })
  );
  manBody.position.y = 1.0;
  manBody.castShadow = true;
  manGroup.add(manBody);
  // Head
  const manHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xf2c8a0, roughness: 0.85 })
  );
  manHead.position.y = 1.85;
  manHead.castShadow = true;
  manGroup.add(manHead);
  // Hair cap (small dark dome)
  const manHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.30, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.9 })
  );
  manHair.position.y = 1.92;
  manGroup.add(manHair);
  // Two arms
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2c8a0, roughness: 0.8 })
    );
    arm.position.set(sx * 0.42, 1.15, 0);
    arm.castShadow = true;
    manGroup.add(arm);
  }
  // Two legs
  const manLegs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: 0x202028, roughness: 0.85 })
    );
    leg.position.set(sx * 0.18, 0.42, 0);
    leg.castShadow = true;
    manGroup.add(leg);
    manLegs.push(leg);
  }
  manGroup.visible = false;
  scene.add(manGroup);

  // Walk physics state
  let walkYaw = 0;
  const walkSpeed = 6.0;        // m/s
  const walkRunSpeed = 11.0;    // shift to run
  let walkTime = 0;             // for leg-bobbing animation

  function enterWalkMode() {
    if (playerMode !== 'car') return;
    playerMode = 'walk';
    manGroup.position.set(carGroup.position.x + 2, 0, carGroup.position.z);
    manGroup.visible = true;
    walkYaw = yaw;
    if (window.__imranToast) window.__imranToast('🚶 Walking mode — WASD to walk · M to drive');
  }
  function exitWalkMode() {
    if (playerMode !== 'walk') return;
    playerMode = 'car';
    manGroup.visible = false;
    // Snap car next to where the man was
    chassis.position.set(manGroup.position.x + 2, 1.5, manGroup.position.z);
    chassis.velocity.set(0, 0, 0);
    chassis.angularVelocity.set(0, 0, 0);
    if (window.__imranToast) window.__imranToast('🏎️ Driving mode resumed');
  }
  function enterRideMode(target, kind) {
    if (playerMode !== 'walk' && playerMode !== 'car') return;
    playerMode = (kind === 'cable') ? 'cable_ride' : 'balloon_ride';
    rideTarget = target;
    manGroup.visible = false;
    // For balloon: kick off a 60-sec tour animation that takes off, flies the world, and lands
    if (kind === 'balloon') {
      target.userData.rideTour = {
        t: 0,
        duration: 60,
        homeX: target.position.x,
        homeY: target.position.y,
        homeZ: target.position.z,
      };
      if (window.__imranToast) window.__imranToast('🎈 Taking off — 60s tour · press <kbd>M</kbd> to land early');
    } else {
      if (window.__imranToast) window.__imranToast('🚠 Cable car ride · press <kbd>M</kbd> to exit');
      // Show the in-cabin window-frame overlay
      window.dispatchEvent(new Event('imran:cable_ride:start'));
    }
  }
  function exitRideMode() {
    if (playerMode !== 'cable_ride' && playerMode !== 'balloon_ride') return;
    // Hide the cable-car window overlay if we were in cable_ride
    if (playerMode === 'cable_ride') {
      window.dispatchEvent(new Event('imran:cable_ride:end'));
    }
    // If we exit the balloon mid-tour, snap it back to its home pad
    if (playerMode === 'balloon_ride' && rideTarget && rideTarget.userData.rideTour) {
      const h = rideTarget.userData.rideTour;
      rideTarget.position.set(h.homeX, h.homeY, h.homeZ);
      rideTarget.userData.rideTour = null;
    }
    rideTarget = null;
    // Drop player back on the ground next to the car (so they can re-enter easily)
    playerMode = 'walk';
    manGroup.visible = true;
    manGroup.position.set(carGroup.position.x + 2, 0, carGroup.position.z);
    if (window.__imranToast) window.__imranToast('🚶 Back on foot · E near car to drive · M anywhere to drive');
  }
  // Expose for external use
  window.__imranPlayer = { enterWalk: enterWalkMode, exitWalk: exitWalkMode, getMode: () => playerMode };

  // Surface-height query — returns the y of the walkable surface at (x, z).
  // Knows about the flyover (ramps + flat span at z≈0) and the cable car ramp + deck.
  // Default = ground level (0). Lets the walking man climb the bridge instead of clipping through it.
  function getGroundY(x, z) {
    // Flyover (centered at z=0, ±2.5m wide) — west ramp x=24..42, span x=42..58, east ramp x=58..76
    const FLY_H_LOCAL = 3.5;
    if (Math.abs(z) < 2.6) {
      if (x >= 24 && x <= 42) return ((x - 24) / 18) * FLY_H_LOCAL;       // west ramp ascends
      if (x > 42 && x < 58)   return FLY_H_LOCAL;                          // flat span
      if (x >= 58 && x <= 76) return FLY_H_LOCAL - ((x - 58) / 18) * FLY_H_LOCAL;  // east ramp descends
    }
    // Cable car STAIRS — 22 steps × 1m run from z=2.5 (deck edge) backward to z=-19.5 (foot)
    // Smooth incline approximation for walking — rises 0→11 over 22m
    const stairBottomZ = 24.5 - 22 * 1.0;     // = 2.5
    const stairTopZ = 24.5;                   // wait — recompute: STATION_Z=30, stairTopZ = STATION_Z - 5.5 = 24.5
    if (Math.abs(x - 40) < 2.7) {
      if (z >= stairBottomZ && z <= stairTopZ) {
        const t = (z - stairBottomZ) / (stairTopZ - stairBottomZ);
        return t * 11;
      }
    }
    // Cable car deck — 11×11 platform centered at (40, 11.5, 30)
    if (Math.abs(x - 40) < 5.6 && z >= stairTopZ && z <= 35.5) return 11.5;
    return 0;
  }

  // Walk physics — direct position integration, no Cannon body. Returns drv-like obj.
  function walkStep(dt) {
    let mx = 0, mz = 0;
    if (keys.f) mz -= 1;
    if (keys.b) mz += 1;
    if (keys.l) mx -= 1;
    if (keys.r) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const speed = (keys.jump ? walkRunSpeed : walkSpeed);
    // Movement is in world space relative to the camera yaw (so W always = away from cam)
    const camFwdX = -Math.sin(walkYaw);
    const camFwdZ = -Math.cos(walkYaw);
    const camRightX = -camFwdZ;
    const camRightZ = camFwdX;
    const vx = (camFwdX * (-mz) + camRightX * mx) * speed;
    const vz = (camFwdZ * (-mz) + camRightZ * mx) * speed;
    manGroup.position.x += vx * dt;
    manGroup.position.z += vz * dt;
    // Surface snap — find ground level under the man and lerp y up to it
    const targetY = getGroundY(manGroup.position.x, manGroup.position.z);
    // Smooth vertical movement so stepping onto/off ramps doesn't pop
    manGroup.position.y += (targetY - manGroup.position.y) * Math.min(1, dt * 14);
    // Face direction of movement
    if (len > 0) {
      const targetYaw = Math.atan2(vx, vz);
      let dy = targetYaw - manGroup.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      manGroup.rotation.y += dy * Math.min(1, dt * 12);
    }
    // Walk bobbing — legs swing, body bobs (added to surface y)
    walkTime += dt * (len > 0 ? 6 : 0);
    if (len > 0) {
      manLegs[0].rotation.x = Math.sin(walkTime) * 0.6;
      manLegs[1].rotation.x = -Math.sin(walkTime) * 0.6;
      manGroup.position.y += Math.abs(Math.sin(walkTime * 2)) * 0.05;
    } else {
      manLegs[0].rotation.x *= 0.9;
      manLegs[1].rotation.x *= 0.9;
    }
    return { speed: Math.hypot(vx, vz), throttle: len > 0 ? 1 : 0 };
  }

  const keyMap = {
    'ArrowUp': 'f', 'KeyW': 'f',
    'ArrowDown': 'b', 'KeyS': 'b',
    'ArrowLeft': 'l', 'KeyA': 'l',
    'ArrowRight': 'r', 'KeyD': 'r',
    'Space': 'jump',
  };
  // If the user is typing in an input/textarea (e.g. the chat box), let the keys
  // pass through to that field instead of triggering the car controls.
  function isTyping(e) {
    const el = e.target;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
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
    // M — escape hatch: exits any ride immediately and toggles between car ↔ walk
    if (e.code === 'KeyM') {
      if (playerMode === 'cable_ride' || playerMode === 'balloon_ride') exitRideMode();
      else if (playerMode === 'car') enterWalkMode();
      else if (playerMode === 'walk') exitWalkMode();
    }
    // Project billboard cycling — only meaningful when active zone is 'projects'
    if ((e.code === 'KeyN' || e.code === 'BracketRight') && activeZone && activeZone.key === 'projects') {
      window.__imranProjectCycle(+1);
    }
    if ((e.code === 'KeyP' || e.code === 'BracketLeft') && activeZone && activeZone.key === 'projects') {
      window.__imranProjectCycle(-1);
    }
    if (e.code === 'KeyE' || e.code === 'Enter') {
      window.__imranEHeld = true;            // for bunker easter-egg hold detection
      // If walking and near the car (within 5m), enter the car
      if (playerMode === 'walk' && Math.hypot(
          manGroup.position.x - carGroup.position.x,
          manGroup.position.z - carGroup.position.z) < 5) {
        exitWalkMode();
      }
      // If on a balloon ride pad, enter balloon ride (E to enter, M to exit)
      else if (activeZone && activeZone.key === 'balloon_ride_pad' && activeZone.rideTarget
               && playerMode !== 'balloon_ride' && playerMode !== 'cable_ride') {
        enterRideMode(activeZone.rideTarget, 'balloon');
      }
      // If on the projects pad, open the currently displayed project
      else if (activeZone && activeZone.key === 'projects') {
        window.__imranProjectOpen();
      } else {
        window.dispatchEvent(new Event('imran:interact'));
      }
    }
    // R key — ride the cable car (only when on/near the station deck)
    if (e.code === 'KeyT' && playerMode !== 'cable_ride') {
      // Distance from station deck top
      const stationDeckPos = window.__imranSwiss && window.__imranSwiss.gondola;
      if (stationDeckPos) {
        const px = (playerMode === 'walk') ? manGroup.position.x : carGroup.position.x;
        const pz = (playerMode === 'walk') ? manGroup.position.z : carGroup.position.z;
        // STATION_X=40, STATION_Z=30
        if (Math.hypot(px - 40, pz - 30) < 18) {
          enterRideMode(window.__imranSwiss.gondola, 'cable');
        }
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (isTyping(e)) return;
    if (e.code === 'KeyE' || e.code === 'Enter') window.__imranEHeld = false;
  });
  window.addEventListener('keyup', (e) => {
    if (isTyping(e)) return;
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
    btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); touch.jump = true; keys.jump = true; }, { passive: false });
    btnJump.addEventListener('touchend', () => { touch.jump = false; keys.jump = false; });
    btnJump.addEventListener('mousedown', (e) => { e.preventDefault(); touch.jump = true; keys.jump = true; });
    btnJump.addEventListener('mouseup', () => { touch.jump = false; keys.jump = false; });
  }
  // Mobile action buttons — synthesize keyboard events so existing key handlers fire unchanged.
  // Maps button data-act to KeyboardEvent.code. Tap = quick keydown+keyup.
  const actToKey = {
    interact: 'KeyE',
    walk: 'KeyM',
    cable: 'KeyT',
    camera: 'KeyC',
    fly: 'KeyL',
    reset: 'KeyR',
  };
  function tapKey(code) {
    const down = new KeyboardEvent('keydown', { code, bubbles: true });
    window.dispatchEvent(down);
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    }, 80);
  }
  document.querySelectorAll('.btn-act[data-act]').forEach(btn => {
    const act = btn.getAttribute('data-act');
    if (act === 'jump') return;     // jump is handled separately above (hold-to-run, not tap)
    const code = actToKey[act];
    if (!code) return;
    const handler = (e) => { e.preventDefault(); tapKey(code); };
    btn.addEventListener('touchstart', handler, { passive: false });
    btn.addEventListener('click', handler);
  });

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
    if (keys.jump) alt += 1;                 // Space = climb
    if (keys.dive || window.__imranShiftDown) alt -= 1;   // Shift = dive
    // Touch joystick: forward = throttle, side = yaw
    if (Math.abs(touch.y) > 0.15) thrust -= touch.y;
    if (Math.abs(touch.x) > 0.15) yawIn -= touch.x;

    // Smooth speed
    flySpeed = Math.max(2, Math.min(35, flySpeed + thrust * 14 * dt));
    flySpeed *= 0.985;
    yaw += yawIn * 1.4 * dt;
    // Climb (Space) / dive (Shift) — wider altitude range so we go ABOVE mountains (~40m peaks)
    // Without input, plane gently descends back toward 30 (cruising altitude)
    const restAlt = 30;
    if (alt !== 0) {
      flyAlt = Math.max(5, Math.min(85, flyAlt + alt * 22 * dt));
    } else {
      // gentle drift back to cruise altitude when no input
      flyAlt += (restAlt - flyAlt) * dt * 0.3;
    }

    // Apply position + rotation
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    chassis.position.x += fx * flySpeed * dt;
    chassis.position.z += fz * flySpeed * dt;
    chassis.position.y = flyAlt;
    chassis.velocity.set(0, 0, 0);
    chassis.angularVelocity.set(0, 0, 0);
    // Real plane attitude — pitch (nose up/down based on climb), roll (bank into turns)
    const pitch = -alt * 0.35;            // climb = nose up; dive = nose down
    const bankRoll = -yawIn * 0.35;
    const qYaw = new CANNON.Quaternion();
    qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    const qPitch = new CANNON.Quaternion();
    qPitch.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), pitch);
    const qRoll = new CANNON.Quaternion();
    qRoll.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), bankRoll);
    // Compose: yaw * pitch * roll
    chassis.quaternion.copy(qYaw.mult(qPitch).mult(qRoll));
    // Animate wings up
    wingScale = Math.min(1, wingScale + dt * 4);
    wings.scale.set(wingScale, wingScale, wingScale);
    // Sync mesh
    carGroup.position.copy(chassis.position);
    carGroup.quaternion.copy(chassis.quaternion);
    return { speed: flySpeed, throttle: thrust };
  }

  // ─────────────── REMOTE PLAYERS (multiplayer ghost cars) ───────────────
  const remotePlayers = new Map();   // id → { mesh, lastSeen }
  function makeRemoteCar(color = 0x5ce5ff) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.6, 4.0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, wireframe: true })
    );
    body.position.y = 0.5;
    g.add(body);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 1.8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, wireframe: true })
    );
    top.position.set(0, 1.05, 0.2);
    g.add(top);
    return g;
  }
  function setRemotePlayers(playerList) {
    const seen = new Set();
    const palette = [0xffb070, 0x5ce5ff, 0x8a3eff, 0xffe066, 0xc1ff12, 0xff9b3e];
    for (const p of playerList) {
      seen.add(p.id);
      let entry = remotePlayers.get(p.id);
      if (!entry) {
        const c = palette[Math.floor(p.id * 9301 % palette.length)];
        const mesh = makeRemoteCar(c);
        scene.add(mesh);
        entry = { mesh, lastSeen: 0 };
        remotePlayers.set(p.id, entry);
      }
      entry.mesh.position.set(p.x, 0.5, p.z);
      entry.mesh.rotation.y = p.yaw || 0;
      entry.lastSeen = performance.now();
    }
    // Remove peers that disappeared
    for (const [id, entry] of remotePlayers) {
      if (!seen.has(id)) {
        scene.remove(entry.mesh);
        remotePlayers.delete(id);
      }
    }
  }

  // ─────────────── XR (AR) ENTRY POINT ───────────────
  function enterAR(session) {
    renderer.xr.enabled = true;
    renderer.xr.setSession(session);
    // Scale world to coffee-table size when in AR
    scene.scale.set(0.05, 0.05, 0.05);
    session.addEventListener('end', () => {
      scene.scale.set(1, 1, 1);
      renderer.xr.enabled = false;
    });
  }
  window.imranXR = { enterAR, setRemotePlayers };

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
    // Visitor Tower data sink — Portfolio.html calls this with server-fetched stats
    setVisitData: (data) => {
      if (window.__imranSetVisitData) window.__imranSetVisitData(data);
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

      // Clamp top speed — slower off-road (NFS Most Wanted style)
      const sp = Math.hypot(chassis.velocity.x, chassis.velocity.z);
      const offRoad = window.__imranIsOnRoad ? !window.__imranIsOnRoad(chassis.position.x, chassis.position.z) : false;
      const MAX = offRoad ? 18 : 22;
      if (sp > MAX) {
        chassis.velocity.x *= MAX/sp;
        chassis.velocity.z *= MAX/sp;
      }
      // Off-road also adds extra forward drag (mud/grass resistance)
      if (offRoad) {
        chassis.velocity.x *= 0.992;
        chassis.velocity.z *= 0.992;
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
  // Welcome arch label — fixed in place (NOT camera-billboarded) so it stays painted on the keystone
  const archLabel = makeLabel('imran pasha', '#ffb070', 130);
  archLabel.position.set(0, 11.0, 12.42);
  archLabel.scale.set(0.85, 0.85, 0.85);
  archLabel.userData.noBillboard = true;
  archGroup.add(archLabel);
  // Mirror copy on the back face so the label reads from both sides
  const archLabelBack = makeLabel('imran pasha', '#ffb070', 130);
  archLabelBack.position.set(0, 11.0, 11.58);
  archLabelBack.scale.set(0.85, 0.85, 0.85);
  archLabelBack.rotation.y = Math.PI;
  archLabelBack.userData.noBillboard = true;
  archGroup.add(archLabelBack);
  // Spotlights pointed at the arch from underneath for drama
  const archSpot = new THREE.PointLight(COL.pink, 1.4, 30, 2);
  archSpot.position.set(0, 8, 12);
  archGroup.add(archSpot);
  scene.add(archGroup);

  // ─────────────── 🏛️ WELCOME PLAZA (cobblestone disc + 4 directional signposts) ───────────────
  // Civic plaza framing the spawn area — gives the player wayfinding before they drive off.
  // Cobblestone floor disc under the spawn pad, just slightly raised above grass.
  const plazaFloor = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48),
    new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95, metalness: 0 })
  );
  plazaFloor.rotation.x = -Math.PI / 2;
  plazaFloor.position.set(0, 0.03, 0);
  plazaFloor.receiveShadow = true;
  scene.add(plazaFloor);
  // 4 cardinal directional signposts at radius 14 from spawn — the master organizing principle
  // (each points the player toward a distinct district, telegraphed by visual landmarks)
  function addSignpost(x, z, text, faceY) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 4.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
    );
    post.position.set(x, 2.1, z);
    post.castShadow = true;
    scene.add(post);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.9, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.8 })
    );
    board.position.set(x, 4.1, z);
    board.rotation.y = faceY;
    board.castShadow = true;
    scene.add(board);
    const lab = makeLabel(text, '#ffe066', 70);
    lab.position.set(x, 4.1, z);
    lab.rotation.y = faceY;
    lab.scale.set(0.4, 0.4, 0.4);
    // Push label slightly forward of the board so it doesn't z-fight
    lab.position.x += Math.sin(faceY) * 0.07;
    lab.position.z += Math.cos(faceY) * 0.07;
    lab.userData.noBillboard = true;
    scene.add(lab);
    // Mirror copy facing the opposite way
    const labBack = makeLabel(text, '#ffe066', 70);
    labBack.position.set(x, 4.1, z);
    labBack.rotation.y = faceY + Math.PI;
    labBack.scale.set(0.4, 0.4, 0.4);
    labBack.position.x -= Math.sin(faceY) * 0.07;
    labBack.position.z -= Math.cos(faceY) * 0.07;
    labBack.userData.noBillboard = true;
    scene.add(labBack);
  }
  // North → Social Boulevard (face oncoming car, i.e. board faces +z)
  addSignpost(-2, 14, '↑ SOCIAL BLVD', Math.PI);
  // South → Mailroom & Tunnel
  addSignpost(2, -14, '↓ MAILROOM · PARK', 0);
  // East → Tech Park / Alpine Village
  addSignpost(14, -2, '→ TECH PARK · ALPINE VILLAGE', -Math.PI / 2);
  // West → Hacker's Den
  addSignpost(-14, 2, '← HACKER\'S DEN', Math.PI / 2);

  // ─────────────── 🏛️ VISITOR TOWER (live count + scrolling guestbook) ───────────────
  // Tall obelisk near the welcome arch with a giant glowing scoreboard at the top
  // and a scrolling LED ticker below showing recent visits. Server-driven via
  // window.imranWorld.setVisitData({total, unique, recent}).
  const vTowerGroup = new THREE.Group();
  const towerX = 15, towerZ = 8;

  // Stone pedestal base (cylinder)
  const towerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.6, 1.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
  );
  towerBase.position.y = 0.6;
  towerBase.castShadow = true;
  vTowerGroup.add(towerBase);

  // Pedestal label "👀 VISITORS"
  const towerBaseLab = makeLabel('👀 VISITORS', '#3E2418', 110);
  towerBaseLab.position.set(0, 1.3, 2.3);
  towerBaseLab.scale.set(0.6, 0.6, 0.6);
  vTowerGroup.add(towerBaseLab);

  // Shorter obelisk shaft (was 14m, now 7m — feels less imposing)
  const towerShaft = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 7, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.7, metalness: 0.1 })
  );
  towerShaft.position.y = 1.2 + 3.5;
  towerShaft.castShadow = true;
  vTowerGroup.add(towerShaft);

  // Horizontal grooves (3 instead of 5, scaled to new shorter shaft)
  for (let i = 0; i < 3; i++) {
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 0.08, 2.05),
      new THREE.MeshStandardMaterial({ color: 0x4a3018 })
    );
    groove.position.y = 2.5 + i * 2.0;
    vTowerGroup.add(groove);
  }

  // The big glowing scoreboard panel — moved down to fit shorter tower
  const towerScreenW = 4.5, towerScreenH = 2.2;
  const towerScreenY = 7.5;
  const towerScreenCanvas = document.createElement('canvas');
  towerScreenCanvas.width = 640; towerScreenCanvas.height = 320;
  const towerScreenCtx = towerScreenCanvas.getContext('2d');
  const towerScreenTex = new THREE.CanvasTexture(towerScreenCanvas);
  towerScreenTex.colorSpace = THREE.SRGBColorSpace;
  const towerScreenMat = new THREE.MeshStandardMaterial({
    map: towerScreenTex,
    emissive: 0xffb070, emissiveIntensity: 0.9,
    roughness: 0.4,
  });
  const towerScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(towerScreenW, towerScreenH),
    towerScreenMat
  );
  towerScreen.position.set(0, towerScreenY, 1.05);    // protrudes from front face
  vTowerGroup.add(towerScreen);
  // Backside copy so the count reads from the other direction too
  const towerScreenBack = new THREE.Mesh(
    new THREE.PlaneGeometry(towerScreenW, towerScreenH),
    towerScreenMat
  );
  towerScreenBack.position.set(0, towerScreenY, -1.05);
  towerScreenBack.rotation.y = Math.PI;
  vTowerGroup.add(towerScreenBack);

  // Scrolling guestbook ticker below the main display (smaller panel)
  const towerTickerCanvas = document.createElement('canvas');
  towerTickerCanvas.width = 640; towerTickerCanvas.height = 160;
  const towerTickerCtx = towerTickerCanvas.getContext('2d');
  const towerTickerTex = new THREE.CanvasTexture(towerTickerCanvas);
  towerTickerTex.colorSpace = THREE.SRGBColorSpace;
  const towerTickerMat = new THREE.MeshStandardMaterial({
    map: towerTickerTex, emissive: 0x5ce5ff, emissiveIntensity: 0.5, roughness: 0.4,
  });
  const towerTicker = new THREE.Mesh(
    new THREE.PlaneGeometry(towerScreenW, 1.4),
    towerTickerMat
  );
  towerTicker.position.set(0, towerScreenY - 2.3, 1.05);
  vTowerGroup.add(towerTicker);
  const towerTickerBack = new THREE.Mesh(
    new THREE.PlaneGeometry(towerScreenW, 1.4),
    towerTickerMat
  );
  towerTickerBack.position.set(0, towerScreenY - 2.3, -1.05);
  towerTickerBack.rotation.y = Math.PI;
  vTowerGroup.add(towerTickerBack);

  // Top accent — rotating amber crystal (octahedron)
  const towerCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffb070, emissive: 0xff8a6e, emissiveIntensity: 1.4,
      roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.9,
    })
  );
  towerCrystal.position.y = 9.5;       // sits on top of shorter shaft
  towerCrystal.castShadow = true;
  vTowerGroup.add(towerCrystal);

  // Pulsing point light at scoreboard height
  const towerLight = new THREE.PointLight(0xffb070, 1.6, 30, 2);
  towerLight.position.set(0, towerScreenY, 0);
  vTowerGroup.add(towerLight);

  vTowerGroup.position.set(towerX, 0, towerZ);
  scene.add(vTowerGroup);

  // Visit data state + drawer
  let visitState = { total: 0, unique: 0, recent: [], lastTotal: 0, plusOneT: 0 };
  function drawTowerScreen() {
    const c = towerScreenCtx;
    c.clearRect(0, 0, 640, 320);
    // Dark amber screen background
    c.fillStyle = '#1a1208';
    c.fillRect(0, 0, 640, 320);
    // Scanlines for retro LED feel
    c.fillStyle = 'rgba(255, 176, 112, 0.08)';
    for (let y = 0; y < 320; y += 4) c.fillRect(0, y, 640, 1);
    // The big number
    const countStr = String(visitState.total).padStart(5, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    c.font = 'bold 160px "JetBrains Mono", monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffe066';
    c.shadowColor = '#ffb070'; c.shadowBlur = 32;
    c.fillText(countStr, 320, 140);
    c.shadowBlur = 0;
    // Subtitle
    c.font = '32px "JetBrains Mono", monospace';
    c.fillStyle = '#5ce5ff';
    c.fillText(`${visitState.unique} unique`, 320, 250);
    // Caption
    c.font = '24px "Permanent Marker", cursive';
    c.fillStyle = '#ffb070';
    c.fillText('TOTAL VISITS', 320, 295);
    // +1 floating animation when count just incremented
    if (visitState.plusOneT > 0) {
      const a = visitState.plusOneT;
      c.globalAlpha = a;
      c.font = 'bold 60px "Permanent Marker", cursive';
      c.fillStyle = '#7bc04a';
      c.fillText('+1', 540, 80 - (1 - a) * 40);
      c.globalAlpha = 1;
    }
    towerScreenTex.needsUpdate = true;
  }
  let tickerScroll = 0;
  function drawTowerTicker() {
    const c = towerTickerCtx;
    c.clearRect(0, 0, 640, 160);
    c.fillStyle = '#0a1426';
    c.fillRect(0, 0, 640, 160);
    // Cyan scanlines
    c.fillStyle = 'rgba(92, 229, 255, 0.06)';
    for (let y = 0; y < 160; y += 3) c.fillRect(0, y, 640, 1);
    // Header
    c.font = '20px "Permanent Marker", cursive';
    c.fillStyle = '#5ce5ff';
    c.textAlign = 'left';
    c.fillText('· LIVE GUESTBOOK ·', 12, 22);
    // Lines (scroll vertically, infinite loop)
    c.font = '18px "JetBrains Mono", monospace';
    const lineH = 24;
    const lines = visitState.recent.slice(0, 30).map(r => {
      const ago = secsAgo(r.ts);
      const tag = r.isNew ? '🌟' : '👋';
      return `${tag}  visitor #${r.short}  ·  ${ago}`;
    });
    if (lines.length === 0) lines.push('   waiting for first visit...');
    const startY = 50 - (tickerScroll % (lines.length * lineH));
    for (let i = 0; i < lines.length * 2; i++) {     // draw twice for seamless loop
      const y = startY + i * lineH;
      if (y < -lineH || y > 200) continue;
      c.fillStyle = i < lines.length ? '#9ce6ff' : '#5cb8d9';
      c.fillText(lines[i % lines.length], 14, y);
    }
    towerTickerTex.needsUpdate = true;
  }
  function secsAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }
  drawTowerScreen();
  drawTowerTicker();

  // Public API — Portfolio.html calls this with server data
  window.__imranSetVisitData = function (data) {
    if (typeof data.total === 'number') {
      const newCount = data.total > visitState.lastTotal && visitState.lastTotal > 0;
      visitState.lastTotal = visitState.total;
      visitState.total = data.total;
      if (newCount) visitState.plusOneT = 1.0;       // trigger +1 animation
    }
    if (typeof data.unique === 'number') visitState.unique = data.unique;
    drawTowerScreen();
    // Also fetch fresh recent visits for the ticker
    fetch('/api/visits/recent?limit=30')
      .then(r => r.json())
      .then(d => {
        visitState.recent = d.recent || [];
        drawTowerTicker();
      })
      .catch(() => {});
  };

  // Animate crystal + +1 fade in tick loop (hooked later via window flag)
  window.__imranTowerAnim = { crystal: towerCrystal, light: towerLight, state: visitState, draw: drawTowerScreen, drawTicker: drawTowerTicker };

  // ─────────────── 🏔️ SWITZERLAND — mountain ring + alpine atmosphere ───────────────
  const swissMountains = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.95, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ff, roughness: 0.7, emissive: 0xddddff, emissiveIntensity: 0.04 });
  // Bigger world — mountain ring pushed way out so airport (~177m corner) + harbour (~230m corner) fit
  const RING_R = 280;
  const MOUNTAIN_COUNT = 52;
  let highestPeak = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < MOUNTAIN_COUNT; i++) {
    const ang = (i / MOUNTAIN_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
    const r = RING_R + (Math.random() - 0.5) * 18;       // jitter the radius
    const mx = Math.cos(ang) * r;
    const mz = Math.sin(ang) * r;
    const baseR = 12 + Math.random() * 14;               // 12-26m wide
    const baseH = 22 + Math.random() * 18;               // 22-40m tall
    // Rock cone (base)
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(baseR, baseH, 6 + Math.floor(Math.random() * 3), 1),
      rockMat
    );
    rock.position.set(mx, baseH / 2, mz);
    rock.rotation.y = Math.random() * Math.PI * 2;
    rock.castShadow = true;
    swissMountains.add(rock);
    // Snow cap (smaller cone on top, ~50% of base height, narrower)
    const snowH = baseH * 0.45;
    const snowR = baseR * 0.65;
    const snow = new THREE.Mesh(
      new THREE.ConeGeometry(snowR, snowH, 6, 1),
      snowMat
    );
    snow.position.set(mx, baseH - 0.5, mz);
    snow.rotation.y = rock.rotation.y;
    snow.castShadow = true;
    swissMountains.add(snow);
    // Track the highest peak for cable car target
    const peakY = baseH;
    if (peakY > highestPeak.y) highestPeak = { x: mx, y: peakY, z: mz };
  }
  scene.add(swissMountains);

  // ─── Mountain boundary walls (invisible — car can't escape the ring) ───
  // 24 tall thin physics boxes arranged in a ring at radius 100, each rotated to face inward.
  // Tall enough (50m) that even plane-mode can't sneak over them at moderate altitudes.
  const BOUNDARY_R = 250;
  const BOUNDARY_SEGMENTS = 48;
  const boundarySegWidth = (2 * Math.PI * BOUNDARY_R) / BOUNDARY_SEGMENTS * 1.1;   // slight overlap at seams
  for (let i = 0; i < BOUNDARY_SEGMENTS; i++) {
    const ang = (i / BOUNDARY_SEGMENTS) * Math.PI * 2;
    const wx = Math.cos(ang) * BOUNDARY_R;
    const wz = Math.sin(ang) * BOUNDARY_R;
    const wallBody = new CANNON.Body({ mass: 0, material: groundMat });
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(boundarySegWidth/2, 25, 1)));
    wallBody.position.set(wx, 25, wz);
    // Rotate so the wall's long axis is tangent to the circle (perpendicular to radial direction)
    wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -ang + Math.PI/2);
    world.addBody(wallBody);
  }

  // ─── Cable car STATION + drivable ramp up to the top deck ───
  // Replaces the old skinny pole with a proper alpine-station building.
  // The car can drive UP a long gentle ramp to the top deck where the cable wire originates.
  const STATION_X = 40, STATION_Z = 30, STATION_H = 11;
  // Cable wire now starts from the top of the station's deck
  const cableStart = new THREE.Vector3(STATION_X, STATION_H + 1.5, STATION_Z);
  const cableEnd = new THREE.Vector3(highestPeak.x, highestPeak.y * 0.55, highestPeak.z);

  // Station main body — wood-clad alpine building
  const stationBody = new THREE.Mesh(
    new THREE.BoxGeometry(8, STATION_H, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.8 })
  );
  stationBody.position.set(STATION_X, STATION_H / 2, STATION_Z);
  stationBody.castShadow = true; stationBody.receiveShadow = true;
  scene.add(stationBody);
  // Station physics body — solid box car can collide with
  const stationBodyPhys = new CANNON.Body({ mass: 0, material: groundMat });
  stationBodyPhys.addShape(new CANNON.Box(new CANNON.Vec3(4, STATION_H / 2, 4)));
  stationBodyPhys.position.set(STATION_X, STATION_H / 2, STATION_Z);
  world.addBody(stationBodyPhys);
  // Top deck — wider, drivable platform
  const stationDeck = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.5, 11),
    new THREE.MeshStandardMaterial({ color: 0x6a4828, roughness: 0.8 })
  );
  stationDeck.position.set(STATION_X, STATION_H + 0.25, STATION_Z);
  stationDeck.castShadow = true; stationDeck.receiveShadow = true;
  scene.add(stationDeck);
  const stationDeckPhys = new CANNON.Body({ mass: 0, material: groundMat });
  stationDeckPhys.addShape(new CANNON.Box(new CANNON.Vec3(5.5, 0.25, 5.5)));
  stationDeckPhys.position.set(STATION_X, STATION_H + 0.25, STATION_Z);
  world.addBody(stationDeckPhys);
  // Deck railings (cyan glow, 3 sides — not the side the ramp arrives from)
  for (const side of ['+x', '-x', '+z']) {
    const w = (side === '+z') ? 11 : 0.18;
    const d = (side === '+z') ? 0.18 : 11;
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.6, d),
      new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 0.5 })
    );
    const offX = side === '+x' ? 5.5 : (side === '-x' ? -5.5 : 0);
    const offZ = side === '+z' ? 5.5 : 0;
    rail.position.set(STATION_X + offX, STATION_H + 0.85, STATION_Z + offZ);
    scene.add(rail);
  }
  // Roof / shelter over part of the deck (cable wire emerges from under it)
  const stationRoof = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.3, 4),
    new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 0.7 })
  );
  stationRoof.position.set(STATION_X, STATION_H + 3, STATION_Z + 2);
  stationRoof.castShadow = true;
  scene.add(stationRoof);
  // 4 roof support pillars
  for (const [px, pz] of [[-3, 0], [3, 0], [-3, 4], [3, 4]]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3018 })
    );
    pillar.position.set(STATION_X + px, STATION_H + 1.65, STATION_Z + pz);
    scene.add(pillar);
  }
  // "CABLE CAR" label on the front face of the station
  const stationLab = makeLabel('CABLE CAR', '#ffe066', 110);
  stationLab.position.set(STATION_X, STATION_H - 1.5, STATION_Z - 4.05);
  stationLab.scale.set(0.6, 0.6, 0.6);
  stationLab.userData.noBillboard = true;
  scene.add(stationLab);
  const stationLabBack = makeLabel('CABLE CAR', '#ffe066', 110);
  stationLabBack.position.set(STATION_X, STATION_H - 1.5, STATION_Z + 4.05);
  stationLabBack.scale.set(0.6, 0.6, 0.6);
  stationLabBack.rotation.y = Math.PI;
  stationLabBack.userData.noBillboard = true;
  scene.add(stationLabBack);

  // ─── Stairs UP to the station deck (walk-only, replaces the old drivable ramp) ───
  // Stack of N step boxes from z=-17.5 (foot) to z=24.5 (deck), rising to STATION_H=11.
  // Each step: 0.5m rise, ~1.0m run. Total: 22 steps, 22m of horizontal run.
  const RAMP_LEN = 42;          // kept for compatibility with sign position calc
  const STAIR_COUNT = 22;
  const STAIR_RUN = 1.0;
  const STAIR_RISE = STATION_H / STAIR_COUNT;       // 0.5m per step
  const STAIR_WIDTH = 5;
  const stairFootZ = STATION_Z - 5.5 - STAIR_COUNT * STAIR_RUN;     // z=2.5 ish — actually let me recompute below
  // Reposition stair foot so the deck-side step is at the deck edge (STATION_Z - 5.5)
  const stairTopZ = STATION_Z - 5.5;
  const stairBottomZ = stairTopZ - STAIR_COUNT * STAIR_RUN;
  const stairMat = new THREE.MeshStandardMaterial({ color: 0x6e6878, roughness: 0.85 });
  const stairTreadMat = new THREE.MeshStandardMaterial({ color: 0x4a4458, roughness: 0.9, emissive: 0x1a1828, emissiveIntensity: 0.1 });
  for (let i = 0; i < STAIR_COUNT; i++) {
    // Step i: top surface at y = (i+1) * STAIR_RISE, occupies z = bottom + i*RUN to bottom + (i+1)*RUN
    const stepY = (i + 0.5) * STAIR_RISE;
    const stepZ = stairBottomZ + (i + 0.5) * STAIR_RUN;
    // Riser (vertical face)
    const riser = new THREE.Mesh(
      new THREE.BoxGeometry(STAIR_WIDTH, STAIR_RISE * 0.95, STAIR_RUN * 0.05),
      stairMat
    );
    riser.position.set(STATION_X, stepY, stepZ - STAIR_RUN / 2);
    riser.castShadow = true;
    scene.add(riser);
    // Tread (horizontal surface — also acts as the walkable top)
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(STAIR_WIDTH, 0.1, STAIR_RUN),
      stairTreadMat
    );
    tread.position.set(STATION_X, (i + 1) * STAIR_RISE, stepZ);
    tread.receiveShadow = true;
    scene.add(tread);
    // Physics box for each step (so the car bumps off them and walking man stands on each)
    const stepPhys = new CANNON.Body({ mass: 0, material: groundMat });
    stepPhys.addShape(new CANNON.Box(new CANNON.Vec3(STAIR_WIDTH / 2, STAIR_RISE / 2, STAIR_RUN / 2)));
    stepPhys.position.set(STATION_X, stepY, stepZ);
    world.addBody(stepPhys);
  }
  // Side railings — cyan glow, run the full length of the stairs at the top of each side
  for (const dx of [-2.6, 2.6]) {
    const railLen = Math.hypot(STATION_H, STAIR_COUNT * STAIR_RUN);
    const railAng = Math.atan2(STATION_H, STAIR_COUNT * STAIR_RUN);
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.5, railLen),
      new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 0.5 })
    );
    rail.position.set(STATION_X + dx, STATION_H / 2 + 0.7, (stairTopZ + stairBottomZ) / 2);
    rail.rotation.x = -railAng;
    scene.add(rail);
  }
  // Sign at the foot of the stairs
  const rampSign = makeLabel('↑ WALK UP TO CABLE CAR', '#ffe066', 90);
  rampSign.position.set(STATION_X, 4, stairBottomZ - 2);
  rampSign.scale.set(0.5, 0.5, 0.5);
  rampSign.userData.noBillboard = true;
  scene.add(rampSign);
  // VPN-tunnel demo signpost — sealed gondola on a wire = TLS encrypted transport
  const vpnDemoPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
  );
  vpnDemoPost.position.set(STATION_X + 4, 1.75, stairBottomZ + 1);
  scene.add(vpnDemoPost);
  const vpnDemoSign = makeLabel('🔒 VPN TUNNEL — press E', '#5ce5ff', 70);
  vpnDemoSign.position.set(STATION_X + 4, 3.5, stairBottomZ + 1);
  vpnDemoSign.scale.set(0.6, 0.6, 0.6);
  vpnDemoSign.userData.noBillboard = true;
  scene.add(vpnDemoSign);
  zones.push({
    x: STATION_X, z: STATION_Z, radius: 18, key: 'vpn_demo',
    label: 'VPN TUNNEL', ring: null, lab: vpnDemoSign
  });
  // Turn-off signpost on Pasha Boulevard (z=0, x=42 — at NS-42E intersection with EW-0)
  // Tells the player driving east on the boulevard to turn left for the cable car
  const turnSignPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3018 })
  );
  turnSignPost.position.set(42, 2, 4.5);
  turnSignPost.castShadow = true;
  scene.add(turnSignPost);
  const turnSign = makeLabel('← CABLE CAR · ALPINE VILLAGE', '#ffe066', 70);
  turnSign.position.set(42, 4.2, 4.5);
  turnSign.scale.set(0.45, 0.45, 0.45);
  turnSign.userData.noBillboard = true;
  scene.add(turnSign);
  const turnSignBack = makeLabel('CABLE CAR · ALPINE VILLAGE →', '#ffe066', 70);
  turnSignBack.position.set(42, 4.2, 4.5);
  turnSignBack.rotation.y = Math.PI;
  turnSignBack.scale.set(0.45, 0.45, 0.45);
  turnSignBack.userData.noBillboard = true;
  scene.add(turnSignBack);
  // Wire — single thin cylinder stretched between the points
  const cableLen = cableStart.distanceTo(cableEnd);
  const cableMid = cableStart.clone().lerp(cableEnd, 0.5);
  const cableDir = cableEnd.clone().sub(cableStart).normalize();
  const cableWire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, cableLen, 6),
    new THREE.MeshBasicMaterial({ color: 0x111 })
  );
  cableWire.position.copy(cableMid);
  // Orient cylinder along the cable direction (default cylinder axis = Y, rotate to match)
  const cableAxis = new THREE.Vector3(0, 1, 0);
  cableWire.quaternion.setFromUnitVectors(cableAxis, cableDir);
  scene.add(cableWire);
  // Gondola box hanging from the wire
  const gondolaGroup = new THREE.Group();
  const gondolaBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.9, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xff6a3a, emissive: 0xff6a3a, emissiveIntensity: 0.2, roughness: 0.5 })
  );
  gondolaBody.position.y = -0.7;
  gondolaBody.castShadow = true;
  gondolaGroup.add(gondolaBody);
  // Gondola windows (cyan)
  for (const sx of [-0.4, 0.4]) {
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 0.5 })
    );
    win.position.set(sx, -0.6, 0.71);
    gondolaGroup.add(win);
    const win2 = win.clone();
    win2.position.z = -0.71;
    win2.rotation.y = Math.PI;
    gondolaGroup.add(win2);
  }
  // Hanger arm
  const gondolaArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.35, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x222 })
  );
  gondolaArm.position.y = -0.05;
  gondolaGroup.add(gondolaArm);
  scene.add(gondolaGroup);
  // Animation state — t goes 0→1→0 on a 60-sec cycle
  let cableT = 0, cableDirSign = 1;

  // ─── Wooden Swiss chalets (4 variant 'D' buildings near mountain edge) ───
  function addChalet(x, z, rotY = 0) {
    const g = new THREE.Group();
    // Wooden walls
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(5, 4, 4),
      new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.85, metalness: 0 })
    );
    walls.position.y = 2;
    walls.castShadow = true; walls.receiveShadow = true;
    g.add(walls);
    // Steep red triangular roof — two angled boxes forming an A-frame
    const roofL = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.2, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 0.7 })
    );
    roofL.position.set(0, 5.0, -0.95);
    roofL.rotation.x = -Math.PI / 4;
    roofL.castShadow = true;
    g.add(roofL);
    const roofR = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.2, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 0.7 })
    );
    roofR.position.set(0, 5.0, 0.95);
    roofR.rotation.x = Math.PI / 4;
    roofR.castShadow = true;
    g.add(roofR);
    // Window with cross-frame (two yellow squares)
    for (const [wx, wz, fr] of [[-1.0, 2.02, 0], [1.0, 2.02, 0], [0, 2.02, 0], [0, -2.02, Math.PI]]) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 0.6 })
      );
      win.position.set(wx, 2.4, wz);
      if (fr) win.rotation.y = fr;
      g.add(win);
      // Cross frame
      const v = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 0.7),
        new THREE.MeshBasicMaterial({ color: 0x4a3018 })
      );
      v.position.set(wx, 2.4, wz + (fr ? -0.005 : 0.005));
      if (fr) v.rotation.y = fr;
      g.add(v);
      const h = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x4a3018 })
      );
      h.position.set(wx, 2.4, wz + (fr ? -0.005 : 0.005));
      if (fr) h.rotation.y = fr;
      g.add(h);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  }
  // Alpine Village cluster — 4 chalets ring the cable car station at (40, 30)
  addChalet(90, 35, Math.PI/6);     // east of station, near observation tower
  addChalet(62, 38, -Math.PI/8);    // south chalet of village, just east of station
  addChalet(78, 50, -Math.PI/4);    // between station and tower
  addChalet(50, 75, Math.PI/3);     // north chalet, near tower

  // ─── Wildflower clusters scattered in meadows (yellow/orange — no pink) ───
  const flowerGeo = new THREE.BufferGeometry();
  const FLOWER_COUNT = 600;
  const flowerPos = new Float32Array(FLOWER_COUNT * 3);
  const flowerColors = new Float32Array(FLOWER_COUNT * 3);
  for (let i = 0; i < FLOWER_COUNT; i++) {
    // Cluster the flowers in random patches
    const cx = (Math.random() - 0.5) * 180;
    const cz = (Math.random() - 0.5) * 180;
    flowerPos[i*3+0] = cx + (Math.random() - 0.5) * 8;
    flowerPos[i*3+1] = 0.4;
    flowerPos[i*3+2] = cz + (Math.random() - 0.5) * 8;
    // Yellow / orange / white wildflower colors
    const palette = [[1.0, 0.88, 0.4], [1.0, 0.55, 0.2], [1.0, 0.95, 0.85], [0.96, 0.7, 0.2]];
    const c = palette[Math.floor(Math.random() * palette.length)];
    flowerColors[i*3+0] = c[0]; flowerColors[i*3+1] = c[1]; flowerColors[i*3+2] = c[2];
  }
  flowerGeo.setAttribute('position', new THREE.BufferAttribute(flowerPos, 3));
  flowerGeo.setAttribute('color', new THREE.BufferAttribute(flowerColors, 3));
  const flowerMat = new THREE.PointsMaterial({
    size: 0.45, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.95, depthWrite: false,
  });
  const wildflowers = new THREE.Points(flowerGeo, flowerMat);
  scene.add(wildflowers);

  // ─── Rally checkpoint markers (5 hidden in the grass — collect all for achievement) ───
  const rallyCheckpoints = [];
  function addRallyCheckpoint(x, z) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.15, 12, 32),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 1.4 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 1.5, z);
    scene.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.0, 12, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.set(x, 6, z);
    scene.add(beam);
    rallyCheckpoints.push({ x, z, ring, beam, collected: false });
  }
  // Spread them across off-road grass areas (NOT on roads)
  addRallyCheckpoint(-65, 25);
  addRallyCheckpoint(75, 40);
  addRallyCheckpoint(-50, -78);
  addRallyCheckpoint(50, -80);
  addRallyCheckpoint(0, 90);
  let rallyCount = 0;

  // ─── Off-road detection helper (NFS Most Wanted vibe) ───
  // Roads are at x ∈ {-42,-32,-22,-12,0,12,22,32,42} and z ∈ {-50,-32,-22,-17.5,-12,-10,0,12,22,32,38,50,60,65}
  // Width 5 — anywhere within 3 units of any road centerline counts as on-road.
  const ROAD_X = [-77, -42, -32, -22, -12, 0, 12, 22, 32, 42];
  const ROAD_Z = [-50, -32, -22, -17.5, -12, -10, 0, 12, 22, 32, 38, 50, 60, 65];
  function isOnRoad(x, z) {
    for (const rx of ROAD_X) if (Math.abs(x - rx) < 3) return true;
    for (const rz of ROAD_Z) if (Math.abs(z - rz) < 3) return true;
    return false;
  }
  window.__imranIsOnRoad = isOnRoad;

  // Cowbell sound (procedural, single sine + bell envelope) — fire when near mountains
  let lastCowbell = 0;
  function maybeCowbell(now) {
    const carDistFromCenter = Math.hypot(carGroup.position.x, carGroup.position.z);
    if (carDistFromCenter < 80) return;     // too far from mountains
    if (now - lastCowbell < 30000 + Math.random() * 30000) return;
    lastCowbell = now;
    if (window.imranSound && window.imranSound._ctx_for_cowbell !== false) {
      try {
        const ctx = window.imranSound.unlock && (window.imranSound._ctx || (window.imranSound.unlock(), window.imranSound._ctx));
      } catch (e) {}
    }
    // Use a tiny one-shot via Web Audio if available
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = window.__imranCowbellCtx || (window.__imranCowbellCtx = new AC());
      const t = c.currentTime;
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = 440 + Math.random() * 60;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 1.5);
    } catch (e) {}
  }
  window.__imranCowbellTick = maybeCowbell;

  // Expose Switzerland animation hooks for tick loop
  window.__imranSwiss = {
    cableStart, cableEnd, gondola: gondolaGroup,
    rallyCheckpoints, rallyCount: () => rallyCount, incrementRally: () => rallyCount++,
  };

  // ─────────────── ✈️ AIRPORT (SW district, outside old boundary) ───────────────
  // Runway running E-W centred at (-110, 0, -110). Terminal building at the south end,
  // two planes loop a takeoff/land animation along the runway.
  const APT_X = -110, APT_Z = -110;
  // Runway tarmac — long thin asphalt strip
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 12),
    new THREE.MeshStandardMaterial({ color: 0x222024, roughness: 0.95, metalness: 0.05 })
  );
  runway.rotation.x = -Math.PI/2;
  runway.position.set(APT_X, 0.05, APT_Z);
  runway.receiveShadow = true;
  scene.add(runway);
  // Centre lane stripes
  for (let i = -36; i <= 36; i += 8) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe066 })
    );
    dash.rotation.x = -Math.PI/2;
    dash.position.set(APT_X + i, 0.08, APT_Z);
    scene.add(dash);
  }
  // Threshold chevrons at each end
  for (const endX of [APT_X - 38, APT_X + 38]) {
    for (let dz = -4.5; dz <= 4.5; dz += 1.5) {
      const chev = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.35),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      chev.rotation.x = -Math.PI/2;
      chev.position.set(endX, 0.07, APT_Z + dz);
      scene.add(chev);
    }
  }
  // Terminal building — long modernist box
  const terminalBody = new THREE.Mesh(
    new THREE.BoxGeometry(34, 7, 11),
    new THREE.MeshStandardMaterial({ color: 0xd6c8b0, roughness: 0.7, metalness: 0.1 })
  );
  terminalBody.position.set(APT_X, 3.5, APT_Z - 18);
  terminalBody.castShadow = true; terminalBody.receiveShadow = true;
  scene.add(terminalBody);
  const terminalRoof = new THREE.Mesh(
    new THREE.BoxGeometry(36, 0.4, 13),
    new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 0.4 })
  );
  terminalRoof.position.set(APT_X, 7.2, APT_Z - 18);
  scene.add(terminalRoof);
  // Glass strip windows on the runway-facing side
  const terminalGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 4),
    new THREE.MeshStandardMaterial({ color: 0x1a3850, emissive: 0x5ce5ff, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.6 })
  );
  terminalGlass.position.set(APT_X, 4, APT_Z - 12.45);
  scene.add(terminalGlass);
  // Control tower (airport — renamed to avoid collision with observation tower)
  const aptTowerShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.6, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xc8b89a, roughness: 0.7 })
  );
  aptTowerShaft.position.set(APT_X + 14, 7, APT_Z - 22);
  aptTowerShaft.castShadow = true;
  scene.add(aptTowerShaft);
  const aptTowerCab = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 2.5, 4.5),
    new THREE.MeshStandardMaterial({ color: 0x1a3850, emissive: 0xffe066, emissiveIntensity: 0.5, metalness: 0.4 })
  );
  aptTowerCab.position.set(APT_X + 14, 15, APT_Z - 22);
  aptTowerCab.castShadow = true;
  scene.add(aptTowerCab);
  const aptTowerRoof = new THREE.Mesh(
    new THREE.ConeGeometry(2.8, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 0.7 })
  );
  aptTowerRoof.position.set(APT_X + 14, 17, APT_Z - 22);
  scene.add(aptTowerRoof);
  // "AIRPORT" sign on the terminal facade
  const aptSign = makeLabel('✈ IMRAN INTERNATIONAL', '#ffe066', 80);
  aptSign.position.set(APT_X, 8.4, APT_Z - 12.55);
  aptSign.scale.set(0.7, 0.7, 0.7);
  aptSign.userData.noBillboard = true;
  scene.add(aptSign);

  // Port-scan demo signpost — flights/gates metaphor for nmap port discovery
  const aptDemoPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
  );
  aptDemoPost.position.set(APT_X + 14, 1.75, APT_Z - 30);
  scene.add(aptDemoPost);
  const aptDemoSign = makeLabel('🛬 PORT SCAN DEMO — press E', '#5ce5ff', 70);
  aptDemoSign.position.set(APT_X + 14, 3.5, APT_Z - 30);
  aptDemoSign.scale.set(0.6, 0.6, 0.6);
  aptDemoSign.userData.noBillboard = true;
  scene.add(aptDemoSign);
  zones.push({
    x: APT_X, z: APT_Z, radius: 30, key: 'port_scan_demo',
    label: 'PORT SCAN DEMO', ring: null, lab: aptDemoSign
  });

  // Two animated planes that loop takeoff/landing along the runway (-X to +X)
  function makePlane(color = 0xffffff) {
    const g = new THREE.Group();
    // Fuselage
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.45, 6.5, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 })
    );
    body.rotation.z = Math.PI/2;
    body.castShadow = true;
    g.add(body);
    // Nose cone
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.2, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 })
    );
    nose.rotation.z = -Math.PI/2;
    nose.position.set(3.85, 0, 0);
    g.add(nose);
    // Main wings
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 6.5),
      new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 0.2, roughness: 0.4 })
    );
    wing.position.set(-0.2, 0, 0);
    wing.castShadow = true;
    g.add(wing);
    // Tail fin
    const tailV = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.2, 0.1),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
    );
    tailV.position.set(-2.8, 0.6, 0);
    g.add(tailV);
    // Tail horizontal
    const tailH = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.08, 1.8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
    );
    tailH.position.set(-2.8, 0.5, 0);
    g.add(tailH);
    return g;
  }
  const planeA = makePlane(0xeef0f5);
  const planeB = makePlane(0xffb070);
  scene.add(planeA);
  scene.add(planeB);
  // Animation state — each plane runs an independent 30-sec loop with phase offset
  const planeStateA = { t: 0, period: 30, x0: APT_X };
  const planeStateB = { t: 15, period: 30, x0: APT_X };
  function tickAirport(dt) {
    for (const p of [planeStateA, planeStateB]) {
      p.t = (p.t + dt) % p.period;
      const u = p.t / p.period;            // 0..1 over 30 sec
      const isA = (p === planeStateA);
      const plane = isA ? planeA : planeB;
      // 0.0-0.30: roll along runway (y=1, x: -38 → +38)
      // 0.30-0.45: liftoff (climb to y=18, x continues +18)
      // 0.45-0.55: cruise far away (off-screen wraparound)
      // 0.55-0.70: descend back (y from 18 → 1, x: +38 → -38, reversed direction)
      // 0.70-1.00: taxi back to start
      let x, y, yaw, pitch;
      if (u < 0.30) {
        // takeoff roll
        const r = u / 0.30;
        x = -38 + r * 76;
        y = 1.0;
        yaw = 0;     // facing +X
        pitch = 0;
      } else if (u < 0.45) {
        // climb out
        const r = (u - 0.30) / 0.15;
        x = 38 + r * 60;
        y = 1.0 + r * 25;
        yaw = 0;
        pitch = -0.35 * Math.sin(r * Math.PI);   // pitch up then level
      } else if (u < 0.55) {
        // off-screen / wraparound — fade up high then approach from other side
        x = 100 - (u - 0.45) / 0.10 * 200;
        y = 28;
        yaw = Math.PI;     // turning around
        pitch = 0;
      } else if (u < 0.70) {
        // approach + descend
        const r = (u - 0.55) / 0.15;
        x = -100 + r * 60;
        y = 28 - r * 27;
        yaw = Math.PI;     // facing -X
        pitch = 0.2 * Math.sin(r * Math.PI);    // pitch up for flare
      } else {
        // taxi back to start
        const r = (u - 0.70) / 0.30;
        x = -40 + r * 2;     // stay near west threshold
        y = 1.0;
        yaw = 0;
        pitch = 0;
      }
      plane.position.set(APT_X + x, y, APT_Z);
      plane.rotation.set(0, yaw, pitch);
    }
  }
  window.__imranAirport = { tick: tickAirport };

  // ─────────────── ⚓ HARBOUR (SE district, outside old boundary) ───────────────
  // Sandy beach + ocean rectangle + 2 ships sailing in a slow loop
  const HBR_X = 110, HBR_Z = 110;
  // Beach — large sand-coloured circle
  const beach = new THREE.Mesh(
    new THREE.CircleGeometry(28, 36),
    new THREE.MeshStandardMaterial({ color: 0xe8c290, roughness: 1.0, metalness: 0 })
  );
  beach.rotation.x = -Math.PI/2;
  beach.position.set(HBR_X - 18, 0.04, HBR_Z - 8);
  beach.receiveShadow = true;
  scene.add(beach);
  // Ocean — large blue rectangle east + south of the beach
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(75, 75),
    new THREE.MeshStandardMaterial({
      color: 0x2a6a9c, roughness: 0.3, metalness: 0.4,
      emissive: 0x103450, emissiveIntensity: 0.15,
    })
  );
  ocean.rotation.x = -Math.PI/2;
  ocean.position.set(HBR_X + 18, 0.06, HBR_Z + 12);
  ocean.receiveShadow = true;
  scene.add(ocean);
  // Pier extending into the ocean from the beach (renamed to avoid lake-pier collision)
  const hbrPier = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.3, 3),
    new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
  );
  hbrPier.position.set(HBR_X + 4, 0.35, HBR_Z - 4);
  hbrPier.castShadow = true; hbrPier.receiveShadow = true;
  scene.add(hbrPier);
  // Pier supports
  for (let i = -7; i <= 7; i += 3.5) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3018 })
    );
    post.position.set(HBR_X + 4 + i, 0.5, HBR_Z - 5.4);
    scene.add(post);
    const post2 = post.clone();
    post2.position.set(HBR_X + 4 + i, 0.5, HBR_Z - 2.6);
    scene.add(post2);
  }
  // Lighthouse at the harbour mouth
  const lhBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.8, 2, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 })
  );
  lhBase.position.set(HBR_X + 35, 1, HBR_Z - 18);
  lhBase.castShadow = true;
  scene.add(lhBase);
  const lhShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.1, 9, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })
  );
  lhShaft.position.set(HBR_X + 35, 6.5, HBR_Z - 18);
  lhShaft.castShadow = true;
  scene.add(lhShaft);
  // Red horizontal stripes
  for (const stripeY of [4, 7, 10]) {
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.8, 12),
      new THREE.MeshStandardMaterial({ color: 0xa83232 })
    );
    stripe.position.set(HBR_X + 35, stripeY, HBR_Z - 18);
    scene.add(stripe);
  }
  // Lighthouse lamp
  const lhLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 1.5 })
  );
  lhLamp.position.set(HBR_X + 35, 12, HBR_Z - 18);
  scene.add(lhLamp);
  const lhLight = new THREE.PointLight(0xffe066, 1.6, 60, 1.5);
  lhLight.position.set(HBR_X + 35, 12, HBR_Z - 18);
  scene.add(lhLight);
  // "HARBOUR" sign
  const hbrSign = makeLabel('⚓ IMRAN HARBOUR', '#5ce5ff', 80);
  hbrSign.position.set(HBR_X - 18, 6, HBR_Z - 18);
  hbrSign.scale.set(0.8, 0.8, 0.8);
  hbrSign.userData.noBillboard = true;
  scene.add(hbrSign);

  // 2 ships sailing in a circular loop on the ocean
  function makeShip(color = 0xeef0f5) {
    const g = new THREE.Group();
    // Hull — wider at top, narrower at bottom
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(8, 1.4, 3),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 })
    );
    hull.position.y = 0.7;
    hull.castShadow = true;
    g.add(hull);
    // Bow point
    const bow = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 2, 4),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
    );
    bow.rotation.z = -Math.PI/2;
    bow.rotation.x = Math.PI/4;     // align cone to point along +X
    bow.position.set(4.5, 0.7, 0);
    g.add(bow);
    // Cabin / superstructure
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.6, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.7 })
    );
    cabin.position.set(-1, 2.2, 0);
    cabin.castShadow = true;
    g.add(cabin);
    // Funnel / smokestack
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 1.6, 10),
      new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 0.7 })
    );
    stack.position.set(-1.6, 3.6, 0);
    g.add(stack);
    // Mast
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x222 })
    );
    mast.position.set(2, 3.5, 0);
    g.add(mast);
    return g;
  }
  const shipA = makeShip(0xeef0f5);
  const shipB = makeShip(0xffb070);
  scene.add(shipA);
  scene.add(shipB);
  // Each ship orbits around an offshore centre, with phase offset
  const shipStateA = { t: 0, period: 80, cx: HBR_X + 25, cz: HBR_Z + 18, r: 18 };
  const shipStateB = { t: 40, period: 80, cx: HBR_X + 25, cz: HBR_Z + 18, r: 24 };
  function tickHarbour(dt) {
    for (const s of [shipStateA, shipStateB]) {
      s.t = (s.t + dt) % s.period;
      const ang = (s.t / s.period) * Math.PI * 2;
      const x = s.cx + Math.cos(ang) * s.r;
      const z = s.cz + Math.sin(ang) * s.r;
      const ship = (s === shipStateA) ? shipA : shipB;
      ship.position.set(x, 0.05, z);
      // Face along the orbit direction (tangent)
      ship.rotation.y = -ang + Math.PI/2;
      // Bob slightly with the waves
      ship.position.y = 0.05 + Math.sin(s.t * 1.2) * 0.05;
    }
  }
  window.__imranHarbour = { tick: tickHarbour };

  // Harbour fisherman + phishing-demo zone — sits at the end of the pier.
  // Clicking him (driving/walking near + E) opens a phishing-credential demo modal.
  const fisherGroup = new THREE.Group();
  // Fisherman body (simple seated figure — capsule body + sphere head + fishing rod)
  const fishBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 1.0, 12),
    new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.8 })
  );
  fishBody.position.y = 0.7;
  fishBody.castShadow = true;
  fisherGroup.add(fishBody);
  const fishHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xd0a070, roughness: 0.85 })
  );
  fishHead.position.y = 1.5;
  fisherGroup.add(fishHead);
  // Conical sun hat
  const fishHat = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.4, 12),
    new THREE.MeshStandardMaterial({ color: 0xa83232, roughness: 0.9 })
  );
  fishHat.position.y = 1.85;
  fisherGroup.add(fishHat);
  // Fishing rod — angled cylinder pointing outward toward the water
  const fishRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 3.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a1a10 })
  );
  fishRod.position.set(0.45, 1.6, 0);
  fishRod.rotation.z = -Math.PI / 4;
  fishRod.rotation.y = Math.PI / 2;
  fisherGroup.add(fishRod);
  fisherGroup.position.set(HBR_X + 12, 0.5, HBR_Z - 4);
  scene.add(fisherGroup);
  // Floating fishing line + animated lure (animated in tick via window.__imranFisher)
  const fishLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 2.5, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  fishLine.position.set(HBR_X + 14, 1.2, HBR_Z - 4);
  scene.add(fishLine);
  // Phishing-demo signpost (visible from both sides)
  const phishPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
  );
  phishPost.position.set(HBR_X + 8, 1.75, HBR_Z - 7);
  scene.add(phishPost);
  const phishSign = makeLabel('🎣 PHISHING DEMO — press E', '#ff8a6e', 70);
  phishSign.position.set(HBR_X + 8, 3.5, HBR_Z - 7);
  phishSign.scale.set(0.6, 0.6, 0.6);
  phishSign.userData.noBillboard = true;
  scene.add(phishSign);
  // Register the phishing zone — fires whenever the player approaches the harbour/beach area.
  // Center at harbour core (110, 110), radius 50 covers the whole beach approach so the prompt
  // appears as soon as the player gets near the sand, not just at the water's edge.
  zones.push({
    x: HBR_X, z: HBR_Z, radius: 50, key: 'phishing_demo',
    label: 'PHISHING DEMO', ring: null, lab: phishSign
  });
  // Animate the fishing line subtly bobbing
  function tickFisher(t) {
    fishLine.position.y = 1.2 + Math.sin(t * 1.5) * 0.1;
  }
  window.__imranFisher = { tick: tickFisher };

  // ─────────────── 🎈 HOT AIR BALLOON STATION ───────────────
  // 6 balloons clustered at (50, 0, -110) — south of spawn, between mailroom and airport.
  // 4 balloons grounded (parked), 2 are continuously animating takeoff/landing cycles.
  // Player can press E near a grounded one to take a balloon ride.
  const BAL_X = 50, BAL_Z = -110;
  // Station ground pad (grass-clearing for balloons)
  const balPad = new THREE.Mesh(
    new THREE.CircleGeometry(20, 36),
    new THREE.MeshStandardMaterial({ color: 0x8a7058, roughness: 1.0 })
  );
  balPad.rotation.x = -Math.PI/2;
  balPad.position.set(BAL_X, 0.04, BAL_Z);
  balPad.receiveShadow = true;
  scene.add(balPad);
  // Station signpost
  const balPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3018 })
  );
  balPost.position.set(BAL_X - 18, 2, BAL_Z + 5);
  scene.add(balPost);
  const balSign = makeLabel('🎈 BALLOON STATION', '#ff8a6e', 80);
  balSign.position.set(BAL_X - 18, 4.4, BAL_Z + 5);
  balSign.scale.set(0.6, 0.6, 0.6);
  balSign.userData.noBillboard = true;
  scene.add(balSign);
  // Cloud-security demo signpost — balloons float in clouds → S3 misconfig analogy
  const balDemoPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
  );
  balDemoPost.position.set(BAL_X - 18, 1.75, BAL_Z + 10);
  scene.add(balDemoPost);
  const balDemoSign = makeLabel('☁ CLOUD SECURITY — press E', '#5ce5ff', 70);
  balDemoSign.position.set(BAL_X - 18, 3.5, BAL_Z + 10);
  balDemoSign.scale.set(0.6, 0.6, 0.6);
  balDemoSign.userData.noBillboard = true;
  scene.add(balDemoSign);
  zones.push({
    x: BAL_X, z: BAL_Z, radius: 22, key: 'cloud_demo',
    label: 'CLOUD SECURITY', ring: null, lab: balDemoSign
  });
  // Helper to build one balloon
  function makeBalloon(color, basketColor = 0x6e4a28) {
    const g = new THREE.Group();
    // Envelope (sphere — squished slightly vertically for teardrop shape)
    const env = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 18, 14),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.6 })
    );
    env.scale.set(1, 1.15, 1);
    env.position.y = 5.5;
    env.castShadow = true;
    g.add(env);
    // Vertical color bands for visual variety
    for (const ang of [0, Math.PI/3, 2*Math.PI/3, Math.PI, 4*Math.PI/3, 5*Math.PI/3]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(2.4, 0.08, 6, 24, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
      );
      band.rotation.y = ang;
      band.rotation.x = Math.PI / 2;
      band.position.y = 5.5;
      band.scale.set(1, 1, 1.15);
      g.add(band);
    }
    // Basket
    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.0, 1.4),
      new THREE.MeshStandardMaterial({ color: basketColor, roughness: 0.85 })
    );
    basket.position.y = 1.5;
    basket.castShadow = true;
    g.add(basket);
    // 4 ropes connecting basket to envelope
    for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 2.5, 4),
        new THREE.MeshBasicMaterial({ color: 0x222 })
      );
      rope.position.set(dx, 3.0, dz);
      g.add(rope);
    }
    return g;
  }
  // 4 grounded balloons in a 2×2 grid (player can ride these)
  const groundedBalloons = [];
  const stationBalloonColors = [0xff6a3a, 0x5ce5ff, 0xffe066, 0xa83232, 0x6e4a8c, 0xf2c8a0];
  let bcIdx = 0;
  for (const [dx, dz] of [[-7, -5], [7, -5], [-7, 8], [7, 8]]) {
    const b = makeBalloon(stationBalloonColors[bcIdx++ % stationBalloonColors.length]);
    b.position.set(BAL_X + dx, 0, BAL_Z + dz);
    scene.add(b);
    groundedBalloons.push(b);
    // Each grounded balloon has a small "RIDE — E" sign next to it
    const ridePost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x222 })
    );
    ridePost.position.set(BAL_X + dx + 1.5, 0.75, BAL_Z + dz);
    scene.add(ridePost);
    // Register a small zone pad for ride trigger
    zones.push({
      x: BAL_X + dx, z: BAL_Z + dz, radius: 3, key: 'balloon_ride_pad',
      rideTarget: b, label: 'RIDE BALLOON', ring: null, lab: null
    });
  }
  // 2 animating balloons that take off + land on a 40-sec cycle
  const animBalloons = [
    { mesh: makeBalloon(stationBalloonColors[bcIdx++ % stationBalloonColors.length]), t: 0,  period: 40, x: BAL_X - 14, z: BAL_Z + 2 },
    { mesh: makeBalloon(stationBalloonColors[bcIdx++ % stationBalloonColors.length]), t: 20, period: 40, x: BAL_X + 14, z: BAL_Z + 2 },
  ];
  for (const ab of animBalloons) {
    ab.mesh.position.set(ab.x, 0, ab.z);
    scene.add(ab.mesh);
  }
  // Tour path for the rideable balloon — Catmull-Rom spline through the city.
  // Y values define the altitude profile (rises, cruises, descends).
  const balloonTourCam = new THREE.CatmullRomCurve3([
    new THREE.Vector3(BAL_X,   0, BAL_Z),         // takeoff
    new THREE.Vector3(BAL_X,  35, BAL_Z + 20),    // climb out
    new THREE.Vector3(  20,  60, -50),            // cruise NE over the city
    new THREE.Vector3(  60,  70,  20),            // pass the cable car / alpine
    new THREE.Vector3(  85,  65,  65),            // over observation tower
    new THREE.Vector3( 100,  60, 100),            // over harbour
    new THREE.Vector3(  40,  55,  90),            // swing back west
    new THREE.Vector3( -40,  60,  40),            // pass HTB skull / hacker den
    new THREE.Vector3( -90,  55, -40),            // over airport
    new THREE.Vector3(   0,  45, -80),            // approach back from south
    new THREE.Vector3(BAL_X,  20, BAL_Z + 5),     // final descent
    new THREE.Vector3(BAL_X,   0, BAL_Z),         // touchdown
  ], false, 'catmullrom', 0.5);

  function tickBalloons(dt) {
    // ─── Active rider's balloon — animate along the tour path ───
    if (rideTarget && rideTarget.userData && rideTarget.userData.rideTour) {
      const tour = rideTarget.userData.rideTour;
      tour.t += dt;
      const u = Math.min(1, tour.t / tour.duration);
      const p = balloonTourCam.getPoint(u);
      rideTarget.position.copy(p);
      // Subtle sway
      rideTarget.rotation.z = Math.sin(tour.t) * 0.04;
      // Auto-exit when tour completes
      if (tour.t >= tour.duration) {
        // Snap back to home pad and exit ride
        rideTarget.position.set(tour.homeX, tour.homeY, tour.homeZ);
        rideTarget.userData.rideTour = null;
        exitRideMode();
      }
    }
    // ─── Continuously-animating decorative balloons ───
    for (const ab of animBalloons) {
      ab.t = (ab.t + dt) % ab.period;
      const u = ab.t / ab.period;
      let y, drift;
      if (u < 0.10) {
        // ground hold (boarding)
        y = 0;
        drift = 0;
      } else if (u < 0.35) {
        // ascend
        const r = (u - 0.10) / 0.25;
        y = r * 60;
        drift = r * 30;
      } else if (u < 0.65) {
        // cruise high
        y = 60 + Math.sin((u - 0.35) * Math.PI * 4) * 5;
        drift = 30 + (u - 0.35) * 20;     // slow drift
      } else if (u < 0.90) {
        // descend
        const r = (u - 0.65) / 0.25;
        y = 60 - r * 60;
        drift = 36 - r * 36;
      } else {
        // ground hold (deboarding)
        y = 0;
        drift = 0;
      }
      ab.mesh.position.set(ab.x + drift * 0.6, y, ab.z);
      // Subtle sway
      ab.mesh.rotation.z = Math.sin(ab.t) * 0.03;
    }
  }
  window.__imranBalloons = { tick: tickBalloons, grounded: groundedBalloons };

  // ─────────────── 🛡️ SECURITY ZONE — "The Hacker's Den" at (-80, 0, -10) ───────────────
  const denX = -80, denZ = -10;
  const denGroup = new THREE.Group();
  denGroup.position.set(denX, 0, denZ);
  scene.add(denGroup);

  // Den marker pad — dark with green emissive (matrix vibe)
  const denPad = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.18, 48),
    new THREE.MeshStandardMaterial({ color: 0x0a1a0a, emissive: 0x004400, emissiveIntensity: 0.3 })
  );
  denPad.position.y = 0.05;
  denGroup.add(denPad);
  const denPadRing = new THREE.Mesh(
    new THREE.RingGeometry(7.8, 8.1, 64),
    new THREE.MeshBasicMaterial({ color: 0x9fef00, transparent: true, opacity: 0.7 })
  );
  denPadRing.rotation.x = -Math.PI/2;
  denPadRing.position.y = 0.07;
  denGroup.add(denPadRing);
  // Big "HACKER'S DEN" label hovering above
  const denTitleLab = makeLabel("HACKER'S DEN", '#9fef00', 130);
  denTitleLab.position.set(0, 7, 0);
  denTitleLab.scale.set(1.2, 1.2, 1.2);
  denGroup.add(denTitleLab);

  // ─── S2: Famous Breach Timeline — 7 markers along a curved path north of pad ───
  const breaches = [
    { yr: 2014, name: 'Heartbleed',   desc: 'OpenSSL TLS heartbeat memory leak' },
    { yr: 2016, name: 'Mirai Botnet', desc: 'IoT devices DDoS attack (Dyn)' },
    { yr: 2017, name: 'WannaCry',     desc: 'Worm ransomware via SMBv1 EternalBlue' },
    { yr: 2017, name: 'Equifax',      desc: '147M records via Apache Struts CVE' },
    { yr: 2020, name: 'SolarWinds',   desc: 'Supply-chain backdoor in Orion' },
    { yr: 2021, name: 'Log4Shell',    desc: 'Log4j JNDI RCE — CVSS 10.0' },
    { yr: 2023, name: 'MOVEit',       desc: 'Cl0p ransomware via SQL injection' },
  ];
  for (let i = 0; i < breaches.length; i++) {
    const b = breaches[i];
    const bx = -10 + i * 4;
    const bz = 12;
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x222 })
    );
    pole.position.set(bx, 1.5, bz);
    denGroup.add(pole);
    // Glowing marker plate (CRT-style)
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.4, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x0a1408, emissive: 0x9fef00, emissiveIntensity: 0.45, roughness: 0.4 })
    );
    plate.position.set(bx, 3.4, bz);
    plate.castShadow = true;
    denGroup.add(plate);
    // Year + name labels on plate
    const yrLab = makeLabel(String(b.yr), '#9fef00', 80);
    yrLab.position.set(bx, 3.7, bz + 0.07);
    yrLab.scale.set(0.45, 0.45, 0.45);
    denGroup.add(yrLab);
    const nmLab = makeLabel(b.name, '#ffffff', 90);
    nmLab.position.set(bx, 3.2, bz + 0.07);
    nmLab.scale.set(0.35, 0.35, 0.35);
    denGroup.add(nmLab);
  }
  // Timeline floor stripe
  const timelineStripe = new THREE.Mesh(
    new THREE.BoxGeometry(28, 0.05, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x9fef00, transparent: true, opacity: 0.6 })
  );
  timelineStripe.position.set(2, 0.06, 12);
  denGroup.add(timelineStripe);

  // ─── S5: Padlock Garden — OWASP Top 10 as 3D padlocks (2x5 grid) south of pad ───
  const owaspTop10 = [
    { code: 'A01', name: 'Broken Access', open: true  },
    { code: 'A02', name: 'Crypto Failure', open: false },
    { code: 'A03', name: 'Injection (SQLi)', open: true  },
    { code: 'A04', name: 'Insecure Design', open: false },
    { code: 'A05', name: 'Misconfiguration', open: true },
    { code: 'A06', name: 'Vuln. Components', open: true  },
    { code: 'A07', name: 'Auth Failure', open: false },
    { code: 'A08', name: 'Data Integrity', open: false },
    { code: 'A09', name: 'Logging Failure', open: false },
    { code: 'A10', name: 'SSRF', open: true  },
  ];
  for (let i = 0; i < owaspTop10.length; i++) {
    const lock = owaspTop10[i];
    const col = Math.floor(i / 5);
    const row = i % 5;
    const lx = -8 + col * 4;
    const lz = -10 - row * 3;
    // Padlock body
    const lockBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.4, 0.6),
      new THREE.MeshStandardMaterial({
        color: lock.open ? 0xff8a6e : 0x7bc04a,
        emissive: lock.open ? 0xff6a3a : 0x5aa030,
        emissiveIntensity: 0.4,
        roughness: 0.4, metalness: 0.6,
      })
    );
    lockBody.position.set(lx, 1.1, lz);
    lockBody.castShadow = true;
    denGroup.add(lockBody);
    // Shackle (torus, half rotated up — open or closed)
    const shackle = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.10, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({
        color: 0xc0c0c0, metalness: 0.8, roughness: 0.3,
      })
    );
    shackle.position.set(lx, 2.1, lz);
    shackle.rotation.x = Math.PI;
    if (lock.open) shackle.rotation.z = -0.6;       // tilt to look "popped open"
    denGroup.add(shackle);
    // Label below
    const lockLab = makeLabel(`${lock.code}: ${lock.name}`, lock.open ? '#ff8a6e' : '#7bc04a', 70);
    lockLab.position.set(lx, 0.4, lz + 0.5);
    lockLab.scale.set(0.32, 0.32, 0.32);
    denGroup.add(lockLab);
  }

  // ─── S7: Linux Command Library — 12 vertical glowing book columns ───
  const linuxCmds = [
    { cmd: 'nmap',       use: 'network scanner' },
    { cmd: 'tcpdump',    use: 'packet capture' },
    { cmd: 'wireshark',  use: 'protocol analyzer' },
    { cmd: 'gdb',        use: 'binary debugger' },
    { cmd: 'objdump',    use: 'disassembler' },
    { cmd: 'strace',     use: 'syscall tracer' },
    { cmd: 'metasploit', use: 'exploit framework' },
    { cmd: 'john',       use: 'password cracker' },
    { cmd: 'hashcat',    use: 'GPU hash cracker' },
    { cmd: 'hydra',      use: 'login brute-forcer' },
    { cmd: 'burp',       use: 'web proxy/scanner' },
    { cmd: 'ffuf',       use: 'fuzzer' },
  ];
  for (let i = 0; i < linuxCmds.length; i++) {
    const c = linuxCmds[i];
    const cx = 12 + (i % 6) * 1.6;
    const cz = -6 + Math.floor(i / 6) * 2.0;
    const colH = 2 + (i % 4) * 0.7;
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, colH, 0.7),
      new THREE.MeshStandardMaterial({
        color: 0x111811,
        emissive: 0x9fef00, emissiveIntensity: 0.55,
        roughness: 0.5,
      })
    );
    col.position.set(cx, colH / 2, cz);
    col.castShadow = true;
    denGroup.add(col);
    const cmdLab = makeLabel(c.cmd, '#9fef00', 70);
    cmdLab.position.set(cx, colH + 0.4, cz);
    cmdLab.scale.set(0.28, 0.28, 0.28);
    denGroup.add(cmdLab);
  }

  // ─── S8: SQL Injection Demo Laptop — 3D laptop prop with clickable form (handled HTML side) ───
  const laptop = new THREE.Group();
  // Base
  const lapBase = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.18, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.5, metalness: 0.4 })
  );
  lapBase.position.y = 1.2;
  laptop.add(lapBase);
  // Screen
  const lapScreen = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.6, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.4 })
  );
  lapScreen.position.set(0, 2.0, -0.7);
  lapScreen.rotation.x = -0.2;
  laptop.add(lapScreen);
  // Screen glow (CanvasTexture for fake login form)
  const sqliCanvas = document.createElement('canvas');
  sqliCanvas.width = 256; sqliCanvas.height = 160;
  const sqliCtx = sqliCanvas.getContext('2d');
  sqliCtx.fillStyle = '#001100'; sqliCtx.fillRect(0, 0, 256, 160);
  sqliCtx.fillStyle = '#9fef00';
  sqliCtx.font = '16px "JetBrains Mono", monospace';
  sqliCtx.textAlign = 'center';
  sqliCtx.fillText('🔓 SQLi DEMO', 128, 24);
  sqliCtx.font = '11px "JetBrains Mono", monospace';
  sqliCtx.fillText('Drive close & press E', 128, 48);
  sqliCtx.fillText("then try: admin' OR '1'='1", 128, 70);
  sqliCtx.fillStyle = '#003300';
  sqliCtx.fillRect(20, 90, 216, 24);
  sqliCtx.fillStyle = '#9fef00';
  sqliCtx.fillText('| user:_______', 128, 107);
  sqliCtx.fillRect(20, 124, 216, 24);
  sqliCtx.fillText('| pass:_______', 128, 141);
  const sqliTex = new THREE.CanvasTexture(sqliCanvas);
  sqliTex.colorSpace = THREE.SRGBColorSpace;
  const lapScreenGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshBasicMaterial({ map: sqliTex })
  );
  lapScreenGlow.position.set(0, 2.0, -0.65);
  lapScreenGlow.rotation.x = -0.2;
  laptop.add(lapScreenGlow);
  laptop.position.set(0, 0, -22);
  denGroup.add(laptop);
  // Pad in front of laptop for E-key interaction
  const sqliPad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.14, 32),
    new THREE.MeshStandardMaterial({ color: 0x0a1a0a, emissive: 0x9fef00, emissiveIntensity: 0.4 })
  );
  sqliPad.position.set(0, 0.05, -22);
  denGroup.add(sqliPad);
  const sqliPadRing = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 2.3, 48),
    new THREE.MeshBasicMaterial({ color: 0x9fef00, transparent: true, opacity: 0.7 })
  );
  sqliPadRing.rotation.x = -Math.PI/2;
  sqliPadRing.position.set(0, 0.07, -22);
  denGroup.add(sqliPadRing);
  // Add to zones for press-E interaction
  zones.push({ x: denX + 0, z: denZ + -22, radius: 2.2, key: 'sqli_demo', ring: sqliPadRing });
  // Add a regular zone-pad for the den entrance
  zones.push({ x: denX, z: denZ, radius: 7.5, key: 'hackers_den', ring: denPadRing });

  // Green spotlight over the den
  const denSpot = new THREE.PointLight(0x9fef00, 1.6, 35, 2);
  denSpot.position.set(denX, 12, denZ);
  scene.add(denSpot);

  // ─────────────── ⚙️ BACKEND ZONE — "Server Room" at (80, 0, -10) ───────────────
  const srvX = 80, srvZ = -10;
  const srvGroup = new THREE.Group();
  srvGroup.position.set(srvX, 0, srvZ);
  scene.add(srvGroup);

  // Pad — dark blue with cyan emissive (datacenter vibe)
  const srvPad = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.18, 48),
    new THREE.MeshStandardMaterial({ color: 0x0a1a26, emissive: 0x004466, emissiveIntensity: 0.3 })
  );
  srvPad.position.y = 0.05;
  srvGroup.add(srvPad);
  const srvPadRing = new THREE.Mesh(
    new THREE.RingGeometry(7.8, 8.1, 64),
    new THREE.MeshBasicMaterial({ color: 0x5ce5ff, transparent: true, opacity: 0.7 })
  );
  srvPadRing.rotation.x = -Math.PI/2;
  srvPadRing.position.y = 0.07;
  srvGroup.add(srvPadRing);
  const srvTitleLab = makeLabel('SERVER ROOM', '#5ce5ff', 130);
  srvTitleLab.position.set(0, 7, 0);
  srvTitleLab.scale.set(1.2, 1.2, 1.2);
  srvGroup.add(srvTitleLab);

  // ─── B1: Microservices Farm — 5 service buildings ───
  const microservices = [
    { name: 'auth',         color: 0xffe066, pulse: 1.0  },
    { name: 'payments',     color: 0xff8a6e, pulse: 2.5  },
    { name: 'queue',        color: 0x9fef00, pulse: 4.0  },
    { name: 'user-db',      color: 0x5ce5ff, pulse: 0.7  },
    { name: 'cache-redis',  color: 0xff6a3a, pulse: 6.0  },
  ];
  const msPulses = [];
  for (let i = 0; i < microservices.length; i++) {
    const m = microservices[i];
    const mx = -10 + (i % 5) * 4.5;
    const mz = 12;
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x14182a, emissive: m.color, emissiveIntensity: 0.45, roughness: 0.5, metalness: 0.3,
    });
    const mb = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 3), buildingMat);
    mb.position.set(mx, 2, mz);
    mb.castShadow = true;
    srvGroup.add(mb);
    // Top blink LED
    const blink = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: m.color, emissive: m.color, emissiveIntensity: 1.4 })
    );
    blink.position.set(mx, 4.3, mz);
    srvGroup.add(blink);
    // Service name label
    const msLab = makeLabel(m.name, '#5ce5ff', 80);
    msLab.position.set(mx, 0.5, mz + 1.7);
    msLab.scale.set(0.32, 0.32, 0.32);
    srvGroup.add(msLab);
    msPulses.push({ blink, pulseRate: m.pulse, mat: buildingMat, baseEmissive: 0.45 });
  }

  // ─── B2: Live Deployment Pipeline — 4-stage track with traveling token ───
  const pipelineStages = ['commit', 'build', 'test', 'deploy'];
  const stageBoxes = [];
  for (let i = 0; i < pipelineStages.length; i++) {
    const sx = -8 + i * 4;
    const sz = 22;
    const stage = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.4, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x1a2030, emissive: 0x5ce5ff, emissiveIntensity: 0.2 })
    );
    stage.position.set(sx, 0.5, sz);
    srvGroup.add(stage);
    stageBoxes.push(stage);
    const stageLab = makeLabel(pipelineStages[i], '#5ce5ff', 80);
    stageLab.position.set(sx, 1.3, sz);
    stageLab.scale.set(0.32, 0.32, 0.32);
    srvGroup.add(stageLab);
  }
  // Connecting rail between stages
  const pipeRail = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.08, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x5ce5ff, transparent: true, opacity: 0.6 })
  );
  pipeRail.position.set(-2, 0.85, 22);
  srvGroup.add(pipeRail);
  // Glowing token that animates along the rail
  const pipeToken = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 1.6 })
  );
  pipeToken.position.set(-8, 0.95, 22);
  srvGroup.add(pipeToken);

  // ─── B6: Container Orchestra — 3 boxes for web/mp/caddy with health pulse ───
  const containers = [
    { name: 'web',   color: 0x5ce5ff },
    { name: 'mp',    color: 0x9fef00 },
    { name: 'caddy', color: 0xffe066 },
  ];
  const containerBoxes = [];
  for (let i = 0; i < containers.length; i++) {
    const c = containers[i];
    const cx = -6 + i * 4;
    const cz = -10;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.6, 2.4),
      new THREE.MeshStandardMaterial({
        color: 0x14182a,
        emissive: c.color, emissiveIntensity: 0.5,
        roughness: 0.4, metalness: 0.3,
      })
    );
    box.position.set(cx, 0.85, cz);
    box.castShadow = true;
    srvGroup.add(box);
    const cLab = makeLabel(c.name, '#5ce5ff', 80);
    cLab.position.set(cx, 1.85, cz);
    cLab.scale.set(0.32, 0.32, 0.32);
    srvGroup.add(cLab);
    containerBoxes.push({ box, color: c.color, name: c.name });
  }
  const orchestraLab = makeLabel('CONTAINER ORCHESTRA', '#5ce5ff', 100);
  orchestraLab.position.set(-2, 3.0, -10);
  orchestraLab.scale.set(0.5, 0.5, 0.5);
  srvGroup.add(orchestraLab);

  // ─── B7: Code Metrics Observatory — 4 dial gauges ───
  const gauges = [
    { name: 'LoC',     value: 12480, max: 50000, color: 0x5ce5ff, x: 8 },
    { name: 'repos',   value: 18,    max: 50,    color: 0x9fef00, x: 11 },
    { name: 'stars',   value: 47,    max: 200,   color: 0xffe066, x: 14 },
    { name: 'streak',  value: 23,    max: 100,   color: 0xff6a3a, x: 17 },
  ];
  for (const g of gauges) {
    // Backplate
    const back = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 32),
      new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.5 })
    );
    back.position.set(g.x, 3, -2);
    srvGroup.add(back);
    // Outer ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1.0, 32),
      new THREE.MeshBasicMaterial({ color: g.color })
    );
    ring.position.set(g.x, 3, -1.99);
    srvGroup.add(ring);
    // Needle (rotates based on value/max)
    const angle = -Math.PI / 2 + (g.value / g.max) * Math.PI * 1.5;
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.7, 0.08),
      new THREE.MeshBasicMaterial({ color: g.color })
    );
    needle.position.set(g.x + Math.cos(angle) * 0.35, 3 + Math.sin(angle) * 0.35, -1.97);
    needle.rotation.z = angle - Math.PI / 2;
    srvGroup.add(needle);
    // Label below
    const gLab = makeLabel(`${g.name}: ${g.value}`, '#5ce5ff', 60);
    gLab.position.set(g.x, 1.7, -2);
    gLab.scale.set(0.2, 0.2, 0.2);
    srvGroup.add(gLab);
  }
  const obsLab = makeLabel('METRICS OBSERVATORY', '#5ce5ff', 100);
  obsLab.position.set(12.5, 4.5, -2);
  obsLab.scale.set(0.5, 0.5, 0.5);
  srvGroup.add(obsLab);

  // Cyan spotlight over the server room
  const srvSpot = new THREE.PointLight(0x5ce5ff, 1.6, 35, 2);
  srvSpot.position.set(srvX, 12, srvZ);
  scene.add(srvSpot);

  // Add as zone for press-E interaction
  zones.push({ x: srvX, z: srvZ, radius: 7.5, key: 'server_room', ring: srvPadRing });

  // Expose backend zone state for tick animation + HTML interactions
  window.__imranBackend = {
    msPulses, pipeToken, containerBoxes,
    pipeT: 0,
  };

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
            new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xffb070, emissiveIntensity: 1.4 })
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
        new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xffb070, emissiveIntensity: 1.6 })
      );
      blink.position.y = h + 2.5;
      g.add(blink);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);
  }

  // Place ~25 buildings around the perimeter, district-themed (urban-architect plan).
  // Removed all buildings that overlapped the river bed (54,0)(54,-8)(56,18)(44,38)(38,44).
  // Relocated tech-park type-C neon towers WEST to Hacker's Den approach (cybersec aesthetic).
  const BUILDING_SPOTS = [
    // Downtown cluster (north-west, near about zone)
    [-44, -32, 'A'], [-44, -42, 'B'], [-32, -44, 'A'], [-44, -22, 'C'],
    [-58, -34, 'B'], [-32, -55, 'A'], [-44, -52, 'C'],
    // Tech Park flankers (around new Projects billboard at x=45, z=0) — cream brick studios
    [55, 8, 'B'], [50, -5, 'B'],
    // Mailroom (south)
    [-18, -55, 'A'], [16, -55, 'A'], [-30, -68, 'B'], [22, -68, 'B'],
    // Social Boulevard backdrop (north edge, behind socials at z=60)
    [-40, 78, 'C'], [-22, 78, 'C'], [-2, 78, 'C'], [22, 78, 'C'], [40, 78, 'C'],
    // Hacker's Den approach — relocated neon towers (Tron palette fits cybersec aesthetic)
    [-50, 0, 'C'], [-60, 10, 'C'], [-50, 20, 'C'], [-65, -10, 'C'], [-75, 10, 'C'], [-90, 0, 'C'],
    // Edge fillers (west)
    [-58, 4, 'A'], [-58, 16, 'B'],
  ];
  for (const [x, z, t] of BUILDING_SPOTS) {
    addBuilding(x, z, t, Math.random() * Math.PI * 2);
  }

  // ─────────────── 🌉 FLYOVER (elevated bridge over Pasha Boulevard) ───────────────
  // Approach ramp on -x side rises from y=0 to y=4 over 10m, then a 16m flat span,
  // then ramp down on +x side. Crosses over the road at z=0.
  function addRoadRamp(cx, cy, cz, len, height, axis = 'x', side = 1) {
    // axis 'x' means ramp along X direction; side = +1 ascending from -X to +X, -1 descending.
    // rotation.z = +ang tilts the +X end UP (Three.js Z-axis right-hand rule), so for
    // an ascending-east ramp (side=+1) we want rotation = +ang. side=-1 flips the slope.
    const ang = Math.atan2(height, len);
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.4, 5),
      new THREE.MeshStandardMaterial({ color: 0x3e3848, roughness: 0.9 })
    );
    ramp.position.set(cx, cy, cz);
    ramp.rotation.z = ang * side;
    ramp.castShadow = true; ramp.receiveShadow = true;
    scene.add(ramp);
    // Yellow lane line along the top of the ramp
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.95, 0.05, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xffe066 })
    );
    stripe.position.set(cx, cy + 0.22, cz);
    stripe.rotation.z = ang * side;
    scene.add(stripe);
    // Physics body — must match the visual rotation exactly
    const rampBody = new CANNON.Body({ mass: 0, material: groundMat });
    rampBody.addShape(new CANNON.Box(new CANNON.Vec3(len/2, 0.2, 2.5)));
    rampBody.position.set(cx, cy, cz);
    rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), ang * side);
    world.addBody(rampBody);
  }
  // Flyover #1 — over Pasha Blvd. Gentler 14° angle so the car drives up smoothly.
  // Lower height (3.5m) and longer ramps (18m). Ramp CENTER y = FLY_H/2 puts the LOW end at
  // ground (y=0) and the HIGH end exactly at the span level (y=FLY_H), perfectly drivable.
  const FLY_H = 3.5;
  addRoadRamp(33, FLY_H/2, 0, 18, FLY_H, 'x', 1);
  // Flat span over the boulevard
  const flySpan = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.4, 5),
    new THREE.MeshStandardMaterial({ color: 0x3e3848, roughness: 0.9 })
  );
  flySpan.position.set(50, FLY_H, 0);
  flySpan.castShadow = true; flySpan.receiveShadow = true;
  scene.add(flySpan);
  // Span lane stripe
  const flySpanStripe = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.05, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xffe066 })
  );
  flySpanStripe.position.set(50, FLY_H + 0.22, 0);
  scene.add(flySpanStripe);
  // Span railings (cyan glow accents)
  for (const dz of [-2.4, 2.4]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.5, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x5ce5ff, emissive: 0x5ce5ff, emissiveIntensity: 0.6 })
    );
    rail.position.set(50, FLY_H + 0.7, dz);
    scene.add(rail);
  }
  // Span physics
  const flySpanBody = new CANNON.Body({ mass: 0, material: groundMat });
  flySpanBody.addShape(new CANNON.Box(new CANNON.Vec3(8, 0.2, 2.5)));
  flySpanBody.position.set(50, FLY_H, 0);
  world.addBody(flySpanBody);
  // Support pillars under the span
  for (const px of [42, 50, 58]) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, FLY_H, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x4a3848, roughness: 0.85 })
    );
    pillar.position.set(px, FLY_H/2, 0);
    pillar.castShadow = true;
    scene.add(pillar);
  }
  // Descend ramp on the other side (also longer + gentler) — center y = FLY_H/2 so it
  // meets the span at HIGH (-X end) and ground at LOW (+X end).
  addRoadRamp(67, FLY_H/2, 0, 18, FLY_H, 'x', -1);

  // ─────────────── 🚇 TUNNEL (covered roadway through buildings) ───────────────
  // 24m tunnel along Imran Avenue (x=0) between z=-50 and z=-26. Roof prevents top-down view inside.
  const TUNNEL_LEN = 24;
  const tunnelZ = -38;
  // Tunnel walls (left + right) — solid black with cyan accent stripe
  for (const dx of [-3.5, 3.5]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 4.5, TUNNEL_LEN),
      new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.8 })
    );
    wall.position.set(dx, 2.25, tunnelZ);
    wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);
    // Physics for the wall (so car bumps off inside)
    const wallBody = new CANNON.Body({ mass: 0, material: groundMat });
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(0.4, 2.25, TUNNEL_LEN/2)));
    wallBody.position.set(dx, 2.25, tunnelZ);
    world.addBody(wallBody);
    // Cyan emissive light strip running along the inside top of each wall
    const lightStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.15, TUNNEL_LEN - 0.4),
      new THREE.MeshBasicMaterial({ color: 0x5ce5ff })
    );
    lightStrip.position.set(dx + (dx > 0 ? -0.42 : 0.42), 4.0, tunnelZ);
    scene.add(lightStrip);
  }
  // Tunnel roof
  const tunnelRoof = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 0.4, TUNNEL_LEN),
    new THREE.MeshStandardMaterial({ color: 0x1a1a26, roughness: 0.85 })
  );
  tunnelRoof.position.set(0, 4.6, tunnelZ);
  tunnelRoof.castShadow = true;
  scene.add(tunnelRoof);
  // Roof physics so plane mode + jumps can't go through
  const tunnelRoofBody = new CANNON.Body({ mass: 0, material: groundMat });
  tunnelRoofBody.addShape(new CANNON.Box(new CANNON.Vec3(3.75, 0.2, TUNNEL_LEN/2)));
  tunnelRoofBody.position.set(0, 4.6, tunnelZ);
  world.addBody(tunnelRoofBody);
  // Tunnel entrance/exit "TUNNEL" labels above each opening
  for (const ez of [tunnelZ - TUNNEL_LEN/2 - 0.3, tunnelZ + TUNNEL_LEN/2 + 0.3]) {
    const archFrame = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 0.6, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x14101e, emissive: 0x5ce5ff, emissiveIntensity: 0.4 })
    );
    archFrame.position.set(0, 4.95, ez);
    scene.add(archFrame);
    const tnLab = makeLabel('TUNNEL', '#5ce5ff', 90);
    tnLab.position.set(0, 4.95, ez + (ez > tunnelZ ? 0.3 : -0.3));
    tnLab.scale.set(0.4, 0.4, 0.4);
    if (ez < tunnelZ) tnLab.rotation.y = Math.PI;
    tnLab.userData.noBillboard = true;
    scene.add(tnLab);
  }
  // Interior tunnel point lights for ambience
  for (let i = -1; i <= 1; i++) {
    const tlight = new THREE.PointLight(0x5ce5ff, 0.6, 12, 2);
    tlight.position.set(0, 4.0, tunnelZ + i * 8);
    scene.add(tlight);
  }

  // ─ ABOUT ZONE (Downtown anchor — civil engineer plan)
  addZonePad(-30, -25, COL.cyan, 'ABOUT ME', 'about', 5);

  // ─────────────── GITHUB CONTRIBUTION GRAPH (3D sculpture) ───────────────
  // Fetches real public commit data for Imranpasha30 and renders as a
  // 53-week × 7-day grid of glowing cubes whose height = commit count.
  // No auth required — uses free deno.dev contributions API.
  const ghGroup = new THREE.Group();
  ghGroup.position.set(-30, 0, -38);   // sits behind the about zone
  scene.add(ghGroup);
  // Pedestal/base
  const ghBase = new THREE.Mesh(
    new THREE.BoxGeometry(13, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x6e4a28, roughness: 0.85 })
  );
  ghBase.position.y = 0.25;
  ghGroup.add(ghBase);
  const ghLabel = makeLabel('GITHUB · 365 days', '#3E2418', 80);
  ghLabel.position.set(0, 4.0, 0);
  ghLabel.scale.set(0.55, 0.55, 0.55);
  ghGroup.add(ghLabel);
  // Loading placeholder cubes (mock until fetch returns)
  const ghCubes = [];
  function buildGhCubes(weeks) {
    // Clear old cubes
    for (const c of ghCubes) ghGroup.remove(c);
    ghCubes.length = 0;
    const cubeSize = 0.18, gap = 0.04;
    const totalW = weeks.length * (cubeSize + gap);
    for (let w = 0; w < weeks.length; w++) {
      for (let d = 0; d < 7; d++) {
        const day = weeks[w][d];
        if (!day) continue;
        const count = day.contributionCount || 0;
        const h = 0.10 + Math.min(count, 30) * 0.12;
        // Color based on commit intensity (green scale like GitHub)
        const intensity = Math.min(1, count / 12);
        const color = new THREE.Color().setHSL(0.34, 0.85, 0.18 + intensity * 0.45);
        const mat = new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 0.4 + intensity * 0.6, roughness: 0.4,
        });
        const cube = new THREE.Mesh(new THREE.BoxGeometry(cubeSize, h, cubeSize), mat);
        cube.position.set(
          -totalW/2 + w * (cubeSize + gap) + cubeSize/2,
          0.5 + h/2,
          -3 * (cubeSize + gap) + d * (cubeSize + gap)
        );
        ghGroup.add(cube);
        ghCubes.push(cube);
      }
    }
  }
  // Mock placeholder data while real fetch is pending
  buildGhCubes(Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => ({ contributionCount: Math.floor(Math.random() * 6) }))
  ));
  // Fetch real data (free no-auth API). Falls back silently if blocked.
  fetch('https://github-contributions-api.deno.dev/Imranpasha30.json')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data || !data.contributions) return;
      // API shape: contributions = array of weeks, each week = array of {date, contributionCount, ...}
      buildGhCubes(data.contributions);
      console.log('[gh-graph] loaded', data.contributions.length, 'weeks of real GitHub data');
    })
    .catch((e) => console.warn('[gh-graph] using mock data:', e.message));
  // Info sign post
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 8), new THREE.MeshStandardMaterial({ color: 0x222 }));
  signPost.position.set(-30, 1.5, -25); scene.add(signPost);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x2a1a4a, emissive: COL.cyan, emissiveIntensity: 0.2 }));
  signBoard.position.set(-30, 3.3, -25); signBoard.castShadow = true; scene.add(signBoard);
  const signLab = makeLabel('hello !', '#ffffff', 100);
  signLab.position.set(-30, 3.3, -24.85); signLab.scale.set(0.45, 0.45, 0.45); scene.add(signLab);

  // ─ PROJECTS ZONE — 5 floating billboards
  const PROJECTS = [
    { name: 'MERN+GraphQL', url: 'https://github.com/Imranpasha30/MERN-GraphQL', color: 0xffb070 },
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
    { text: 'NEXT  N→', color: '#ffb070' },
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
    { name: 'GraphQL',  icon: '◆',  color: 0xffb070 },
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
  // Skills cluster relocated to (60, -10) — directly in front of the Server Room.
  // Reads as "engineering campus entrance" (urban architect plan).
  const SKILLS_X = 60, SKILLS_Z = -10;
  SKILLS.forEach((s, i) => {
    const ang = (i / SKILLS.length) * Math.PI * 2;
    const r = 5;
    const x = SKILLS_X + Math.cos(ang) * r;
    const z = SKILLS_Z + Math.sin(ang) * r;
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
  addZonePad(SKILLS_X, SKILLS_Z, COL.purple, 'SKILLS', 'skills', 7.5);

  // ─ CONTACT ZONE — giant mailbox in Mailroom cul-de-sac (south terminus)
  const mailboxX = 0, mailboxZ = -70;
  addZonePad(mailboxX, mailboxZ, COL.yellow, 'CONTACT', 'contact', 5);
  const mbBox = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: COL.pink, emissiveIntensity: 0.2, roughness: 0.4 }));
  mbBox.position.set(mailboxX, 2.5, mailboxZ); mbBox.castShadow = true; scene.add(mbBox);
  const mbTop = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3, 16, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: COL.pink, emissiveIntensity: 0.3 }));
  mbTop.rotation.z = Math.PI/2; mbTop.position.set(mailboxX, 3.7, mailboxZ); mbTop.castShadow = true; scene.add(mbTop);
  const mbPost = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x222 }));
  mbPost.position.set(mailboxX, 0.75, mailboxZ); scene.add(mbPost);
  const mbFlag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 0.4 }));
  mbFlag.position.set(mailboxX + 1.55, 3, mailboxZ + 1); scene.add(mbFlag);

  // ─ SOCIAL ZONE — 4 floating glowing icons (drive under to "open")
  const SOCIALS = [
    { name: 'GitHub',     url: 'https://github.com/Imranpasha30',                    brand: 0x24292e, color: 0xffffff },
    { name: 'LinkedIn',   url: 'https://www.linkedin.com/in/imran-pasha-/',          brand: 0x0a66c2, color: 0x0a66c2 },
    { name: 'Twitter',    url: 'https://twitter.com/',                                brand: 0x000000, color: 0xffffff },
    { name: 'HackTheBox', url: 'https://www.hackthebox.com/',                         brand: 0x9fef00, color: 0x9fef00 },
  ];

  // Procedural logo painter — draws the recognisable brand mark for each social into a CanvasTexture.
  function makeSocialLogo(name) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const c = cv.getContext('2d');
    if (name === 'GitHub') {
      // Black rounded square with simplified Octocat (head + ears + eye)
      c.fillStyle = '#24292e';
      roundRect(c, 8, 8, 240, 240, 38); c.fill();
      // Head circle
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(128, 130, 70, 0, Math.PI*2); c.fill();
      // Ears (triangles top-left + top-right)
      c.beginPath(); c.moveTo(78, 76); c.lineTo(96, 92); c.lineTo(74, 110); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(178, 76); c.lineTo(160, 92); c.lineTo(182, 110); c.closePath(); c.fill();
      // Eye
      c.fillStyle = '#24292e';
      c.beginPath(); c.arc(128, 128, 14, 0, Math.PI*2); c.fill();
      // Smile (small curve)
      c.strokeStyle = '#24292e'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.arc(128, 145, 22, 0.2, Math.PI - 0.2); c.stroke();
      // Tentacle (squiggle below)
      c.strokeStyle = '#ffffff'; c.lineWidth = 18; c.lineCap = 'round';
      c.beginPath(); c.moveTo(108, 198); c.quadraticCurveTo(128, 222, 148, 198); c.stroke();
    } else if (name === 'LinkedIn') {
      // LinkedIn blue with bold white "in"
      c.fillStyle = '#0a66c2';
      roundRect(c, 8, 8, 240, 240, 38); c.fill();
      c.fillStyle = '#ffffff';
      c.font = 'bold 170px "Helvetica", Arial, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('in', 128, 148);
    } else if (name === 'Twitter') {
      // X (rebrand) — black square with white X mark
      c.fillStyle = '#000000';
      roundRect(c, 8, 8, 240, 240, 38); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 38; c.lineCap = 'round';
      c.beginPath(); c.moveTo(72, 72); c.lineTo(184, 184); c.stroke();
      c.beginPath(); c.moveTo(184, 72); c.lineTo(72, 184); c.stroke();
    } else if (name === 'HackTheBox') {
      // HTB green hexagonal mark on black
      c.fillStyle = '#0e1a0e';
      roundRect(c, 8, 8, 240, 240, 38); c.fill();
      // Hexagon
      c.strokeStyle = '#9fef00'; c.lineWidth = 12; c.lineJoin = 'round';
      c.beginPath();
      const hex = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI/3 * i - Math.PI/2;
        hex.push([128 + 80 * Math.cos(a), 128 + 80 * Math.sin(a)]);
      }
      c.moveTo(hex[0][0], hex[0][1]);
      for (let i = 1; i < 6; i++) c.lineTo(hex[i][0], hex[i][1]);
      c.closePath(); c.stroke();
      // Inner ::HTB:: text style — bracket marks
      c.fillStyle = '#9fef00';
      c.font = 'bold 64px "JetBrains Mono", monospace';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('HTB', 128, 130);
      c.font = 'bold 24px "JetBrains Mono", monospace';
      c.fillText('::    ::', 128, 170);
    }
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  SOCIALS.forEach((s, i) => {
    const x = -30 + i * 20;
    const z = 60;
    // Glowing torus frame in brand color
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.22, 16, 32),
      new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.85, roughness: 0.3 })
    );
    torus.position.set(x, 4, z); torus.castShadow = true; scene.add(torus);

    // Logo disc inside the torus — the actual brand mark
    const logoTex = makeSocialLogo(s.name);
    const logoMat = new THREE.MeshStandardMaterial({
      map: logoTex,
      emissive: 0x222222, emissiveIntensity: 0.4,
      roughness: 0.5, metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const logoDisc = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), logoMat);
    logoDisc.position.set(x, 4, z + 0.05);
    scene.add(logoDisc);
    // Backside copy so it reads from both directions
    const logoBack = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), logoMat);
    logoBack.position.set(x, 4, z - 0.05);
    logoBack.rotation.y = Math.PI;
    scene.add(logoBack);

    // Brand name caption below
    const nameLab = makeLabel(s.name, '#3E2418', 80);
    nameLab.position.set(x, 1.6, z); nameLab.scale.set(0.5, 0.5, 0.5); scene.add(nameLab);

    // Glowing ground pad
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 0.14, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1432, emissive: s.color, emissiveIntensity: 0.25 })
    );
    pad.position.set(x, 0.05, z); scene.add(pad);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 2.7, 48),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = -Math.PI/2; ring.position.set(x, 0.07, z); scene.add(ring);

    zones.push({ x, z, radius: 2.6, key: 'social_' + i, social: s, ring, label: s.name, lab: nameLab, torus });
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
    new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xffb070, emissiveIntensity: 0.4, roughness: 0.4 })
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
    new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xffb070, emissiveIntensity: 0.25 })
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
  // Skip labels marked userData.noBillboard = true (e.g. welcome arch keystone — stays painted on the wood)
  scene.traverse(o => {
    if (o.material && o.material.map && o.geometry && o.geometry.type === 'PlaneGeometry'
        && !(o.userData && o.userData.noBillboard)) {
      billboardLabels.push(o);
    }
  });

  // ─────────────── CAMERA ───────────────
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  // ─── CINEMATIC INTRO — single smooth fly-over passing through landmarks ───
  // Like the original sweep, but the path now curves through a series of waypoints
  // so you GLIMPSE each landmark as you fly past. Catmull-Rom spline = continuous,
  // never cuts. Camera + look-at both interpolate along their own splines.
  // 30-second cinematic — high overview → zoom in → airport → balloon → harbour → city overview → settle
  const CINEMATIC_DURATION = 30.0;
  const CINE_CAM_PATH = new THREE.CatmullRomCurve3([
    new THREE.Vector3(   0, 250,  220),   //  0. very high overview — whole world visible
    new THREE.Vector3( -30, 180,  130),   //  1. zoom-in / start descending
    new THREE.Vector3( -70, 110,   30),   //  2. continue down toward airport
    new THREE.Vector3(-110,  60,  -50),   //  3. drop into airport airspace
    new THREE.Vector3(-130,  35, -110),   //  4. low pass alongside runway
    new THREE.Vector3( -60,  40, -130),   //  5. swing east from airport
    new THREE.Vector3(  20,  45, -130),   //  6. heading toward balloon station
    new THREE.Vector3(  50,  40,  -90),   //  7. arrive at balloon station, view from above
    new THREE.Vector3(  90,  45,  -50),   //  8. depart balloon, climb toward harbour
    new THREE.Vector3( 130,  50,   30),   //  9. approaching harbour
    new THREE.Vector3( 140,  40,  100),   // 10. above harbour ships + lighthouse
    new THREE.Vector3(  90,  60,  120),   // 11. pull up for city overview
    new THREE.Vector3(  30,  80,   90),   // 12. high city overview swing
    new THREE.Vector3( -20,  60,   50),   // 13. descend over city center
    new THREE.Vector3(  10,  25,   30),   // 14. approach welcome plaza
    new THREE.Vector3(   0,   8,   18),   // 15. settle into chase spot at spawn
  ], false, 'catmullrom', 0.5);
  const CINE_LOOK_PATH = new THREE.CatmullRomCurve3([
    new THREE.Vector3(   0,  0,    0),    //  0. center of world from way up
    new THREE.Vector3( -30,  0,    0),    //  1. drift slightly west
    new THREE.Vector3( -90,  5,  -50),    //  2. airport area
    new THREE.Vector3(-110,  3, -110),    //  3. airport runway
    new THREE.Vector3(-110,  8, -132),    //  4. terminal
    new THREE.Vector3(   0,  5, -110),    //  5. east toward balloon station
    new THREE.Vector3(  50,  8, -110),    //  6. balloon station pad
    new THREE.Vector3(  50, 30, -110),    //  7. balloons rising from station
    new THREE.Vector3(  90,  4,  -65),    //  8. lake
    new THREE.Vector3( 130,  1,  120),    //  9. harbour ships
    new THREE.Vector3( 145, 12,   92),    // 10. lighthouse
    new THREE.Vector3(  40, 11,   30),    // 11. cable car station (city overview anchor)
    new THREE.Vector3(   0,  3,    0),    // 12. plaza (city overview)
    new THREE.Vector3( -50,  3,   30),    // 13. HTB skull (gateway visible)
    new THREE.Vector3(   0,  9,   12),    // 14. welcome arch
    new THREE.Vector3(   0,  1.5,   0),   // 15. spawn / car
  ], false, 'catmullrom', 0.5);
  let cinematicActive = false;
  let cinematicT = 0;
  function startCinematic() {
    cinematicActive = true;
    cinematicT = 0;
    window.dispatchEvent(new Event('imran:cinematic:start'));
  }
  function easeInOut(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function updateCamera(dt, isStarted) {
    if (cinematicActive) {
      cinematicT += dt;
      const u = Math.min(1, cinematicT / CINEMATIC_DURATION);
      const e = easeInOut(u);
      // Sample both splines at the same eased t — gives a smooth, cinematic sweep
      const camPos2 = CINE_CAM_PATH.getPoint(e);
      const lookPos = CINE_LOOK_PATH.getPoint(e);
      camera.position.copy(camPos2);
      camera.lookAt(lookPos);
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
    // ─── Walking-mode camera (chase the man) ───
    if (playerMode === 'walk') {
      const m = manGroup.position;
      const t = clock.getElapsedTime();
      // Follow at fixed angle behind, allow mouse orbit
      const dist = 7 + orbit.zoom;
      const camYawW = walkYaw + orbit.yawOff;
      camTarget.set(m.x, m.y + 1.4, m.z);
      camPos.set(
        m.x + Math.sin(camYawW) * dist,
        m.y + 4,
        m.z + Math.cos(camYawW) * dist
      );
      camera.position.lerp(camPos, 0.18);
      camera.lookAt(camTarget);
      return;
    }
    // ─── Cable-car ride POV — sit inside the gondola, look out the "window" toward town & mountains ───
    if (playerMode === 'cable_ride' && rideTarget) {
      const r = rideTarget.position;
      const t = clock.getElapsedTime();
      // Camera is inside the gondola at "passenger eye level" (roughly basket-floor height)
      camPos.set(r.x, r.y + 1.2, r.z);
      // Cycle through scenic look-at targets so the player feels the gondola is rotating to take in the view.
      // Each target is held for a few seconds, then blended into the next.
      const lookTargets = [
        new THREE.Vector3(   0,   5,    0),    // welcome plaza (city center)
        new THREE.Vector3(  85,  30,   65),    // observation tower
        new THREE.Vector3( 110,   5,  110),    // harbour
        new THREE.Vector3( 200,  60,   50),    // mountain peak east
        new THREE.Vector3( -50,   3,   30),    // HTB skull
        new THREE.Vector3(-130,  60,   80),    // mountain peak NW
        new THREE.Vector3( -110,   5, -110),   // airport in distance
        new THREE.Vector3( 180,  70, -150),    // mountain peak SE (distant)
      ];
      // Slow blend through the targets — each target ~5 sec
      const cycleT = (t * 0.2) % lookTargets.length;
      const i0 = Math.floor(cycleT);
      const i1 = (i0 + 1) % lookTargets.length;
      const blend = cycleT - i0;
      const smooth = blend * blend * (3 - 2 * blend);    // smoothstep
      const target = lookTargets[i0].clone().lerp(lookTargets[i1], smooth);
      camera.position.copy(camPos);
      camera.lookAt(target);
      return;
    }
    // ─── Hot-air-balloon ride POV — inside the basket, looks out & slightly down at the world ───
    if (playerMode === 'balloon_ride' && rideTarget) {
      const r = rideTarget.position;
      const t = clock.getElapsedTime();
      // Camera sits at basket rim height (basket center is at +1.5 of balloon group)
      camPos.set(r.x, r.y + 1.8, r.z);
      // Slow horizontal pan so the player feels the balloon is rotating
      const panAng = t * 0.12;
      // Look outward AND slightly down — the magic of a balloon view is seeing the world below
      const dist = 40;
      const dropY = -25;     // 25m below current altitude
      camTarget.set(
        r.x + Math.cos(panAng) * dist,
        r.y + dropY,
        r.z + Math.sin(panAng) * dist
      );
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
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
        if (playerMode === 'walk') {
          // Walking — bypass car physics, integrate man position directly
          drv = walkStep(dt);
        } else if (playerMode === 'cable_ride' || playerMode === 'balloon_ride') {
          // Riding — no input, just animation
          drv = { speed: 0, throttle: 0 };
        } else if (flyMode) {
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

      // ─── Visitor Tower animation (crystal rotation, light pulse, +1 fade, ticker scroll) ───
      if (window.__imranTowerAnim) {
        const ta = window.__imranTowerAnim;
        ta.crystal.rotation.y = t * 0.6;
        ta.crystal.rotation.x = Math.sin(t * 0.4) * 0.1;
        ta.crystal.position.y = 9.5 + Math.sin(t * 1.2) * 0.15;
        ta.light.intensity = 1.4 + Math.sin(t * 2) * 0.3;
        // +1 floating animation fade
        if (ta.state.plusOneT > 0) {
          ta.state.plusOneT -= dt * 0.6;
          if (ta.state.plusOneT < 0) ta.state.plusOneT = 0;
          ta.draw();
        }
        // Scroll the guestbook ticker continuously (~20 px/sec) — redraw at ~8fps for perf
        tickerScroll = (tickerScroll || 0) + dt * 20;
        if (!ta._lastDraw || t - ta._lastDraw > 0.12) {
          ta._lastDraw = t;
          ta.drawTicker();
        }
      }

      // ─── Switzerland animations (cable car, rally checkpoints, cowbell) ───
      if (window.__imranSwiss) {
        const sw = window.__imranSwiss;
        // Cable car ping-pong every 60 sec end-to-end
        cableT += dt * cableDirSign / 60;
        if (cableT >= 1) { cableT = 1; cableDirSign = -1; }
        if (cableT <= 0) { cableT = 0; cableDirSign = 1; }
        const gondolaPos = sw.cableStart.clone().lerp(sw.cableEnd, cableT);
        sw.gondola.position.copy(gondolaPos);

        // Rally checkpoint pickup detection
        const cp = carGroup.position;
        for (const r of sw.rallyCheckpoints) {
          if (r.collected) continue;
          const d = Math.hypot(cp.x - r.x, cp.z - r.z);
          if (d < 2.5) {
            r.collected = true;
            scene.remove(r.ring); scene.remove(r.beam);
            sw.incrementRally();
            const got = sw.rallyCount();
            if (window.__imranToast) window.__imranToast(`🚩 RALLY CHECKPOINT ${got}/5`);
            if (got === 5 && window.__imranToast) {
              setTimeout(() => window.__imranToast('🏆 BACKROAD CHAMPION — all 5 rally checkpoints!'), 800);
            }
          } else {
            r.ring.rotation.z = t * 1.5;
            r.beam.material.opacity = 0.12 + Math.sin(t * 3) * 0.08;
          }
        }

        // Cowbell ambient — distant ding when near mountains
        if (window.__imranCowbellTick) window.__imranCowbellTick(performance.now());
      }

      // Wildflower gentle sway (subtle vertical bob)
      if (typeof wildflowers !== 'undefined') {
        wildflowers.position.y = Math.sin(t * 0.7) * 0.05;
      }

      // ─── Airport + Harbour animations (planes loop takeoff/land, ships orbit harbour) ───
      if (window.__imranAirport) window.__imranAirport.tick(dt);
      if (window.__imranHarbour) window.__imranHarbour.tick(dt);
      if (window.__imranBalloons) window.__imranBalloons.tick(dt);
      if (window.__imranFisher) window.__imranFisher.tick(t);

      // ─── Backend Zone animations (microservice pulses, pipeline token, container health) ───
      if (window.__imranBackend) {
        const be = window.__imranBackend;
        // Microservice blink + emissive pulse at each service's rate
        for (const m of be.msPulses) {
          const beat = (Math.sin(t * m.pulseRate * Math.PI * 2) + 1) / 2;
          m.blink.material.emissiveIntensity = 0.3 + beat * 1.6;
          m.mat.emissiveIntensity = m.baseEmissive + beat * 0.3;
        }
        // Pipeline token slides commit→deploy over 6 sec, then loops
        be.pipeT = (be.pipeT + dt / 6) % 1;
        const tokenX = -8 + be.pipeT * 12;       // -8 → +4 across the 4 stages
        be.pipeToken.position.x = tokenX;
        be.pipeToken.position.y = 0.95 + Math.sin(t * 6) * 0.08;
        // Container Orchestra — gentle health pulse (all green for now)
        for (const c of be.containerBoxes) {
          c.box.material.emissiveIntensity = 0.4 + Math.sin(t * 1.5 + c.name.length) * 0.25;
        }
      }

      // ─── PROXIMITY PROMPTS — flyover (M), cable-car (T), and re-enter car (E) ───
      if (window.__imranToast) {
        const px = (playerMode === 'walk') ? manGroup.position.x : carGroup.position.x;
        const pz = (playerMode === 'walk') ? manGroup.position.z : carGroup.position.z;
        // Flyover proximity (centered at x=50, z=0) → suggest M for walking
        const distFly = Math.hypot(px - 50, pz);
        if (distFly < 25 && playerMode === 'car' && (t - (window.__lastFlyHint || 0) > 15)) {
          window.__imranToast('🚶 press <kbd>M</kbd> to get out and walk');
          window.__lastFlyHint = t;
        }
        // Cable car deck proximity (40, 30) → suggest T for ride
        const distCable = Math.hypot(px - 40, pz - 30);
        if (distCable < 14 && playerMode !== 'cable_ride' && (t - (window.__lastCableHint || 0) > 15)) {
          window.__imranToast('🚠 press <kbd>T</kbd> to ride the cable car');
          window.__lastCableHint = t;
        }
        // Walking near the car → suggest E to enter
        if (playerMode === 'walk') {
          const distCar = Math.hypot(
            manGroup.position.x - carGroup.position.x,
            manGroup.position.z - carGroup.position.z);
          if (distCar < 5 && (t - (window.__lastEnterHint || 0) > 8)) {
            window.__imranToast('🚗 press <kbd>E</kbd> to get in the car');
            window.__lastEnterHint = t;
          }
        }
      }

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

      // ─── HOT AIR BALLOON DRIFT ───
      balloonGroup.position.x += 0.3 * dt;
      balloonGroup.position.y = 35 + Math.sin(t * 0.4) * 0.8;
      if (balloonGroup.position.x > 100) balloonGroup.position.x = -100;
      balloonLight.position.copy(balloonGroup.position);

      // ─── BIRDS V-FORMATION ───
      birdsTimer -= dt;
      if (!birdsGroup.visible && birdsTimer <= 0) {
        birdsGroup.visible = true;
        birdsProgress = 0;
        birdsGroup.position.set(-150, 30 + Math.random() * 20, -50 + Math.random() * 100);
      }
      if (birdsGroup.visible) {
        birdsProgress += dt;
        birdsGroup.position.x += 8 * dt;
        // Wing flap (rotate cones slightly)
        const flap = Math.sin(t * 12);
        for (const b of birds) {
          b.mesh.position.set(b.ox, flap * 0.05, b.oz);
        }
        if (birdsGroup.position.x > 150) {
          birdsGroup.visible = false;
          birdsTimer = 50 + Math.random() * 60;
        }
      }

      // ─── PET DOG (follow car when close, otherwise wander in park) ───
      const carDistDog = Math.hypot(carGroup.position.x - dogGroup.position.x, carGroup.position.z - dogGroup.position.z);
      if (carDistDog < 18 && carDistDog > 4) {
        dogState = 'follow';
        dogTarget.x = carGroup.position.x - Math.sin(yaw) * 3;
        dogTarget.z = carGroup.position.z - Math.cos(yaw) * 3;
      } else if (dogState === 'follow' && carDistDog > 22) {
        dogState = 'wander';
        dogTarget.x = -58 + (Math.random() - 0.5) * 10;
        dogTarget.z = -50 + (Math.random() - 0.5) * 10;
      }
      const ddx = dogTarget.x - dogGroup.position.x;
      const ddz = dogTarget.z - dogGroup.position.z;
      const ddist = Math.hypot(ddx, ddz);
      if (ddist > 0.4) {
        const dogSpd = dogState === 'follow' ? 5 : 1.5;
        dogGroup.position.x += ddx / ddist * dogSpd * dt;
        dogGroup.position.z += ddz / ddist * dogSpd * dt;
        dogGroup.rotation.y = Math.atan2(ddx, ddz);
        dogTail.rotation.y = Math.sin(t * 12) * 0.4;     // tail wag
      } else if (dogState === 'wander') {
        dogTarget.x = -58 + (Math.random() - 0.5) * 14;
        dogTarget.z = -50 + (Math.random() - 0.5) * 14;
      }

      // ─── BUNKER EASTER EGG (hold E for 3 sec at trigger) ───
      const bd = Math.hypot(carGroup.position.x - BUNKER_TRIGGER.x, carGroup.position.z - BUNKER_TRIGGER.z);
      if (bd < BUNKER_TRIGGER.radius && (keys.f === false) /* idle */ && (typeof window.__imranEHeld !== 'undefined' && window.__imranEHeld)) {
        bunkerProgress += dt;
        if (bunkerProgress >= 3 && !bunkerActive) {
          bunkerActive = true;
          stats.foundBunker = true;
          // Teleport camera into the bunker (move car too so the camera follows naturally)
          window.imranWorld.teleport(-50, 30);
          chassis.position.y = -7.5;
          if (window.__imranToast) window.__imranToast('🥚 SECRET BUNKER UNLOCKED');
        }
      } else {
        bunkerProgress = Math.max(0, bunkerProgress - dt * 0.5);
      }
      // CRT scroll (always animating)
      crtScroll += dt * 1.2;
      if (Math.floor(crtScroll * 10) % 5 === 0) drawCrt();

      // ─── NITRO BOOST EFFECT ON CAR SPEED ───
      if (nitroActive) {
        nitroTimer -= dt;
        // Goose the car speed during nitro
        const fwd = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
        chassis.velocity.x += fwd.x * 30 * dt;
        chassis.velocity.z += fwd.z * 30 * dt;
        // Allow higher top speed during nitro
        const sp = Math.hypot(chassis.velocity.x, chassis.velocity.z);
        const NITRO_MAX = 35;
        if (sp > NITRO_MAX) {
          chassis.velocity.x *= NITRO_MAX / sp;
          chassis.velocity.z *= NITRO_MAX / sp;
        }
        if (nitroTimer <= 0) nitroActive = false;
      }

      // ─── ACHIEVEMENT STAT TRACKING ───
      const carV = Math.hypot(chassis.velocity.x, chassis.velocity.z);
      stats.distance += carV * dt;
      if (carV > stats.topSpeed) stats.topSpeed = carV;
      stats.coins = (typeof coinsCollected !== 'undefined') ? coinsCollected : 0;
      // Track zone visits
      if (activeZone && activeZone.key) stats.zonesVisited.add(activeZone.key);
      // Track flight
      if (flyMode) stats.flewOnce = true;
      // Track drift score (drift smoke condition is the same: speed>8 + steerInput>0.6)
      const steerNow = (keys.l ? 1 : 0) - (keys.r ? 1 : 0) - touch.x;
      if (carV > 8 && Math.abs(steerNow) > 0.6 && !flyMode) {
        driftDuration += dt;
        stats.driftTime = Math.max(stats.driftTime, driftDuration);
        driftScore += dt * 50 * (carV / 22);
      } else {
        if (driftDuration > 0.7 && driftScore > 50) {
          totalDriftScore += Math.floor(driftScore);
          if (window.__imranToast) window.__imranToast(`🌀 +${Math.floor(driftScore)} DRIFT (${totalDriftScore} total)`);
        }
        driftDuration = 0;
        driftScore = 0;
      }
      // Time trial: end when all 5 main zones visited
      if (trialActive && stats.zonesVisited.size >= 5) endTrial();
      // Run achievement check ~once per second
      if (Math.floor(t) !== Math.floor(t - dt)) checkAchievements();

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
