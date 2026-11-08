# IronPlan
![CI](https://img.shields.io/github/actions/workflow/status/I-naY-reversed/IronPlan-WorkoutPlanner/ci.yml?branch=main&label=CI)
![Release](https://img.shields.io/github/v/release/I-naY-reversed/IronPlan-WorkoutPlanner?include_prereleases)
![Platform](https://img.shields.io/badge/platform-Android-3DDC84)
![Expo](https://img.shields.io/badge/Expo-SDK%2058-000020)
![License](https://img.shields.io/github/license/I-naY-reversed/IronPlan-WorkoutPlanner)
![Languages](https://img.shields.io/badge/languages-EN%20%7C%20FR%20%7C%20RU-blue)

**The weight for every set, and why.**

Starting weights and plans come from a model fitted to published training studies and powerlifting results, then updated from your own logs. Volume adjustment is experimental.

<img width="100%" alt="IronPlan: the weight for every set, and why." src="marketing/featureGraphic.png" />

## Features
<details open>
<summary><b>Planning</b></summary>

- Automatic, highly customizable plan generation
- Planning around sports (MMA, Muay Thai, etc.)
- Customizable equipment (e.g. create plans for full gyms, bodyweight, custom, ...)
- Choice of split (PPL, upper/lower, full body, custom) and weekly volume
- Lift goals with the chance of reaching them by a date
- Import Hevy or Strong data

</details>

<details open>
<summary><b>In the gym</b></summary>

- Uncertainty for weights
- Warm-up sets, plate loading, rest times
- Previous sets shown while logging
- Exercise swaps; shorter or lighter days
- RPE/RIR per set, drop sets, e1RM tracking
- Instructions for performing exercises and common faults

</details>

<details>
<summary><b>Other</b></summary>

- Bodyweight logging
- Estimated progress plots
- English, French and Russian translations
- Fully offline, no account

</details>

## Gallery

<table>
  <tr>
    <td><img width="100%" alt="Plan screen: each weight with its likely range" src="marketing/01_range.png" /></td>
    <td><img width="100%" alt="Workout screen: the set, warm-ups and previous sets" src="marketing/02_set.png" /></td>
    <td><img width="100%" alt="Rating how hard a set was" src="marketing/03_update.png" /></td>
  </tr>
  <tr>
    <td><img width="100%" alt="Plan built around Muay Thai practice days" src="marketing/04_combat.png" /></td>
    <td><img width="100%" alt="Progress chart with its uncertainty band" src="marketing/05_progress.png" /></td>
    <td><img width="100%" alt="Importing Strong or Hevy history" src="marketing/06_import.png" /></td>
  </tr>
</table>

## Download
Android only for now. Get the APK from [Releases](https://github.com/I-naY-reversed/IronPlan-WorkoutPlanner/releases) and open it on your phone. Android will ask you to allow installs from your browser or file manager the first time.

Current releases are pre-releases.

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22app.bracket.training%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2FI-naY-reversed%2FIronPlan-WorkoutPlanner%22%2C%22author%22%3A%22I-naY-reversed%22%2C%22name%22%3A%22IronPlan%22%2C%22additionalSettings%22%3A%22%7B%5C%22includePrereleases%5C%22%3Atrue%7D%22%7D"><img height="40" alt="Get it on Obtainium" src="marketing/badge_obtainium.png" /></a>

### Build from source
Requires Node 22.

```bash
cd mobile
npm ci
npm run web
npm run android
```

Tests: `npm run typecheck`, `npm run lint`, `npm test`.

## Analysis
We plot the results from a simulation of 90 users over 26 weeks, each with a known optimal weekly dose per muscle. Note, this uses the same priors as the app. Typical refers to typical responders. Atypical users respond much better or much worse than the population average (twice the usual spread; see [analysis/README.md](analysis/README.md) for details).
<table>
<tr>
  <td><img width="100%" alt="Calibration of the app's prescribed weekly volumes" src="analysis/optimization/figures/calibration.png"/></td>
  <td><img width="100%" alt="Failed sets, app vs. double progression" src="analysis/optimization/figures/failed.png"/></td>
</tr>
</table>

The error bars are accurate for typical users (in reference to weekly volume): 68% ranges contained the true value 67% of the time, and 95% ranges 98% of the time. For atypical users they are too narrow (70% at 95%). Volume prescription is still a work in progress. The app did not beat the research default, and deliberately raising and lowering volume did not help it learn a user's response to volume within 26 weeks.

However, against fixed programmes (same users, exercises and starting weights), the app reached the target effort about **two weeks sooner** and had less than **half the failed sets** of double progression (7% vs 17%), with the same strength gains.

<img width="100%" alt="App vs double and linear progression" src="analysis/optimization/figures/versus.png"/>

References may be found at [analysis/references.csv](analysis/references.csv).

### Reproduction
Requires Node 22 and [uv](https://docs.astral.sh/uv/). Each simulation takes about 40 minutes on around-average hardware.
```bash
cd mobile
export SIM_OBS=matched
for l in app double linear; do SIM_LOADS=$l SIM_OUT=../analysis/optimization/results-$l.json npx jest --testMatch '**/__sim__/population.sim.ts'; done
cd ../analysis/optimization
uv run plots.py
uv run versus.py
```

## Translations
The app was made in English, text was translated using Google Translate, then briefly refined by hand. If there is an issue, open an issue or PR.

## Contributing
Report bugs, suggest features by opening an [issue](https://github.com/I-naY-reversed/IronPlan-WorkoutPlanner/issues). PRs welcome. AI can be used, but should be thoroughly checked by hand. User-facing strings should be done by hand and not via AI; inaccuracies in a fitness planning app may be consequential.

## Licenses
[IronPlan](LICENSE); [third-party](mobile/docs/licenses)

## Privacy
All models, data, notifications are entirely local. No data is sent to any server. The application can work entirely offline.

## Health Notice
IronPlan is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a healthcare professional before starting a new training programme, and for medical advice, diagnosis or treatment.
