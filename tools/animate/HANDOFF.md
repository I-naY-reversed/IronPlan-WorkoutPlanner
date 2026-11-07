# Handoff: exercise animation pilot

Written for an agent starting cold on Benjamin's Mac, which is the only working
machine for this project (Apple M1, 8 cores, 16 GB, macOS). The checkout is
`/Users/benjaminkaganovitch/code/IronPlan-WorkoutPlanner`. Read this first, then
`tools/animate/README.md` for the full spec format.

House rules for this repo:

- Every commit is authored only as Benjamin Kaganovitch
  <benjamink432@gmail.com>. Never add Co-Authored-By or any Claude lines to
  commits or PRs.
- No em dashes in anything you write (code, comments, docs, UI copy, commit
  messages).
- Don't push or open a PR until Benjamin says so. Stop and show results at
  each review point.

## 1. What exists

Branch `exercise-animation-pilot`, cut from `free-weights-and-technique-research`.
Everything is in `tools/animate/`. The app (`mobile/`) is unchanged so far.

The pipeline renders short looping technique clips for the How-to sheet in the
app. A matte clay mannequin on a dark backdrop has glowing lines along the
working limbs. Each exercise has a **correct** clip (green lines, check badge)
and a **fault** clip (red-orange lines, cross badge) showing the common mistake
listed in `mobile/src/domain/technique.ts`. A new exercise is one JSON spec,
not new code.

| File | Role |
| --- | --- |
| `render.py` | Entry point, run inside Blender. Builds the scene, solves, renders, encodes |
| `rig.py` | Procedural mannequin (armature plus rigid clay segments) and the pose solver: FK from the spec, analytic two-bone IK for hands on the weight and planted feet |
| `look.py` | Materials, lights, camera fitting, backdrop, equipment meshes, glow lines, compositor |
| `spec.py` | Loads and validates specs (plain Python, no Blender). `python spec.py` checks them all |
| `badge.py` | Draws the check and cross badges as PNGs, no dependencies |
| `toolpaths.py` | Finds `blender` and `ffmpeg` on PATH or via the `BLENDER` / `FFMPEG` environment variables |
| `render_all.py` | Renders every spec and both variants (any OS) |
| `render_all.sh` | Same, from bash |
| `test_spec.py` | Unit tests for the spec format |
| `specs/*.json` | Shipped specs (only `overhead_triceps_extension.json` so far) |
| `specs/drafts/goblet_squat.json` | Draft second exercise. It solves cleanly (planted feet, heel lift fault) but has never been rendered or reviewed. Drafts are not picked up by `render_all` |

### Pose spec format, in short

Full reference: README.md, "Spec format". A spec has:

- `id`, matching an id in `mobile/src/domain/exercises.ts` (a test checks this)
- `equipment`: type (`dumbbell`, `barbell`, `none`), hold (`two_hand_cup`,
  `two_hand_bar`, `each_hand`), axis, grip width, offset, hand direction
- `poses`: `start`, `end` and optional others. Each maps bones to `[x, y, z]`
  degrees about the body's axes, relative to the rest pose (standing, arms
  hanging, palms in) and stacked down the chain. `upper_arm.*` mirrors to both
  sides. `inherit`, `hips_offset` and `heel_lift` are supported
- `phases`: timing in seconds per move, the last one returning to `start` so
  the loop closes
- `camera`: azimuth (180 = from behind), elevation, lens, margin, optional
  upper-body crop `min_z`. The camera fits the motion of both variants
- `glow`: which bones get lines
- `variants.fault`: per-pose bone overrides for the mistake

### How to run (from the repo root)

```bash
python3 tools/animate/toolpaths.py                     # confirms blender and ffmpeg are found
python3 -m unittest tools/animate/test_spec.py         # 11 tests, no Blender needed
python3 tools/animate/spec.py                          # validates every spec
python3 tools/animate/render_all.py --samples 48       # both clips into tools/animate/out (gitignored)
python3 tools/animate/render_all.py --solve-only       # solver checks only, a few seconds
python3 tools/animate/render_all.py --variant fault --stills 0,30,60   # quick look at frames
```

`tools/animate/render_all.sh` does the same from bash. One clip directly:

```bash
blender --background --python tools/animate/render.py -- --spec tools/animate/specs/overhead_triceps_extension.json --variant correct --out tools/animate/out --samples 48
```

### Current state

- The overhead triceps extension clips work. Every solver check is zero on
  every frame: no reach error, hands never slide or turn on the weight, feet
  never slide. A separate per-frame check found no hand or body vertices
  inside the dumbbell (that check is not in the repo; the solver checks cannot
  detect intersections, so look at stills).
- On the Mac (M1, Eevee on Metal, 48 samples) each clip took about 2 minutes
  for 102 frames: about 61 KB (correct) and 81 KB (fault), plus a 68 KB poster.
- Output is 540x960, 30 fps, 3.4 s loop, H.264 High, yuv420p tagged BT.709,
  `+faststart`, no audio, CRF 28.
- An independent review found 18 issues, and all were fixed. The two worst
  were hands passing through the dumbbell and the backdrop wall sitting behind
  the camera.
- **Weak points:** the procedural mannequin looks like a Lego figure, and the
  renders are low resolution. That is what the plan below fixes.
- Nothing in `mobile/` has been changed yet. See section 6 for the app
  integration still to do.

## 2. The plan

### Step 1. Sculpt (done for v1, v2 being evaluated)

`tools/animate/characters/sculpt.glb` (gitignored) was generated on
2026-11-07 from `front.jpeg` and `back.jpeg`. Benjamin approved it.

How it was made, so it can be reproduced:

- Hugging Face Space `tencent/Hunyuan3D-2mv`, endpoint `/shape_generation`
  (shape only, no texture), called from the terminal with `gradio_client` in a
  throwaway venv outside the repo. It ran anonymously with no quota prompt.
  Run `client.view_api()` first; the endpoint and parameter names come from
  there.
- Inputs: `mv_image_front` = `front.jpeg`, `mv_image_back` = `back.jpeg`,
  left, right, `image` and `caption` empty.
- Settings: the Space defaults (Turbo mode: `steps` 5, `guidance_scale` 5.0,
  Standard decode: `octree_resolution` 256, `num_chunks` 8000,
  `check_box_rembg` true), except `seed` fixed at 1234 with
  `randomize_seed` false so the mesh can be reproduced. The Space reported the
  model `hunyuan3d-dit-v2-mv-turbo`.
- The endpoint returns a .glb directly (wrapped in a Gradio update dict:
  the path is in `result[0]['value']`).

What it is:

- One watertight mesh: 60,580 vertices, 121,156 faces in Blender, 0
  non-manifold edges. A-pose, palms forward, facing -Y like the pipeline.
- Height 1.957 units in Hunyuan's normalised space (it fits the model into
  roughly -1 to 1), not metres. **Scale by about 0.91 to reach 1.78 m** when
  lining it up over the MPFB body. Leave the saved file unscaled.

Known issues:

- **Side seam (serious):** a deep, ragged ridge runs down each side, from the
  shoulder blade through the glute into the back of the thigh, where the model
  joined the front and back views. It is plain in a three-quarter rear view.
- The back is softer than the reference: the shoulder blades and lats read
  weakly, and there is a deep groove down the spine. This matters because the
  triceps clips are seen from behind.
- The fingers are partly fused. Irrelevant once the hands are masked out of
  the bake (Step 3).

Fix in progress: `sculpt_v2.glb` is generated with all four views (front, back,
plus left and right cropped from `back_and_sides_draft.jpeg` into `left.jpeg`
and `right.jpeg`). Check views of v1 are in `tools/animate/out/sculpt_check/`,
v2 in `tools/animate/out/sculpt_check_v2/`. Use whichever version Benjamin
picks; if neither is clean, smooth the seam on the sculpt (Smooth brush or a
masked Laplacian Smooth) before baking.

### Step 2. MPFB 2 body

Build an MPFB 2 character in Blender (MPFB is the MakeHuman plugin for
Blender; its output is CC0) with a Rigify rig.

- Match the sculpt's athletic build: shoulder width, chest, arm and leg mass.
- Use the same A-pose as the sculpt, palms forward.
- Save the working file as `tools/animate/characters/mpfb_body.blend`
  (gitignored). Script the build in a new `tools/animate/character.py` where
  possible, so it can be rebuilt.

### Step 3. Bake the sculpt's detail onto the MPFB body

1. Import `sculpt.glb` and line it up over the MPFB body (scale, rotation,
   position). Small pose differences can be fixed with a Shrinkwrap pass or
   by posing the MPFB body to match.
2. Bake the sculpt's muscle detail into a tangent-space normal map on the
   MPFB body: Cycles, Bake, Normal, Selected to Active, with a cage or extrusion
   distance large enough to cover the gap.
3. **Mask the bake** so only the torso, arms and legs take the sculpt's
   detail. Mask out the hands, feet, head and crotch: the MPFB body keeps its
   own clean hands and feet, and the sculpt's fused fingers, feet and head
   never reach the map. One way: a vertex group or texture mask on the MPFB
   body, then mix the baked normal map with a flat normal (0.5, 0.5, 1.0) using
   that mask, with a soft falloff at the wrists, ankles and neck.
4. Check seams at the shoulders, armpits and hips, where the MPFB topology
   deforms most, and along the sculpt's side seam (see Step 1).
5. Save the map as `tools/animate/characters/body_normal.png` (gitignored)
   and use it in the clay material.

Cycles bakes run on the M1 GPU through Metal. `look._enable_cycles_gpu()`
already picks Metal when `--engine cycles` is used.

### Step 4. Drive the MPFB rig with the existing specs and solver

The specs and solver must stay valid. Spec rotations are relative to the
pipeline's canonical rest pose: standing, arms hanging straight down, palms
facing in, character facing -Y with its left on +X. MPFB's rest is an A-pose
with palms forward, so the rest frames differ.

Recommended approach:

1. Map the solver's bones (`hips`, `spine`, `chest`, `neck`, `head`,
   `shoulder`, `upper_arm`, `forearm`, `hand`, `thigh`, `shin`, `foot`, `toe`,
   with `.L`/`.R`) to the Rigify deform bones (`DEF-...`), or to the control
   bones if you drive Rigify's controls.
2. Use the MPFB joint positions for the solver's armature (head and tail per
   bone) instead of the hard-coded `BONE_DEFS` in `rig.py`, but keep the
   canonical rest orientation for the spec maths. In practice: build the
   solver armature in the canonical rest pose with MPFB proportions, solve as
   now, then copy each solved world matrix onto the matching MPFB bone, times a
   fixed per-bone offset that maps canonical rest to MPFB rest. Compute that
   offset once from the two rest poses.
3. Keep `rig.solve()` and its checks unchanged. The equipment, hand lock, IK
   and planted feet all work in the solver's space.
4. A skinned body deforms at extreme angles, unlike the rigid pieces. Check the
   shoulders with arms fully overhead (the triceps start pose) and the elbows
   at the bottom of the triceps clip (about 40 degrees inside angle). Add
   corrective shape keys or Rigify's deform settings if the shoulders collapse.

### Step 5. Re-render at higher quality

- 1080x1920, 30 fps, CRF 22, under 1 MB per clip. Keep `-preset veryfast`
  unless the size target needs `medium`.
- Things that assume 540x960 and must scale by 2: `WIDTH`/`HEIGHT` and
  `BADGE_BOX` in `look.py`, `BADGE_MARGIN` in `render.py`, the badge size
  (default 76 px) in `badge.write_png`, and the glow `radius`. Change the
  `--crf` default in `render.py` to 22.
- Re-check the poster size; the 128-colour palette PNG will grow at 4x the
  pixels.

## 3. Look notes for the new renders

- Keep the check and X badges burned into the video.
- Remove the joint dots (`glow.joints` default, and the dot code in
  `look.build_glow`).
- Make the glow lines thinner.
- Add a tint on the working muscle (for example the triceps in green or
  red-orange, matching the variant), probably as a mask texture or vertex group
  on the MPFB body mixed into the clay material.
- Make sure the back reads clearly from behind: the triceps camera is directly
  behind the figure, so the back, shoulder blades and the backs of the arms
  need shape and rim light.

## 4. Licences

- MPFB 2 output (the character mesh and rig) is CC0.
- Hunyuan3D 2's licence is fine for use in Canada but excludes the EU, the UK
  and South Korea. Don't distribute anything made with it into those regions
  without checking again.
- Never commit reference images or third-party models.
  `tools/animate/characters/` is gitignored for exactly this. Rendered clips go
  in `tools/animate/out/` (also gitignored) until Benjamin approves them for
  `mobile/assets/exercises/`.
- Record the source and licence of every character asset in
  `tools/animate/README.md` (section "Character and licence"; it currently
  describes the procedural mannequin).

## 5. Reference images

`tools/animate/characters/reference/` holds `front.jpeg`, `back.jpeg` and
`back_and_sides_draft.jpeg` (and `left.jpeg` / `right.jpeg` once cropped). They
are not in git. Don't upload them anywhere except as Benjamin asks (they were
sent to the Hunyuan3D Space at his request to make the sculpt).

## 6. Still to do in the app (from the original brief, not started)

After Benjamin approves the clips:

1. `npx expo install expo-video` in `mobile/` (keeps the project's Expo SDK, currently 58).
2. Clips go in `mobile/assets/exercises/<exerciseId>.<variant>.mp4`, posters next to them.
3. Add `mobile/src/domain/media.ts` mapping exercise ids to their clips, so adding a clip is one line.
4. In the How-to sheet (`MusclesSheet` in `mobile/src/app/log.tsx`), show the
   correct clip at the top: muted, looping, autoplay, no controls, with the
   poster while loading. Add a small "Show common mistake" toggle that swaps to
   the fault clip. When the OS reduce-motion setting is on, show the poster and
   let a tap play it. Exercises without a clip keep the current layout exactly.
   Add accessibility labels describing the movement.
5. Jest tests: media.ts only references real exercise ids, every mapped file
   exists on disk, and the sheet still renders without a clip.
6. `npx jest`, `npx tsc --noEmit` and `npx expo lint` must show nothing new failing.
7. Review point: run the app and screenshot the sheet with the clip and the
   toggle. Only the Xcode Command Line Tools are installed (no full Xcode, no
   iOS Simulator), so use `npx expo start --web` unless Benjamin installs Xcode.
8. Stretch: render and review `specs/drafts/goblet_squat.json` (correct: full
   depth, chest up; fault: heels lifting), then move it into `specs/`.

Baseline on this branch, Mac, Node 22.23.4: `npm ci` clean, `npx jest` 279 of
279 tests passing (35 suites), `npx tsc --noEmit` with only 6 pre-existing
errors: 5 in `src/domain/__sim__/` (implicit any) and 1 for the `@/global.css`
import in `src/constants/theme.ts`.

## 7. Mac setup (already done)

Installed with Homebrew on this Mac:

| Tool | Where | Notes |
| --- | --- | --- |
| Blender 5.2.3 LTS | `/opt/homebrew/bin/blender` | `brew install --cask blender`. Eevee runs headless on Metal |
| ffmpeg | `/opt/homebrew/bin/ffmpeg` | `brew install ffmpeg`, has libx264 |
| Node 22.23.4 | `/opt/homebrew/opt/node@22/bin` | `brew install node@22`. Keg-only: prefix PATH with `/opt/homebrew/opt/node@22/bin` before `npm` / `npx` |
| Python 3.11 | `python3` | for `spec.py`, the tests and `render_all.py` |
| Git | `git` | `user.name` / `user.email` already set to Benjamin |

Quick health check from the repo root:

```bash
python3 tools/animate/toolpaths.py
python3 -m unittest tools/animate/test_spec.py
python3 tools/animate/render_all.py --solve-only
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
(cd mobile && npx jest && npx tsc --noEmit)
```

The Windows support in the code (`render_all.py`, `toolpaths.py`, pathlib,
`.gitattributes`) stays; it is harmless on the Mac.

## 8. Open questions for Benjamin

1. Triceps range of motion: the current clip lowers to a deep stretch (about
   40 degrees inside angle at the elbow). The alternative is stopping at 90
   degrees. It is one number: `forearm.*` in the `end` pose of
   `specs/overhead_triceps_extension.json` (`-140` now, about `-90` for 90
   degrees).
2. Framing: upper-body crop (current, `"min_z": 0.8`, arms large on a phone,
   floor mat out of shot) or full body (remove `min_z`, shows the mat and the
   stance, arms smaller).
