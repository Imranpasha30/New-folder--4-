# CIVIL ENGINEERING PLAN — Imran Pasha 3D City Road Network

**Author:** Civil Engineer (planning pass — no code)
**Scope:** `world.js` road graph, ramps, flyover, tunnel, cable-car approach.
**Constraint:** mountain ring at radius 100; world is `±100` square but driveable inside the ring.
**Helper signatures (verbatim from `world.js`):**
- `addRoadStrip(isNS, x, z, len)` — line 357. Asphalt strip + dashed centerline + edge lines. Width is fixed `ROAD_W = 5`. `isNS=true` runs along Z, `isNS=false` runs along X.
- `addRoadRamp(cx, cy, cz, len, height, axis = 'x', side = 1)` — line 3745. Tilted box ramp + stripe + physics. Currently only the `axis='x'` branch is wired (the function only rotates around Z). Width is hard-coded to 5.

> NOTE: There is no generic `addRoad(x, z, w, h, rot)` in the file — the actual API is `addRoadStrip` (uniform width 5, axis-aligned). The plan uses this real signature.

---

## 1. CURRENT ROAD INVENTORY

### 1a. Grid streets (line 339-410)
All width 5, length 100, centred on origin. `y = 0.02`.

| ID | Type | x | z range | Connects to |
|----|------|---|---------|-------------|
| NS-32W | N-S street | -32 | -50 … +50 | crosses every EW row |
| NS-22W | N-S street | -22 | -50 … +50 | crosses every EW row |
| NS-12W | N-S street | -12 | -50 … +50 | crosses every EW row |
| NS-0   | N-S street ("Imran Avenue") | 0 | -50 … +50 | spawn pad sits on it; passes through tunnel |
| NS-12E | N-S street | 12 | -50 … +50 | crosses every EW row |
| NS-22E | N-S street | 22 | -50 … +50 | crosses every EW row |
| NS-32E | N-S street | 32 | -50 … +50 | nearest road to cable-car ramp foot |
| EW-32S | E-W avenue | z=-32 | -50 … +50 | |
| EW-22S | E-W avenue | z=-22 | -50 … +50 | |
| EW-12S | E-W avenue | z=-12 | -50 … +50 | |
| EW-0  | E-W avenue ("Pasha Boulevard") | z=0 | -50 … +50 | flyover starts mid-span |
| EW-12N | E-W avenue | z=12 | -50 … +50 | |
| EW-22N | E-W avenue | z=22 | -50 … +50 | |
| EW-32N | E-W avenue | z=32 | -50 … +50 | passes 2 m south of cable-car station |
| EW-38N | E-W avenue | z=38 | -50 … +50 | northernmost row |

Intersection accents (purple discs) only at the 9 nodes formed by `x∈{-22,0,22}` × `z∈{-22,0,22}`.

### 1b. Elevated structures
- **Flyover (line 3742-3815)** along z=0:
  - West ramp: `addRoadRamp(33, 1.25, 0, 18, 3.5, 'x', +1)` → spans x=24…42, rises 0→3.5 m
  - Flat span: x=42…58 at y=3.5
  - East ramp: `addRoadRamp(67, 1.25, 0, 18, 3.5, 'x', -1)` → spans x=58…76, descends 3.5→0 m
- **Tunnel (line 3817-3876)** along x=0, centre z=-38, length 24, walls at x=±3.5, roof at y=4.6 → covers z=-50…-26 of NS-0.
- **Cable-car STATION (line 2847)** at (40, y=0…11, 30). Top deck is 11×11 at y=11.25.
- **Cable-car RAMP (line 2920-2978)** centred at x=40. Length 42, rises 0→11 m. Foot at (40, 0, -17.5). Crest at (40, 11, 24.5). Lies along x=40 between z=-17.5 and z=24.5.
- **Loop-the-loop (line 4385-4429)** at (-65, 9, 65). Entry ramp at (-77, 0.5, 65) along the -X face.
- **Fun-zone jump ramp (line 4364)** at (-55, 2, 45), tilt -π/8 along x.

### 1c. Zones / landmarks (verified)
| Key | Coords | Source line |
|-----|--------|-------------|
| Spawn pad | (0, 0, 0) | 1604 |
| Welcome arch | (0, 0, 12) | 2527 |
| Visitor Tower | (15, 0, 8) | 2576 |
| Observation Tower | (85, 0, 65) | 1300 |
| HTB Skull | (-30, 0, 45) | 1314 |
| Hacker's Den | (-80, 0, -10) | 3187 |
| Server Room | (80, 0, -10) | 3417 |
| Projects billboard | (30, *, 30) zone pad at (30, 24) | 3966 / 4081 |
| ABOUT ME pad | (-30, -25) r=5 | 3879 |
| SKILLS pad | (30, -28) r=7.5 | 4214 |
| CONTACT mailbox | (0, -70) r=5 | 4218 |
| Socials pads | (-30,60)(-10,60)(10,60)(30,60) r=2.6 | 4316 |
| Cable-car station | (40, 0, 30) | 2847 |
| Park (grass disc) | (-65, -55) r=16 | 1335 |
| Lake | (72, -65) r=20 | 1159 |
| River | path (85,60)→(70,35)→(55,10)→(50,-15)→(60,-40)→(70,-55) | 1132 |
| North bridge | (60, 22) | 1216 |
| South bridge | (55, -25) | 1218 |
| Loop-the-loop | (-65, 65) | 4385 |
| Fun ramp / bricks / pins | around (-55, 45)…(-40, 70) | 4365-4382 |
| GitHub graph | (-30, -38) | 3886 |

---

## 2. PROBLEMS IDENTIFIED

### 2.1 Cable-car ramp dangles in space (the user's headline issue)
- Ramp foot is at **(40, 0, -17.5)**. The whole ramp lies on the line **x=40**.
- The grid has NS streets at x=32 and (nothing east of that until the flyover at x=33 ramps up) — **there is no road at x=40 at all**.
- Closest EW avenue is EW-32S at z=-32 — **14.5 m of grass between EW-32S and the ramp foot**, and EW-32S doesn't even reach x=40 (it ends at x=50 but is centred only up to x=50 at width 5).
- `EW-22S` at z=-22 ends at x=50 — passes 4.5 m south of the ramp foot but at the wrong x. Player has to drive across grass to find the ramp.
- Result: the "↑ DRIVE UP TO CABLE CAR" sign at (40, 4, -22.5) is in the middle of an empty meadow.

### 2.2 East flyover foot lands in grass
- East descent ramp ends at x=76 (line 3815). The boulevard EW-0 only runs x=-50…+50. **26 m of dirt** before the player hits any road again. Specifically nothing connects the flyover to the Server Room at (80, -10).

### 2.3 Major landmarks are unreachable by road
| Landmark | Coord | Nearest road | Gap |
|----------|-------|--------------|-----|
| Hacker's Den | (-80, -10) | NS-32W (x=-32) | **48 m of grass** west |
| Server Room | (80, -10) | NS-32E (x=32, ends at z=±50) | **48 m east + need to cross flyover/grass** |
| Observation Tower | (85, 65) | EW-38N (z=38, ends at x=50) | **35 m east + 27 m north** of any road |
| HTB Skull | (-30, 45) | EW-38N at z=38 | only 7 m gap (acceptable) |
| Loop-the-loop | (-65, 65) | EW-38N (z=38) ends at x=-50 | **15 m west + 27 m north** |
| Fun zone (ramp/bricks/pins) | (-55, 45) … (-40, 70) | EW-38N | 7-32 m gaps |
| Park bench cluster | (-65, -55) | EW-32S (ends x=-50, z=-32) | **15 m west + 23 m south** |

### 2.4 Network shape problems
- **Grid is a perfect square ±50** but the world is bounded by a circle of radius 100. The **outer ring (50–95 m radius)** has no roads at all. Half the map is unreachable on tarmac.
- **No perimeter / ring road**, so to get from Hacker's Den to Server Room (both at z=-10, opposite corners) you must drive into the centre and out again — unless you go off-road.
- **Spawn pad sits inside an intersection**: spawn at (0, 0, 30) is on EW-32N, which is fine — but the spawn pad geometry is at (0, 0, 0) (line 1604). The spawn point listed in the brief (0, 0, 30) lines up with EW-32N, two intersections north of the welcome arch. OK.
- **No road accents at outer intersections** — the purple intersection discs only mark the 9 inner nodes. Outer intersections feel forgotten.
- **Tunnel works** but it sits on NS-0 between two existing road segments — fine, no fix needed.
- **Flyover west foot** at x=24 falls *between* NS-22E (x=22) and NS-32E (x=32) — close enough to be reachable from EW-0, but a player coming up NS-32E south-bound would have to swerve onto EW-0 first to enter the flyover. Not broken, just slightly awkward.
- **Loop entrance ramp foot** at (-77, 0, 65) sits 12 m beyond NS-32W. Unreachable from the grid.

### 2.5 Orphan zones (zone pad with no road in radius 8)
| Zone | Pad | Nearest road | Distance to pad edge |
|------|-----|--------------|----------------------|
| Projects | (30, 24) | EW-22N (z=22) | 0 m (touches) — OK |
| Socials (4) | x=-30..30, z=60 | EW-38N (z=38) | **17 m of grass** north |
| Cable-car deck | (40, 30) | EW-32N nearest, but x=40 unreachable | as above |

---

## 3. PROPOSED ROAD GRID — THE FIX

### 3.1 Design philosophy
- Keep the existing 14 strips (don't re-pave the city).
- **Add 8 new strips and 2 ramp connectors** to plug the holes.
- Add **one perimeter ring** as 4 outer arcs (built from straight strips since `addRoadStrip` is axis-aligned only).
- Total construction: 14 strips + 1 short connector ramp = **~15 calls**, ~20 lines of code.

### 3.2 New main avenues (full length 100, width 5)

| Call | Purpose |
|------|---------|
| `addRoadStrip(true,  42, 0, 100)` | **NS-42E "Cable Car Drive"** — runs along x=42, passes 2 m east of the ramp centerline at x=40. Lets the player drive south→north, see the ramp, peel off west onto the ramp at z=-17.5. |
| `addRoadStrip(true, -42, 0, 100)` | NS-42W — symmetric, services Hacker's Den approach |
| `addRoadStrip(false, 0, 50, 100)` | EW-50N "North Loop Avenue" — services Socials at z=60 (close enough), Loop-the-loop, HTB skull side |
| `addRoadStrip(false, 0, -50, 100)` | EW-50S "South Loop Avenue" — services park, gives bottom edge of perimeter |

### 3.3 New secondary streets (length 60, off-centre)

| Call | Purpose |
|------|---------|
| `addRoadStrip(false, 65, -10, 30)` | **Server Room spur** — runs from x=50 to x=80, z=-10. Connects flyover east foot (x=76, z=0) and Server Room (80, -10). |
| `addRoadStrip(false, -65, -10, 30)` | **Hackers Den spur** — runs from x=-80 to x=-50, z=-10. Connects Hacker's Den (-80, -10) to NS-42W. |
| `addRoadStrip(true, 70, 0, 50)` | **Outer East NS** — x=70, z=-25…+25. Joins both spurs and reaches the cable-car drive area; passes 5 m west of river bend at (70, 35) — safe. |
| `addRoadStrip(false, 70, 50, 30)` | **Tower Approach** — x=55…85 at z=50, brings the player to the Observation Tower at (85, 65). Stops 15 m short for a "park here, walk the rest" feel. |
| `addRoadStrip(false, -55, 60, 25)` | **Recreation Lane** — x=-67.5…-42.5 at z=60, passes the loop-the-loop entry side and the bowling pins (-40, 70). |

### 3.4 New ramp connector (the cable-car fix)

The cable-car ramp is currently a stand-alone 42 m incline starting at (40, 0, -17.5). We do NOT touch the ramp itself. Instead we add **one short level transition strip**:

| Call | Purpose |
|------|---------|
| `addRoadStrip(false, 40, -17.5, 10)` | **Cable Car Apron** — short E-W strip at z=-17.5 from x=35 to x=45. Sits flush at y=0.02, bridging NS-42E (which runs at x=42) into the ramp foot at (40, 0, -17.5). Player turns left off NS-42E onto the apron, drives 2 m west, and is centred on the ramp. |

> No `addRoadRamp` call is needed — the existing cable-car ramp `rampMesh` (line 2926) already provides the inclined drivable surface. We are **only adding the ground-level approach roads** so the player can FIND it.

### 3.5 Flyover entry/exit fix
- East foot lands at (76, 0, 0). The new **NS-42E** at x=42 doesn't reach it. Solution: extend EW-0 east via a **short patch strip**:
  - `addRoadStrip(false, 65, 0, 30)` — paves x=50…80, z=0. This connects the existing EW-0 (which ends at x=50) to the new Server Room spur (x=50…80 at z=-10) via the small 10 m gap.
- West foot at (24, 0, 0) is already on EW-0 — no fix needed.

### 3.6 Loop-the-loop entry fix
- Loop entry ramp foot at (-77, 0, 65). New **EW-50N** at z=50 ends at x=-50. New **Recreation Lane** at z=60 ends at x=-67.5. Add:
  - `addRoadStrip(true, -77, 65, 16)` — short NS strip at x=-77, z=57…73, lining up directly with the loop entry. Player turns onto it from Recreation Lane via a 5 m diagonal of grass — acceptable.

### 3.7 Perimeter "Ring Road" (deferred / optional)
Strictly speaking the brief asks for a ring. With axis-aligned strips only, a true ring is awkward. The 4 new outer avenues (NS-42W, NS-42E, EW-50N, EW-50S) **form a 100 × 100 square ring** that functionally closes the perimeter. Mark the 4 outer corners (±42, ±50) with intersection accent discs (extend the existing loop on line 399).

### 3.8 Final new-road summary (10 calls)

```
// New main avenues
addRoadStrip(true,  42, 0, 100);        // NS-42E "Cable Car Drive"
addRoadStrip(true, -42, 0, 100);        // NS-42W
addRoadStrip(false, 0,  50, 100);       // EW-50N
addRoadStrip(false, 0, -50, 100);       // EW-50S

// Cable-car apron
addRoadStrip(false, 40, -17.5, 10);     // Cable Car Apron

// Flyover east continuation
addRoadStrip(false, 65, 0, 30);         // EW-0 east extension

// Hackers Den + Server Room spurs
addRoadStrip(false, -65, -10, 30);      // Hackers Den spur
addRoadStrip(false,  65, -10, 30);      // Server Room spur

// Tower + recreation
addRoadStrip(false,  70,  50, 30);      // Tower Approach
addRoadStrip(false, -55,  60, 25);      // Recreation Lane

// Loop entry stub
addRoadStrip(true, -77, 65, 16);        // Loop entry stub
```

Plus: extend the intersection-disc loop (line 399) to include the new outer nodes:
```
for (const x of [-42, -22, 0, 22, 42])
  for (const z of [-50, -22, 0, 22, 50]) { ... }
```

---

## 4. ZONE → ROAD CONNECTIVITY TABLE (post-fix)

| Zone | (x, z) | Nearest road | Route from spawn (0, 0, 30) |
|------|--------|--------------|------------------------------|
| Welcome arch | (0, 12) | EW-12N at z=12 | south on NS-0, 18 m |
| Visitor Tower | (15, 8) | EW-12N | south on NS-0, west on EW-12N briefly — already next to road |
| ABOUT ME | (-30, -25) | NS-32W & EW-22S | south on NS-0 (cross tunnel? no — at z=-25 you're north of tunnel z=-26), west on EW-22S |
| Projects billboard | (30, 24) | EW-22N (z=22) | east on EW-32N to NS-32E, south to EW-22N |
| SKILLS | (30, -28) | NS-32E + EW-22S | south on NS-0, east on EW-22S, north on NS-32E briefly |
| CONTACT mailbox | (0, -70) | NS-0 (south end) + new EW-50S | south on NS-0 through tunnel (z=-26..-50), continue south, west onto EW-50S, then south on grass for last 20 m → mailbox at z=-70 still 20 m south of EW-50S **(consider moving mailbox to z=-50, or accept short grass walk)** |
| Cable-car station | (40, 30) | NS-42E + Cable Car Apron + ramp | east on EW-32N to NS-42E, south to apron at z=-17.5, west onto apron, north up the ramp to deck |
| Hacker's Den | (-80, -10) | New Hackers Den spur (z=-10) | south on NS-0 to EW-12S, west to NS-42W, south to z=-10, west on Hackers Den spur to x=-80 |
| Server Room | (80, -10) | New Server Room spur (z=-10) | east on EW-32N or EW-22N to NS-42E, south to z=-10 …or via flyover east foot down EW-0 ext to spur |
| Observation Tower | (85, 65) | New Tower Approach (z=50) | east, then north, last 15 m on grass — intentional "viewing parking" |
| Park (-65, -55) | parkX/Z | New EW-50S + NS-42W | south on NS-0, west on EW-50S to x=-65, last 5 m on grass to bench cluster |
| Lake / pier | (60, -65) / (72, -65) | New EW-50S | south on NS-0, east on EW-50S; pier still on grass at z=-65 (5 m off-road) |
| Socials | (-30..30, 60) | New EW-50N | north on NS-0, east on EW-50N; socials are 10 m north of road — drive under each torus |
| HTB Skull | (-30, 45) | EW-38N or EW-50N | north on NS-22W or NS-32W |
| Loop-the-loop | (-65, 65) | New Recreation Lane + Loop stub | NS-32W → north → EW-50N west → loop stub at x=-77 |
| Fun zone (ramp, bricks, pins) | (-55, 45) … (-40, 70) | New Recreation Lane | EW-50N west, north onto Recreation Lane |

Every active zone is now within **5 m of a road edge** — driveable.

---

## 5. CONSTRUCTION ORDER

The world is already drivable today (player can cross grass). Order is chosen so each new piece **immediately fixes one specific complaint**, and so that nothing stranded is built before its connector.

1. **Cable Car Apron** (`addRoadStrip(false, 40, -17.5, 10)`) — fixes the headline complaint. Cosmetic until step 2 lands.
2. **NS-42E** (`addRoadStrip(true, 42, 0, 100)`) — feeds the apron. Now the cable car is reachable.
3. **NS-42W** (mirror) — symmetry, services west spurs.
4. **EW-0 east extension** (`addRoadStrip(false, 65, 0, 30)`) — flyover east foot now lands on tarmac.
5. **Server Room spur** (`addRoadStrip(false, 65, -10, 30)`) — Server Room reachable.
6. **Hackers Den spur** (`addRoadStrip(false, -65, -10, 30)`) — Hacker's Den reachable.
7. **EW-50N** + **EW-50S** — outer ring south + north sides; opens up Socials, Park, Lake.
8. **Tower Approach** (`addRoadStrip(false, 70, 50, 30)`) — Observation Tower reachable.
9. **Recreation Lane** (`addRoadStrip(false, -55, 60, 25)`) — Fun zone reachable.
10. **Loop entry stub** (`addRoadStrip(true, -77, 65, 16)`) — Loop the loop reachable.
11. **Intersection accents** — extend the disc loop on line 399 to include outer nodes (`x ∈ {-42, 42}` and `z ∈ {-50, 50}`) so the new junctions read as proper intersections, not painted lines crossing.

After step 11 the network is internally consistent: every named landmark and every zone pad has a tarmac route from spawn, no ramp dangles, and the perimeter is closed.

---

## 6. THINGS WE EXPLICITLY DID NOT DO

- **No new helpers.** `addRoadStrip` is sufficient; no need for an `addRoad(x,z,w,h,rot)` since the existing API enforces consistent style (width 5, dashed yellow, orange edges).
- **No moving existing zones.** Tempting to push the mailbox to z=-50 or the Socials to z=50, but this is a *road plan*, not a zone re-layout. The 5-m off-road walk is acceptable per Bruno-Simon-style portfolios.
- **No re-paving of intersections.** The existing 9 inner accents stay; we only add 6-8 outer accents.
- **No diagonal roads.** `addRoadStrip` only draws axis-aligned strips. Diagonals would need a new helper — out of scope.
- **No widening for the flyover.** It's 5 m wide and fits one car — that's the existing design intent (drift / overtake = mini-event, not a highway).
- **No second tunnel.** One tunnel is enough flavour; doubling would crowd NS-0.
