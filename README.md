[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Astarya1104/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Astarya1104/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Fast Broken-CSV Reader

An entry for make.fun's "Read broken CSV files faster, 21 November 2026" bounty.

`main.ts` (Node 22) drives `solve.js`, a fast broken-CSV parser: a two-tier scanner that takes clean lines with one `slice` + `split(',')` and scans all other records with native regex searches, so no field is ever built a character at a time. Quoted fields, doubled quotes, CR-to-LF conversion, junk-after-close, and unterminated quotes all mirror the reference exactly — 224/224 hand-built edge cases match, and the parse runs ~3.09× faster than the house baseline.
