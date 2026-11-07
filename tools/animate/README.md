# Exercise animation pipeline

Renders short looping technique clips for the How-to sheet: a matte clay
mannequin on a dark backdrop, with glowing lines along the working limbs. Each
exercise has a **correct** clip (green lines, check badge) and a **fault** clip
(red-orange lines, cross badge) showing the common mistake from
`mobile/src/domain/technique.ts`.

A new exercise needs one JSON spec in `specs/`, not new code.

## Requirements

- Blender 5.2 or newer (`brew install --cask blender`). Tested on 5.2.3 LTS.
- ffmpeg with libx264 (`brew install ffmpeg`).
- Python 3 on the PATH for `spec.py` (no packages needed).

Rendering uses Eevee, which runs headless on the Metal GPU on Apple Silicon. Pass
`--engine cycles` only if Eevee fails on a machine.

## Usage

```bash
# one clip
blender --background --python tools/animate/render.py -- \
  --spec tools/animate/specs/overhead_triceps_extension.json --variant correct --out tools/animate/out

# every spec, both variants
tools/animate/render_all.sh

# check every spec without Blender (also checks ids against exercises.ts)
python3 tools/animate/spec.py

# unit tests for the spec format (no Blender needed)
python3 -m unittest tools/animate/test_spec.py

# quick look at a few frames instead of a whole clip
blender --background --python tools/animate/render.py -- --spec ... --variant fault --out tools/animate/out/look --stills 0,30,60

# solve only: prints the IK checks, renders nothing
blender --background --python tools/animate/render.py -- --spec ... --variant correct --out tools/animate/out --solve-only
```

Options: `--samples` (Eevee samples, default 24; the shipped clips use 48),
`--crf` (default 28), `--keep-frames` (keeps the PNG frames and prints where).

Output per variant, in `--out`:

| File | What |
| --- | --- |
| `<id>.<variant>.mp4` | 540x960, 30 fps, H.264 High, yuv420p tagged BT.709, `+faststart`, no audio, one seamless loop |
| `<id>.<variant>.png` | Poster: the clip's own first frame as a 128-colour PNG |
| `<id>.<variant>.json` | Frame count, render time, file sizes and the solver checks |

Approved clips are copied to `mobile/assets/exercises/<id>.<variant>.mp4` (and
`.png`). `out/` is gitignored.

## Character and licence

The mannequin is built from code in `rig.py` every time a clip renders: a
humanoid armature plus rounded rigid segments parented to the bones, like an
artist's wooden mannequin. No third-party model, texture or scan is used, so
there is nothing to license. It is original work in this repository and is
covered by the repository's own licence.

Rigid segments were chosen on purpose. Lifting needs extreme shoulder and elbow
angles (arms straight overhead, elbows fully bent), where a skinned mesh
collapses or stretches. Rigid parts stay clean at any angle.

`characters/` is gitignored. If a Mixamo or other third-party model is ever
tried, its source files go there and are never committed. Mixamo models may be
used in rendered output but the files themselves must not be redistributed.

## How it works

1. `spec.py` loads the JSON, expands mirrored bones, applies the variant's
   overrides and checks everything.
2. `rig.py` builds the armature and clay segments, then solves every frame:
   - forward kinematics from the key poses, blended with eased slerp
   - the equipment's orientation comes from `axis`; each hand gets a fixed
     orientation in the equipment's frame (`hand_dir`, or whatever it had in
     frame 0), so hands never turn on the weight while the wrists flex
   - the equipment is placed where the FK wrists are reaching
   - analytic two-bone IK pulls each wrist onto its grip point on the
     equipment, so the hands never slide on the weight
   - the same IK keeps the feet planted where they were in the `start` pose
     (and pivots them over the ball of the foot for `heel_lift`). If a wide
     stance swings the ankles off the floor, the whole body drops by the
     smallest amount that lets the feet land (`auto_hip_drop_mm`)
   - the FK elbow and knee positions act as pole hints, so the IK bends the
     limbs the way the pose describes
   The solved rotations are written as one keyframe per frame.
3. `look.py` sets up the clay and backdrop materials, lights relative to the
   camera, a camera fitted to the motion of both variants (so toggling between
   them never shifts the frame), the glow lines and the compositor.
4. The body and the glow lines render as separate view layers. The compositor
   lays the crisp lines over the body (always visible, like an X-ray) and adds
   a soft bloom on top.
5. ffmpeg overlays the badge (`badge.py`, drawn without dependencies) and
   encodes the loop and poster.

## Spec format

Example: `specs/overhead_triceps_extension.json`.

```jsonc
{
  "id": "overhead_triceps_extension",   // must match an id in mobile/src/domain/exercises.ts
  "name": "Overhead Triceps Extension",
  "fps": 30,                              // optional, default 30
  "equipment": { ... },
  "feet": { "planted": true },            // optional, default planted
  "poses": { "start": { ... }, "end": { ... }, "middle": { ... } },
  "phases": [ ... ],
  "camera": { ... },
  "glow": { "bones": ["upper_arm.*", "forearm.*"], "joints": true },
  "variants": { "correct": { ... }, "fault": { ... } }
}
```

### Solver checks

`--solve-only` (and every render) prints these, measured on the final pose.
All should be close to 0:

| Check | Meaning |
| --- | --- |
| `reach_error_mm` | How far any IK target was out of reach. Bend that limb more in the pose |
| `hand_drift_mm` | Largest move of a palm relative to the weight since frame 0 |
| `hand_turn_deg` | Largest turn of a hand relative to the weight since frame 0 |
| `foot_slide_mm` | Largest horizontal move of the ball of a planted foot |
| `foot_miss_mm` | Largest gap between a planted ankle and where it should be |
| `auto_hip_drop_mm` | How far the body was lowered so straight legs reach the floor (informational) |

They do not detect a hand or the body passing through the equipment. Check
stills for that.

### Bones

`hips` (the root), `spine`, `chest`, `neck`, `head`, and for each side `.L`
and `.R`: `shoulder` (collarbone), `upper_arm`, `forearm`, `hand`, `thigh`,
`shin`, `foot`, `toe`.

The rest pose is standing straight, arms hanging at the sides with palms in,
facing the camera's azimuth 0. `.L` is the character's left.

### Rotations

A pose maps bones to `[x, y, z]` in degrees. Each value rotates the bone
relative to its rest pose, about the **body's** axes, on top of whatever its
parent bone is doing:

| Axis | Body axis | Positive value, bone pointing down (arm, leg) | Positive value, bone pointing up (spine, head) |
| --- | --- | --- | --- |
| x | left-right | swings the far end backwards | tips the far end forwards |
| y | front-back | swings a left bone's far end inwards | tips the far end to the character's left |
| z | vertical | twists a left bone so its front turns outwards | turns to the character's left |

The axes follow the right-hand rule with x pointing to the character's left,
y to its back and z up. Rotations apply in x, then y, then z order.

Useful values:

- Arm raised forward to straight overhead: `"upper_arm.*": [-180, 0, 0]`
- Elbow bent 90 degrees: `"forearm.*": [-90, 0, 0]`
- Hip flexed 90 degrees (thigh horizontal): `"thigh.*": [-90, 0, 0]`
- Knee bent 90 degrees: `"shin.*": [90, 0, 0]`
- Feet turned out 8 degrees: `"thigh.*": [0, 0, 8]`

Because rotations stack down the chain, a forearm value is relative to the
upper arm. `[-140, 0, 0]` on the forearm means "bend the elbow 140 degrees"
wherever the upper arm points.

### Mirroring

`"upper_arm.*": [x, y, z]` sets `upper_arm.L` to `[x, y, z]` and `upper_arm.R` to
`[x, -y, -z]`, the mirror image. Explicit `.L` or `.R` entries win over `.*`.

### Poses

- `start` and `end` are required. Any other names (for example `middle`) are allowed.
- `"inherit": "start"` copies another pose first, then applies this pose's entries.
- Bones not mentioned are at rest.
- `"hips_offset": [x, y, z]` moves the whole body in metres (for example
  `[0, 0.05, -0.4]` to sit back and down into a squat). The planted feet stay
  where they are.
- `"heel_lift": 15` lifts both heels by that many degrees (0 or more), pivoting
  on the ball of the foot. Needs planted feet.

Slerp takes the shortest path between two poses. If a limb has to travel more
than 180 degrees, add a `middle` pose.

### Phases

```json
"phases": [
  { "to": "end", "seconds": 2.0, "ease": "in_out" },
  { "to": "start", "seconds": 1.0 },
  { "to": "start", "seconds": 0.4 }
]
```

The clip starts at `start` and moves through each phase in order. The last
phase must return to `start`, which closes the loop. A phase that goes to the
pose it is already in is a hold. `ease` is `in_out` (default, comes to rest at
both ends so turnarounds look natural), `linear`, `in` or `out`. Aim for 3 to 4
seconds in total.

### Equipment

```json
"equipment": { "type": "dumbbell", "hold": "two_hand_cup", "axis": "vertical", "grip_width": 0.075, "along": -0.065 }
```

| Field | Default | Values |
| --- | --- | --- |
| `type` | required | `dumbbell`, `barbell` or `none` |
| `hold` | required unless `none` | `two_hand_cup`: one weight in both hands (overhead extension, goblet squat). `two_hand_bar`: one bar in both hands. `each_hand`: one weight per hand, following that hand with no arm IK |
| `axis` | `vertical`, or `across` for `two_hand_bar` | Direction of the weight's long axis: `vertical`, `across` (left-right) or `forearms` (from the wrists towards the elbows). Ignored for `each_hand`, where the weight runs across the fist |
| `grip_width` | 0.08 for `two_hand_cup`, 0.5 otherwise | Metres between the two palm centres on the weight. The arm IK pulls the hands to exactly this |
| `along` | 0 | Metres from the palm midpoint to the weight's centre along its axis: positive is up for `vertical`, towards the character's left for `across` and bars, towards the elbows for `forearms` |
| `hand_dir` | none | Direction the hands point, in the weight's frame (x: the character's left, y: back, z: along the axis), for example `[0, 1, 0.2]` for hands pointing back under a dumbbell's top plate. Without it, the hands keep their frame-0 orientation relative to the weight |
| `palm` | 0.075 | Metres from wrist to palm centre |
| sizes | | Dumbbell: `handle` (0.13), `plate_radius` (0.062), `plate_half` (0.042). Barbell: `bar_length` (1.6), `plate_radius` (0.225), `plate_inset` (0.28, from each bar end to its plate) |

Cupping a vertical dumbbell under its top plate: the plate's underside sits
`handle / 2 + along` above the palms. Leave a few centimetres of clearance for
the hand's thickness, and check stills for fingers inside the iron.

### Camera

```json
"camera": { "azimuth": 180, "elevation": 20, "lens": 50, "margin": 0.12, "min_z": 0.8 }
```

Defaults: azimuth 180, elevation 12, lens 50, margin 0.07, shift_y 0.

- `azimuth`: 0 looks at the character's front, 90 its left side, 180 its back.
- `elevation`: degrees above the horizon.
- `lens`: focal length in mm on a 36 mm tall sensor.
- The camera pulls back until the whole motion of **both** variants fits, with
  `margin` (a fraction of the half-frame) to spare, and keeps clear of the
  badge in the top-right corner. `min_z` ignores everything
  below that height, to crop to the upper body. Leave it out for full-body
  exercises.
- `target` `[x, y, z]` and `distance` fix the framing by hand instead.
- `shift_y` nudges the frame up or down.

Lights follow the camera, so every exercise gets the same look from any angle.

### Glow

`"bones"` lists the bones that get a line, with `.*` for both sides. `"joints"`
(default true) adds a dot on each joint. `"radius"` sets the line thickness in
metres (default 0.011).

### Variants

```json
"variants": {
  "correct": { "caption": "Elbows forward and close to the head." },
  "fault": {
    "caption": "Common mistake: the elbows flare wide.",
    "poses": {
      "start": { "upper_arm.*": [-166, 6, 12] },
      "end": { "upper_arm.*": [-160, 34, 35] },
      "*": { }
    },
    "equipment": { },
    "colour": [1.0, 0.16, 0.02]
  }
}
```

`poses` overrides bones in named poses, or in every pose with `"*"`.
Overrides are applied before inheritance, so an override on `start` also
reaches a pose with `"inherit": "start"`, unless that pose sets the same bone
itself. A variant can also override `equipment` fields and the line `colour`
(linear RGB). Unknown fields anywhere in a spec are errors, so typos never pass
silently.
Correct is green with a check badge; fault is red-orange with a cross badge.

## Adding an exercise

1. Copy a spec with similar equipment and rename the `id` to the exercise's id.
2. Rough in `start` and `end` with `--stills 0,<frame of end>` until the shapes
   read well. The IK fixes hand and foot contact, so the arm and leg angles
   only need to be close.
3. Check `--solve-only`: every check should be about 0 (see Solver checks). A
   large `reach_error_mm` means a hand or foot cannot reach its target; bend
   that limb more in the pose. Then look at stills for hands or body passing
   through the equipment.
4. Write the fault as overrides of the joints that go wrong.
5. Render both variants and add one line for the clip in `mobile/src/domain/media.ts`.
