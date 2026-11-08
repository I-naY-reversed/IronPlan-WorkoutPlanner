# Fitting the app's priors

Scripts that fit the mobile app's model priors, effort weighting and default
volumes from public data. Output: `../mobile/src/domain/fitted-priors.json`.

## Data (downloaded to `data/`, not committed)

| File | Source | License |
|---|---|---|
| `pelland_extracted.xlsx` | Pelland et al., weekly volume meta-regression, [OSF 6z3xu](https://osf.io/6z3xu/) | Public, no license stated (copyright retained); used for analysis only |
| `robinson_ptf.xlsx` | Robinson et al. 2024, proximity to failure, [OSF 7knsj](https://osf.io/7knsj/) | Public, no license stated; used for analysis only |
| `steele_polito_rt.csv` | Steele et al. 2023, variation meta-analysis, [OSF 2h9ma](https://osf.io/2h9ma/) / GitHub | CC-BY 4.0 |
| `openipf-latest.zip` | [OpenPowerlifting](https://openpowerlifting.gitlab.io/opl-csv/) drug-tested IPF subset | Public domain |
| `free-exercise-db.json` | [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) | Unlicense |

Published values used directly: Halperin et al. (RIR under-prediction 0.95),
Grgic et al. 2020 (1RM test-retest CV median 4.2%, range 0.5–12.1%),
Androulakis-Korakakis et al. 2021 (powerlifting frequency, loads, sets).

## Run

```bash
uv sync
uv run scripts/fit_indirect.py
uv run scripts/fit_session.py
uv run scripts/fit_session_boot.py
uv run scripts/fit_multilevel.py
uv run scripts/fit_rir.py
uv run scripts/fit_individual.py
uv run scripts/fit_opl.py
uv run scripts/fit_opl_long.py
uv run scripts/fit_strength_levels.py
uv run scripts/fit_records.py
uv run scripts/check_matrix.py
uv run scripts/assemble_priors.py
uv run scripts/backtest_opl_data.py
```

`fit_volume.py` and `fit_power.py` are earlier within-study-only fits kept for
comparison; they were not used because the curve shape was not identifiable
without between-study information.