# Collector performance benchmark

Run the reproducible 40-level, 100-excluded-segment workload with:

```bash
npm run benchmark:collector
```

The benchmark runs the pre-fix visibility-first path and the optimized
predicate-first path against the same generated DOM. It reports elapsed time
and `getComputedStyle` calls for 20 repeated scans. Override the workload with
`TRANSLIGHT_BENCHMARK_DEPTH`, `TRANSLIGHT_BENCHMARK_SEGMENTS`, and
`TRANSLIGHT_BENCHMARK_ITERATIONS` when investigating a different page shape.

The expected result is `false` for both cases. The optimized path should make
zero style calls when every descendant is rejected by the segment predicate.
