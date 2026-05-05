# URBAN PLAN — Imran Pasha Alpine Portfolio City

**Author:** Urban Architect agent
**Map:** flat ground bounded by mountain ring at radius 100 (24-segment), horizon at radius 110-130
**Spawn:** car at (0, 0, 0) facing +Z, Welcome Arch overhead at z=12
**Theme:** Bruno-Simon-style alpine portfolio — Switzerland (green meadows + snow peaks + chalets) crossed with full-stack engineer + cybersecurity portfolio
**Scope:** This document covers ZONING, AESTHETICS, and component placement only. Roads are being planned by the civil engineer agent in parallel.

---

## 1. CURRENT WORLD INVENTORY

### Landmarks (1.A)
| Component | (x, z) | Source line | Theme |
|---|---|---|---|
| Welcome Arch (`imran pasha` keystone) | (0, 12), 9 m tall | 2499 | Spawn portal |
| Visitor Tower (live visit count + ticker) | (15, 8), 9.5 m crystal on top | 2571 | Civic monument |
| Observation Tower (40 m, sweeping beacon, holographic globe) | (85, 65), top y=44 | 1237, 859 | Far-NE landmark |
| Cable Car STATION (drivable ramp from south, 11 m deck) | (40, 30), STATION_H=11 | 2844 | Alpine transport |
| Cable Wire + Gondola | (40, 12.5) → (highest mountain peak ~r=120) | 2848-2991 | Alpine ride |
| HTB Skull statue (cybersec easter egg) | (-30, 45) | 1303 | Cybersec landmark |
| Sun ring on horizon | (0, 22, -160) | 1567 | Backdrop |
| Holographic Globe ("imran . net") | (85, 44, 65) — mounted on Observation Tower | 831 | Network beacon |
| Hidden Bunker (CRT scrolling code, hold-E trigger at -30,50) | trigger (-30, 50); bunker at (-30,-8,50) | 605, 685 | Hidden cybersec scene |
| Welcome spawn pad (glowing pink ring) | (0, 0) | 1601 | Player respawn |

### Interactive Zones — `addZonePad()` and `zones.push()` (1.B)
| Zone key | (x, z) | Radius | Label | Source line |
|---|---|---|---|---|
| `about` | (-30, -25) | 5 | ABOUT ME | 3879 |
| `projects` | (30, 24) — pad in front of billboard at (30,30) | 4.5 | PROJECTS | 4081 |
| `skills` | (30, -28) | 7.5 | SKILLS | 4214 |
| `contact` | (0, -70) | 5 | CONTACT (mailbox) | 4218 |
| `social_0` GitHub | (-30, 60) | 2.6 | GitHub | 4316 |
| `social_1` LinkedIn | (-10, 60) | 2.6 | LinkedIn | 4316 |
| `social_2` Twitter/X | (10, 60) | 2.6 | Twitter | 4316 |
| `social_3` HackTheBox | (30, 60) | 2.6 | HackTheBox | 4316 |
| `hackers_den` | (-80, -10) | 7.5 | HACKER'S DEN | 3409 |
| `sqli_demo` (laptop pad) | (-80, -32) — denX + 0, denZ + -22 | 2.2 | SQLi demo | 3407 |
| `server_room` | (80, -10) | 7.5 | SERVER ROOM | 3590 |

### Recreation features (1.C)
| Component | (x, z) | Source line | Notes |
|---|---|---|---|
| Loop-the-loop (drivable torus) | (-65, 65), R=9 | 4385 | Currently in NW |
| Loop entrance ramp | (-65 - 13 = -78, 65) | 4421 | Approach from west |
| Brick wall (4×3 breakable) | (-50…-45, 50) | 4373 | NW filler |
| Bowling pins (10 pins on circle r=4) | center (-40, 70) | 4379 | NW area |
| Recreation ramp (jump) | (-55, 2, 45) | 4365 | NW area |
| Flyover bridge over road x=0 | spans x=33→67 at z=0, 3.5 m high | 3742-3815 | E-W center |
| Tunnel (24 m roofed) | x=0, z=-26 to z=-50 (centered z=-38) | 3819 | South of spawn |
| River (winding strip) | NE entry (85,60) → southern mouth (70,-55) via 6 waypoints | 1132 | E side |
| Lake (oval, R=20) | (72, -65) | 1154 | SE corner |
| Pier into lake | (60, -65) | 1221 | West shore of lake |
| North bridge over river | (60, 22) | 1216 | River crossing |
| South bridge over river | (55, -25) | 1218 | River crossing near lake |
| Park (grass disc R=16, benches, lamps, dog spawn) | (-65, -55) | 1333 | SW |
| Cherry blossom petals particle area | center (-65, -55), spread 30 | 974 | Park petals |
| Rally checkpoints (5 hidden) | (-65,25), (75,40), (-50,-78), (50,-80), (0,90) | 3132-3136 | Off-road challenge |
| Hot air balloon | drifts left→right at y=35, starts at (-90,-40) | 522, 4893 | Sky decor |

### Decoration — Trees, NPCs, vehicles, buildings, props (1.D)
| Component | Locations |
|---|---|
| Trees (28 total, types pine/oak/cherry) | TREE_SPOTS array, line 1428. Cluster around park, around about-zone (-32,-16 etc), behind projects (z=32), around skills (32,-10 etc), socials backdrop (z=44), contact (-8,-34 etc), random fillers around the perimeter |
| Park trees (cherry+oak+pine cluster) | (parkX±, parkZ±) at (-65, -55) |
| NPCs (7 pedestrians) | 4 in park, others at (-12,18), (14,-22), (28,30) |
| Pet dog | starts (-58, -50), wanders in park |
| Traffic lights (4) | (±11, ±11) — center grid |
| Parked cars (8 decorative) | (-19,4), (-19,16), (19,-4), (19,-16), (-9,-19), (-29,-2), (29,14), (4,19) |
| Swiss chalets (4) | (-95,-50), (95,-45), (-90,75), (85,95) — at mountain edge |
| Procedural buildings (29 total, types A/B/C) | line 3720 BUILDING_SPOTS. Clusters: NW "downtown" cluster (z=-32 to -68), NE "tech park" (44+, z=16-44), east "skill alley" (44+, z=-16 to -38), south "mailroom" (-30…22, z=-55…-68), social boulevard backdrop (z=78), riverside east (54,0 / 54,-8), west edge fillers (-58,4 / -58,16) |
| Coins (28 total) | line 885 COIN_SPOTS — spawn ring, Imran Avenue line, Pasha Boulevard line, intersections, bridge approaches, around tower, park east edge |
| GitHub contribution graph sculpture | (-30, -38), 13 m wide on a wood pedestal — sits behind ABOUT zone |
| Wildflowers (point sprites, 600 random patches) | scattered ±90 m on both axes |
| Clouds (30, drifting) | y=11-23, scattered ±100 m |
| Stars + meteors + airplane + balloon + birds | sky decor |
| Spawn pad lamp + cherry tree | (5,5) and (-5,5) — flank spawn |

---

## 2. PROBLEMS YOU IDENTIFIED

1. **Skills cluster sits next to nothing related.** `SKILLS` zone is at (30, -28) — east-south. The Server Room (backend) is at (80, -10) and Hacker's Den (security) is at (-80, -10) — three skill-related areas are fired across the map at three different compass points. A visitor cannot mentally group them.

2. **The Hacker's Den at (-80, -10) is isolated from everything else.** It's a deep-NW outpost more than 50 m away from any other zone or road. Same for Server Room (80, -10). They feel like two satellites rather than two halves of a "skills district."

3. **Welcome Arch and Visitor Tower don't form a coherent plaza.** Arch is at (0, 12), Visitor Tower is at (15, 8). Together they make a rough triangle with the spawn pad, but there's no visual framing — no plaza floor, no road grid that obviously fans out.

4. **Cable Car Station is an island.** Station at (40, 30) has its drivable ramp coming from the south (z=-12 approach) but nothing thematic surrounds it — no chalets cluster, no alpine village. Approaching player sees only flat green grass with a wood building on it. The Switzerland theme is being thrown away exactly where it should be loudest.

5. **Park is in the wrong corner.** It's at (-65, -55) — far SW, behind the Hacker's Den. The Park should be a calm Swiss-village green near the chalets, not next to a Matrix-themed cybersec den.

6. **Chalets are scattered as four isolated dots near the mountains** — they don't read as an "alpine village." The two south chalets at (-95,-50) and (95,-45) are nowhere near the park, river, or cable station they should anchor.

7. **Procedural buildings clash with their neighborhoods:**
   - "Tech park" buildings at (44, 16-44) sit ON TOP of the river (river path includes (50,-15) and (55,10)). Buildings in the river bed.
   - Type-C "neon hacker tower" buildings at (44, 16) / (44, 28) / (56, 28) are NE — but the actual Hacker's Den is at (-80, -10). The cybersec aesthetic is on the wrong side of the map.
   - Type-B "cream brick studio" at (-58, -34) / (-44, -42) sits in what should be a Swiss village, not a Mediterranean studio block.

8. **Loop / bowling pins / brick wall are dumped in the NW corner** with no explanation. There's no "Recreation Park" framing — a player who finds the loop has no idea why it's there or that it's part of a designed area.

9. **HTB Skull at (-30, 45)** sits in the middle of nowhere. It's also the Hidden Bunker trigger location. Right now the skull is between PROJECTS (30, 30) and SOCIAL row (z=60), with no thematic grouping. It should anchor a security/easter-egg hub.

10. **Social boulevard at z=60** is a long horizontal row of 4 brand discs. Behind them at z=78 are five Type-C neon towers — that backdrop is dramatic but disconnected from anything. Why are GitHub/LinkedIn/Twitter/HTB lined up on the north edge of the map? There's no thematic reason.

11. **Contact mailbox at (0, -70)** is south-isolated. Surrounded only by 4 type-A/type-B buildings and a tunnel approach. Reads as a dead-end suburb.

12. **Redundant water:** the river at (85,60) → (70,-55) and the lake at (72,-65) consume the entire E and SE edges. Five of seven east-side procedural buildings (the tech park) overlap with the river. Either move the buildings or shrink the river.

13. **Coins at (78,65), (85,75) are at the base of the Observation Tower** — a player driving up there finds a tower but no district context. The tower stands alone in a green field 25+ m away from everything else.

14. **Day/night, weather, balloon, birds, plane** are all global atmosphere — fine. No issue.

---

## 3. PROPOSED DISTRICT MAP

Six districts, each a wedge or quadrant. The 100-radius mountain ring is the city wall; everything inside is zoned.

### District 1 — WELCOME PLAZA (centre)
- **Bounds:** circle of radius 25 from (0, 0). Bleeds into all other districts via the four cardinal roads.
- **Vibe:** Civic plaza. Visitor's first impression. Wood + warm pink/cyan neon, lots of road markings pointing outward. Reads as "you've arrived."
- **Components that stay here:**
  - Spawn pad (0, 0)
  - Welcome Arch (0, 12) — KEEP
  - Visitor Tower (15, 8) — KEEP
  - Spawn lamp post (5, 5) and cherry tree (-5, 5) — KEEP
  - Traffic lights (±11, ±11) — KEEP (these mark the four "exits to other districts")
  - Parked cars (-9, -19), (4, 19), (-19, 4), (-19, 16), (19, -4), (19, -16) — KEEP (visual filler)
- **Components moved IN:** none new — the plaza should stay sparse so the arch + tower read clearly.
- **New decorative props (small additions):**
  - 4 short directional signposts at (±15, ±15) reading "→ SKILLS DISTRICT", "→ ALPINE VILLAGE", "→ HACKER'S DEN", "→ MAILROOM"
  - A square paved plaza floor (8 m radius cobblestone disc, y=0.03) under the spawn pad to define the space visually
  - 2 flagpoles flanking the arch at (-7, 14) and (7, 14) flying a small Swiss flag (red square + white cross) — anchors the alpine theme at first sight

### District 2 — ALPINE VILLAGE (north-east)
- **Bounds:** north-east quadrant, x = +25 to +95, z = +5 to +95
- **Vibe:** Swiss alpine resort. Wood chalets, cable-car ride to the mountain peak, observation tower as the village's lookout point, river running through, north bridge crossing the village. This is the "Switzerland" centerpiece — the postcard part of the city.
- **Components that stay here:**
  - Cable Car Station (40, 30) — KEEP, this is the village heart
  - Cable Car ramp (drivable, ends just south of station) — KEEP
  - Cable wire + gondola — KEEP
  - Observation Tower (85, 65) — KEEP, repositioned conceptually as "village watchtower"
  - Holographic Globe on tower top (85, 44, 65) — KEEP
  - North bridge over river (60, 22) — KEEP
  - River segments (entire path stays — the river belongs to the alpine village)
  - Projects billboard moves OUT (see District 3) — currently at (30, 30), too close to the cable station
- **Components moved IN:**
  - Chalet from (95, -45) → (62, 38) — south chalet of village, just east of cable station
  - Chalet from (-90, 75) → (78, 50) — second village chalet, between station and tower
  - Chalet from (85, 95) → (50, 75) — third village chalet, north of cable station
  - 4th chalet at (-95, -50) → (90, 35) — fourth chalet, near the tower base. (All four chalets now form a small cluster, NOT four corners of the map.)
  - Rally checkpoint (75, 40) — STAYS, fits the alpine driving theme
- **Components moved OUT:**
  - Type-C neon hacker towers at (44, 16), (44, 28), (56, 28) — REMOVE entirely or relocate to Hacker's Den district. They visually fight the wood-chalet vibe.
  - Type-A/B procedural buildings overlapping the river at (54, 0), (54, -8), (44, 38), (38, 44), (44, 16) — REMOVE. The river is the negative space.
- **New decorative props:**
  - 5 pine trees clustered around the chalets at (45, 35), (55, 45), (70, 50), (85, 55), (75, 70) — reinforces alpine forest
  - A small wooden cowbell signpost at (40, 18) reading "↑ CABLE CAR ↑" facing south (where ramp begins)
  - A small wood-railed lookout deck at the tower base (85, 65) — currently the tower has only its 4 legs; a 6×6 m wooden observation platform at ground level helps it feel "visited"
  - A goat pen (3 small white box-cubes "sheep" + a wooden rail fence 4×4) at (60, 60) — alpine flavor

### District 3 — TECH PARK (east)
- **Bounds:** east strip, x = +25 to +60, z = -25 to +5 (a thin slab between Skills cluster south and Alpine Village north)
- **Vibe:** modern professional district. Wooden billboards + clean cream-brick studios. Where Imran's PROJECTS live. Connects the warm welcome plaza to the engineering districts (Server Row south).
- **Components that stay here:**
  - Projects billboard (30, 30) — MOVE to (30, 0) so it sits centrally on Pasha Boulevard at the east edge of the plaza, NOT inside Alpine Village
  - Wait — relocate. Final position: **(45, 0)**. This makes the billboard the gateway to the east half: the player drives east on Pasha Blvd, the billboard is at the end of the boulevard.
  - Flyover bridge (33→67 at z=0, 3.5 m high) — KEEP. The billboard sits UNDER the flyover (or just west of its start). Player drives the flyover for fun, then PROJECTS pad is right at the off-ramp.
  - NPC at (28, 30) — KEEP, becomes a visitor admiring the billboard
- **Components moved IN:**
  - Type-B cream brick studios from (44, -16), (56, -22) → (50, -5), (55, 8). Reads as "tech offices flanking the billboard"
- **Components moved OUT:**
  - Type-C neon towers (44, -16), (44, -28), (44, -38) — relocate to Hacker's Den district (they belong with the dark cybersec aesthetic)
  - Skill skill-cube circle at (30, -28) — moves into Server Row District (see District 4)
- **New decorative props:**
  - 2 office workers NPCs at (40, 5) and (50, -5) in business colors (grey/navy)
  - A small wooden coffee-cart prop (1×1×1 box w/ awning) at (38, 8)

### District 4 — SERVER ROW & SKILLS HUB (south-east)
- **Bounds:** south-east quadrant, x = +25 to +95, z = -45 to -5
- **Vibe:** engineering quarter. Cyan/blue/cool palette. The Server Room is the anchor. Skills cubes (the 9 stackable knockable icon cubes) are clustered at the entrance to the Server Room as "preview" of what's inside. Microservices, gauges, container orchestra all feel like one coherent campus.
- **Components that stay here:**
  - Server Room (80, -10) — KEEP at current position. Already has microservices, pipeline, container orchestra, gauges.
  - South bridge over river (55, -25) — KEEP
  - Lake (72, -65) — sits at the south edge of this district / SE corner. KEEP.
  - Pier (60, -65) — KEEP
- **Components moved IN:**
  - SKILLS zone & 9 skill-cubes — relocate from (30, -28) to **(60, -10)** — directly in front of the Server Room as its "welcome row." The skill cubes preview backend skills (Node, Docker, AWS, Mongo, GraphQL etc), which thematically fit. React/Python/Burp/Linux are the broader-skills cubes — they belong adjacent to the server-room cluster.
  - Type-B cream brick studios from (44, -28), (44, -38) — REPLACED by relocation; remove these.
  - Rally checkpoint (50, -80) — STAYS, fits the lake-side off-road theme
- **Components moved OUT:**
  - Type-C neon towers at (44, -16), (44, -28), (44, -38) — relocate WEST to the Hacker's Den (cybersec aesthetic)
  - Tech-park buildings overlapping the river — already removed in District 3
- **New decorative props:**
  - 2 small "data center" props (6×6 m grey box with cyan blinking LED grid) at (70, -25) and (90, -25) — frames the Server Room
  - A small fountain or water feature (cyan tinted) at (75, -10) — alludes to "data flow"
  - A row of 3 short server-rack-shaped boxes (2×2×0.5 m) at z=-15 to -20, decorative bench seating

### District 5 — HACKER'S DEN & EASTER-EGG HILL (west)
- **Bounds:** west strip, x = -45 to -95, z = -45 to +60. The whole western half except the alpine village in the NW.
- **Vibe:** dark, green-tinted, Matrix/Tron palette. Hacker culture. The HTB Skull is the gateway landmark; the bunker trigger sits behind it; the Hacker's Den building (with breach timeline + OWASP padlocks + Linux command columns + SQLi laptop) is the main attraction.
- **Components that stay here:**
  - Hacker's Den (-80, -10) — KEEP
  - Den breach timeline (7 markers, internal coords +12 in z) — KEEP
  - OWASP padlock garden (10 padlocks south of pad, internal -10 to -22 in z) — KEEP
  - Linux command columns (12 columns east of pad) — KEEP
  - SQLi demo laptop pad (-80, -32) — KEEP
  - HTB Skull statue (-30, 45) — MOVE to (-50, 30). Currently sits between projects and socials with no thematic link. Moving it west places it on the path the player takes from spawn into the Hacker's Den district. The Skull becomes the **gateway landmark** for the cybersec district.
  - Hidden Bunker — bunker physical mesh stays at (-30, -8, 50) but trigger spot must move with the skull. **Update bunker trigger from (-30, 50) to (-50, 30)** so it's still co-located with the skull. (Bunker mesh underground can move too, but the trigger is what matters.)
- **Components moved IN:**
  - Type-C neon hacker towers (was at 44, 16-38 east) → relocate to (-50, 0), (-60, 10), (-50, 20) — three neon towers ringing the approach to Hacker's Den
- **Components moved OUT:**
  - Park (was at -65, -55) — MOVES to Alpine Village District 2's south side (see Recreation district below)
  - Pet dog spawn (-58, -50) — moves with the park
  - Park trees (cherry/oak/pine cluster around park) — moves with the park
  - Park benches + lamps + 4 NPCs — moves with the park
- **New decorative props:**
  - A row of 5 broken green CRT screens / monitor stacks (1×1×0.5 m boxes with green emissive material) at (-65, 5) — Matrix vibe
  - A black-cloak NPC at (-50, 28) facing the skull — "the hacker"
  - 2 dim green floor lamps at (-70, -10) and (-90, -10) flanking the den entrance

### District 6 — RECREATION PARK & MAILROOM (south)
- **Bounds:** south crescent, x = -65 to +30, z = -45 to -90
- **Vibe:** lakeside park & residential. Picnic + play + tunnel-as-feature + the mailbox cul-de-sac. Quiet southern district.
- **Components that stay here:**
  - Contact mailbox + zone (0, -70) — KEEP
  - Tunnel (0, -38) — KEEP. Now reads as "tunnel from Plaza to Mailroom"
  - Type-A/B residential buildings at (-18, -55), (16, -55), (-30, -68), (22, -68) — KEEP, reframe as "suburban houses near the post office"
  - Rally checkpoint (-50, -78) — KEEP
- **Components moved IN (from old NW Recreation cluster):**
  - Loop-the-loop — from (-65, 65) → **(-25, -50)**. New loop position is just SW of the tunnel exit, fits the Recreation Park theme.
  - Loop entrance ramp — moves with the loop
  - Brick wall (4×3) — from (-50, 50) → (-15, -55). Sits next to the loop as a Bruno-Simon-style smashable.
  - Bowling pins — from (-40, 70) → (-40, -70). Fits the south-side recreation cluster.
  - Recreation jump ramp — from (-55, 45) → (-50, -65). Sits near bowling pins.
  - FUN ZONE label — moves with the cluster, repositioned at (-30, 8) at top of cluster
- **Components moved IN (PARK relocates here):**
  - Park grass disc (R=16) — from (-65, -55) → (-50, -45). Park now anchors the SW corner of the recreation district. (The Recreation District south + Park co-located reads as "south-side green belt.")
  - Park benches (3) — move with park
  - Park lamps (3) — move with park
  - Park trees (cherry/oak/pine cluster) — move with park
  - 4 park NPCs — move with park
  - Pet dog spawn — move with park to (-50, -45)
  - Cherry blossom petal particle area — center moves to (-50, -45)
- **Components moved OUT:** none — this district absorbs both the old Recreation NW cluster and the old SW Park.
- **New decorative props:**
  - 1 small pavilion/gazebo (4 wooden posts + flat roof) at (-45, -55) at park edge — picnic spot
  - A volleyball net (2 thin posts + thin net) at (-35, -65) between bowling and park
  - Coin (-35, -55) added — reward for arriving at the park

### District 7 — SOCIAL BOULEVARD (north arc, optional but kept)
- **Bounds:** north arc, x = -40 to +40, z = +55 to +85
- **Vibe:** bright, brand-coloured, billboard-style row. Social media is consciously separated from everything else (it's a different mental category from "skills" or "projects"). Reads as a Times-Square style strip.
- **Components that stay here:**
  - 4 social arches: GitHub (-30, 60), LinkedIn (-10, 60), Twitter (10, 60), HackTheBox (30, 60) — KEEP
  - 5 backdrop neon towers at z=78 — KEEP, they ARE the boulevard backdrop
  - Tree fillers at (-32, 44), (22, 44), (-32, 48), (0, 48), (12, 48) — KEEP
  - Rally checkpoint (0, 90) — KEEP, north-edge driving challenge
- **Components moved IN:** none.
- **Components moved OUT:** none.
- **New decorative props:**
  - A red carpet runner (long thin red plane, 60 × 3 m) at z=60, y=0.05, spanning from x=-32 to x=32 connecting all four social arches.

---

## 4. THE WELCOME PLAZA (special)

The spawn area must read in 0.5 seconds as "you are HERE, and you can go in 4 directions." Anything within radius 25 of (0, 0) must reinforce that.

**KEEP at radius ≤ 25:**
- Spawn pad (0, 0)
- Welcome Arch (0, 12) — the gateway
- Visitor Tower (15, 8) — the live-visit monument
- Spawn lamp (5, 5)
- Spawn cherry tree (-5, 5)
- Traffic lights at (±11, ±11) — these become "exit gates" toward each cardinal district
- Parked cars at (±19, ±4..16) — visual filler giving the plaza a "parked street" feel
- 4 NPCs (move from existing scattered) → cluster at the plaza:
  - NPC currently at (-12, 18) → STAYS
  - NPC currently at (14, -22) → moves to (10, 12) — north of plaza
  - NPC currently at (28, 30) → moves to District 3 (Tech Park)

**ADD at radius ≤ 25:**
- 8 m radius cobblestone disc under spawn (y = 0.03, z = 0) for "plaza floor" definition
- 4 directional signposts at (±15, 0) and (0, ±15):
  - North (0, +15): "→ SOCIAL BLVD"
  - South (0, -15): "→ MAILROOM & PARK"
  - East (+15, 0): "→ TECH PARK / ALPINE VILLAGE / SERVER ROW"
  - West (-15, 0): "→ HACKER'S DEN / EASTER EGGS"
- 2 flagpoles flanking the arch (-7, 14) and (7, 14) flying small red Swiss flag

**REMOVE / RELOCATE from current radius ≤ 25:**
- Nothing critical. The current plaza is already mostly clean — the only awkward props are the parked cars at (±19, ±4..16), which DO look fine as "parked-on-street" but should remain symmetric (which they already are).

The road grid (x = 0 NS, z = 0 EW, plus x = ±12 etc) already fans out — the civil engineer agent handles the actual road geometry. From the architect side: the four roads OUT of the plaza must be clearly differentiated by what the player sees first as they head down each — a NEON TOWER as you go west (Hacker's Den), a WOODEN BILLBOARD as you go east (Tech Park), a TUNNEL MOUTH as you go south (Mailroom), an ARCH OF SOCIAL ICONS as you go north (Social Blvd). All four of those landmarks already exist or can be repositioned — that visual differentiation is the master organizing principle.

---

## 5. THE CABLE CAR STATION (per user complaint)

**Current state:** Station at (40, 30), STATION_H = 11. Drivable ramp approaches from the south (ramp center z = 30 - 5.5 - 21 = 3.5, ramp ends at z ≈ 24.5 just south of station). Ramp sign at (40, 4, 30 - 47.5) ≈ (40, 4, -17.5) reads "↑ DRIVE UP TO CABLE CAR." That's already a good signal. **What's missing is the surrounding district context** — the station looks like a wood box on grass.

**Host district:** ALPINE VILLAGE (District 2). The station is the village's HEART.

**Connection from spawn:**
1. Player exits spawn, drives east on Pasha Boulevard (z = 0).
2. Crosses (or jumps over) the Flyover at x = 33-67, z = 0.
3. As the player drives off the flyover east-ramp at x = 67, z = 0, they see:
   - The Projects Billboard relocated to (45, 0) — slightly NW of the flyover end
   - A signpost at (40, 0, 8) reading "← CABLE CAR / ALPINE VILLAGE" (north arrow)
4. Turn left (north) at the next intersection — the cable car ramp's south-facing entrance is at approximately (40, 0, -17). That's only 17 m north of the player. The ramp + sign + station are visible from here.
5. Drive up the ramp, arrive on the deck at y = 11.

This routing gives the player a clear sequence: spawn → boulevard east → flyover → "wow there's an alpine village" → northward turn → cable ramp → deck.

**Thematic dressing surrounding the station (make it feel alpine, not isolated):**
- 4 chalets relocated to ring the station (see District 2 above): (62, 38), (78, 50), (50, 75), (90, 35). These four wood-and-red-roof buildings frame the station with warm Swiss buildings.
- 5 pine trees clustered at (45, 35), (55, 45), (70, 50), (85, 55), (75, 70) — forest backdrop.
- A small wooden goat pen at (60, 60) with 3 small white "sheep" boxes — alpine flavor.
- A row of 3 small market stalls (wood frames + colored awning, 2×2 m each) at (50, 25), (45, 28), (35, 28) — at the foot of the station's south side, suggesting "village square."
- A second signpost at (40, 4, 0) at the boulevard turn reading "↑ ALPINE VILLAGE."
- Replace one of the rally checkpoints — KEEP (75, 40) here as "alpine off-road challenge."

**Aesthetic palette:** wood (tan/brown 0x8a5a28 — same as chalets), red roofs (0xa83232), green pine (0x1a4a2a). NO neon purple or cyan towers in this district except the station's existing cyan deck-railing accent.

---

## 6. MOVES TABLE

| Component | From (x, z) | To (x, z) | Reason |
|---|---|---|---|
| Park grass + benches + lamps + dog + NPCs + cherry-petal area + park trees | (-65, -55) | (-50, -45) | Co-locate with new Recreation Park district; remove from Hacker's Den approach |
| Loop-the-loop + ramp | (-65, 65) | (-25, -50) | Move to new Recreation Park (south); free NW corner |
| Brick wall (4×3) | (-50, 50) | (-15, -55) | Recreation Park co-location |
| Bowling pins (10) | (-40, 70) | (-40, -70) | Recreation Park co-location |
| Recreation jump ramp | (-55, 45) | (-50, -65) | Recreation Park co-location |
| FUN label | (-55, 55) | (-30, -50) | Above new Recreation Park cluster |
| HTB Skull statue | (-30, 45) | (-50, 30) | Becomes Hacker's Den gateway landmark; on path from plaza to den |
| Bunker trigger spot | (-30, 50) | (-50, 30) | Co-locate with skull |
| Bunker mesh (underground) | (-30, -8, 50) | (-50, -8, 30) | Move with trigger so the camera dip lands underneath the skull |
| Skills zone + 9 skill cubes | (30, -28) | (60, -10) | Co-locate with Server Room; reads as "engineering campus entrance" |
| Projects billboard (frame, screen, controls panel) | (30, 30) | (45, 0) | Sits at flyover east end; gateway to Tech Park; frees up Alpine Village footprint |
| Projects pad (zone) | (30, 24) | (45, -6) | Stays just south of the billboard, on Pasha Blvd |
| Chalet 1 | (-95, -50) | (90, 35) | Cluster into Alpine Village |
| Chalet 2 | (95, -45) | (62, 38) | Cluster into Alpine Village |
| Chalet 3 | (-90, 75) | (78, 50) | Cluster into Alpine Village |
| Chalet 4 | (85, 95) | (50, 75) | Cluster into Alpine Village |
| Type-C neon tower | (44, 16) | (-50, 0) | Cybersec aesthetic belongs at Hacker's Den |
| Type-C neon tower | (44, 28) | (-60, 10) | Same |
| Type-C neon tower | (56, 28) | (-50, 20) | Same |
| Type-C neon tower | (44, -16) | (-65, -10) | Same |
| Type-C neon tower | (44, -28) | (-75, 10) | Same |
| Type-C neon tower | (44, -38) | (-90, 0) | Same |
| Type-A house | (44, 38) | DELETE | Was in river bed |
| Type-A house | (38, 44) | DELETE | Was in river bed |
| Type-B studio | (56, 18) | DELETE | Was in river bed |
| Type-C tower | (54, 0) | DELETE | Was in river bed |
| Type-B studio | (54, -8) | DELETE | Was on river south leg |
| Type-B studio | (44, -16) | (50, -5) | Tech Park flanker for billboard |
| Type-B studio | (56, -22) | (55, 8) | Tech Park flanker for billboard |
| Type-B studio | (44, -38) | DELETE | Skills district moved here, no room |
| NPC | (28, 30) | (40, 5) | Tech Park visitor |
| NPC | (14, -22) | (10, 12) | Welcome Plaza pedestrian |
| NPC | (-12, 18) | KEEP | Welcome Plaza pedestrian |
| Coin | (-50, -55) | KEEP (now reads as "park east edge" at new park location) | Park park-east coin still relevant |
| Coins (78, 65) and (85, 75) | KEEP | KEEP — now read as "around Observation Tower in Alpine Village" |

**Add (new props, kept minimal per the brief):**

| New prop | (x, z) | Purpose |
|---|---|---|
| Cobblestone plaza disc (R=8, y=0.03) | (0, 0) | Welcome Plaza floor |
| 2 Swiss flag poles | (-7, 14), (7, 14) | Alpine theme at first sight |
| 4 directional signposts | (0, 15), (0, -15), (15, 0), (-15, 0) | Wayfinding from plaza |
| Signpost "↑ CABLE CAR" | (40, 4, -10) | Visible from boulevard |
| Signpost "↑ ALPINE VILLAGE" | (40, 4, 0) | At the north-turn intersection |
| 5 pine trees | (45,35),(55,45),(70,50),(85,55),(75,70) | Alpine forest backdrop |
| Goat pen (3 sheep + fence) | (60, 60) | Alpine flavor |
| 3 market stalls | (50,25),(45,28),(35,28) | Village square at station foot |
| Tower observation platform (6×6 m wood deck, y=0.5) | (85, 65) | Tower base context |
| Pavilion / gazebo (4 posts + flat roof) | (-45, -55) | Park picnic spot |
| Volleyball net (2 posts + thin net) | (-35, -65) | Park play area |
| 1 coffee cart (1×1×1 box + awning) | (38, 8) | Tech Park ambience |
| 2 office NPCs | (40, 5), (50, -5) | Tech Park life |
| 5 broken CRT-screen stacks (green emissive) | row at (-65, 5) | Hacker's Den approach |
| 1 black-cloak NPC | (-50, 28) | Hacker's Den / skull guardian |
| 2 dim green floor lamps | (-70, -10), (-90, -10) | Hacker's Den entrance |
| 2 datacenter prop boxes (grey + cyan LEDs) | (70, -25), (90, -25) | Server Room context |
| 1 small fountain (cyan tinted, R=2) | (75, -10) | Server Row "data flow" feature |
| Red carpet (60×3 m, y=0.05) | spans (-32 to +32) at z=60 | Social Blvd visual unification |

---

## 7. NON-NEGOTIABLE CONSTRAINTS

The implementer must respect these — moving them breaks gameplay or hardcoded API contracts.

1. **Spawn pad MUST stay at (0, 0).** `chassis.position.set(0, 3, 0)` in `resetCar()` (line 2207). The spawn pad mesh, the welcome arch overhead, and the camera intro all depend on spawn=(0, 0).

2. **Mountain ring MUST stay at radius 100 (24-segment, height 50).** The boundary walls (`BOUNDARY_R = 100`, `BOUNDARY_SEGMENTS = 24`, line 2829) are physics colliders. Anything moved beyond r=100 falls outside playable space.

3. **Lake position (72, -65) MUST stay.** The `lakeShine` faux-mirror plane at (72, 0.10, -65) (line 700) is hardcoded.

4. **River path MUST stay** (RIVER_PATH at line 1132). The two bridges depend on it: north bridge (60, 22) and south bridge (55, -25). Move river → must move bridges.

5. **Cable Car Station coords MUST stay at (40, 30) STATION_H=11.** `STATION_X`, `STATION_Z`, `STATION_H`, `cableStart`, `cableEnd`, the ramp center, the ramp angle calculation all depend on these constants (lines 2847-2850). The ramp + station + cable wire + gondola form one rigid system.

6. **Cable wire endpoint depends on `highestPeak`** — picked dynamically from the mountain ring (line 2792). Don't change MOUNTAIN_COUNT or RING_R; the cable wire targets whichever mountain ends up tallest.

7. **Observation Tower at (85, 65) MUST stay.** The holographic globe (`globeGroup.position.set(85, 44, 65)` line 859) and its `imran . net` label (85, 48, 65) are hardcoded to mount on top of the tower.

8. **Hacker's Den at (-80, -10) MUST stay** as the den's pad center. Its internal layout (breach timeline at +12, padlocks at -10..-22, command columns at +12..+22) is laid out relative to (denX, denZ) and does NOT need to move.

9. **Server Room at (80, -10) MUST stay.** Its internal layout (microservices at +12, pipeline at +22, containers at -10, gauges at -2) is relative to (srvX, srvZ).

10. **SQLi laptop pad at (-80, -32) MUST stay** — it's a child of the den group, but the absolute coordinate matters because the zone is registered at `denX + 0, denZ + -22 = -80, -32` (line 3407).

11. **Bunker mesh + trigger MUST stay co-located** — if you move the trigger from (-30, 50), you MUST also move the bunker mesh so the camera dip teleports the car correctly. The teleport is hardcoded at line 4952: `window.imranWorld.teleport(-30, 50)` — this MUST be updated if the trigger moves.

12. **Coin total = 28** (line 707 achievement check `s.coins === 28`). Don't add or remove coins without updating that achievement threshold.

13. **Rally checkpoint count = 5** (line 4691 toast threshold). Don't add or remove rally checkpoints.

14. **Off-road detection arrays** `ROAD_X` and `ROAD_Z` at line 3141-3142 — civil engineer agent owns these. They mark the visible road grid. Buildings should generally avoid being placed AT these coordinates (within ±3 m of any road).

15. **Cinematic intro path** (line 4455-4475) — the camera flies through specific waypoints looking at park (-65,-55), balloon (-90,-40), server room (80,-10), cable car (40,30), projects (30,30), arch (0,10), spawn (0,0). If the park OR projects billboard moves, the LOOK-AT path waypoint must update. Specifically:
   - Park look-at waypoint at index 0/1: `(-65, -55, -55)` → must update to `(-50, 0, -45)` after park moves
   - Projects look-at waypoint at index 5: `(30, 5, 30)` → must update to `(45, 5, 0)` after billboard moves

16. **GitHub contribution sculpture at (-30, -38)** (line 3886) — sits behind the ABOUT zone at (-30, -25). If the about zone moves, the sculpture should follow. Recommend keeping ABOUT at (-30, -25) and sculpture at (-30, -38) — both work in District 5's eastern edge (the about-me / personal info area).

17. **Welcome Arch at (0, ~12)** is a cluster of meshes (posts, top torus, glow, keystone, label) all positioned with z = 12 and dx = ±7. If the arch moves, all 8 child positions must update.

18. **Visitor Tower at (15, 8)** — children of `vTowerGroup` are positioned relative to (towerX, towerZ). Moving the group is one-line; safer than re-tuning the obelisk.

19. **Flyover at z=0** — its physics body, support pillars, ramps, and stripes are all at z=0. Don't move it off the central east-west axis or the road network breaks.

20. **Tunnel at (0, -38)** — same: it sits on the central north-south axis (x=0). Don't shift it east or west.

---

## SUMMARY OF VISUAL OUTCOME

After implementation, a player who spawns sees:

- **Behind them (north):** the Welcome Arch with `imran pasha` keystone + Visitor Tower scoreboard counting up
- **Ahead (south):** a tunnel mouth and signpost: "→ MAILROOM & PARK"
- **East:** Pasha Boulevard fades into a wood-framed PROJECTS billboard, with chalets and a cable-car station rising on the horizon beyond
- **West:** a glowing green HTB Skull statue, three black neon hacker towers, and the Hacker's Den entrance ring in the distance
- **North-east overhead:** the Observation Tower with rotating holographic globe at its tip
- **South-east:** a curving river leading down to a calm lake; on its west bank a row of glowing data-center cubes (the Server Room) flanked by knockable skill cubes

Each direction has a single dominant visual that telegraphs "what kind of place is over there." That is the goal of this plan.
