# One HazeSignal day, explained

This example uses **19 September 2025**. It shows what the project calculated and why a plausible-looking fire-and-wind idea still failed to warn on this occasion.

## The question

At the **end of 19 September**, could the fire-and-wind signal have warned that PM2.5 at the Taman Tun Dr. Ismail monitor would enter the unhealthy band within the next two days?

## What the project knew that day

| Item | 18 September | 19 September |
| --- | ---: | ---: |
| Satellite hotspot detections | 43 | 420 |
| Wind alignment with Kuala Lumpur | 78% | 67% |
| Wind-aligned hotspots | about 34 | about 282 |

“Wind-aligned hotspots” means **hotspot count × alignment**. For example, `420 × 0.67 ≈ 282`. The calculation treats wind pointing along the simplified route as more relevant than wind pointing away. It does not measure how much smoke was produced.

The live rule adds the last two days:

```text
about 34 + about 282 = about 315
```

Its high-signal threshold, chosen from **2023 fire-and-wind data**, was about **2,221**. Since `315 < 2,221`, the rule would **not** have raised a fire-and-wind clue.

## What the ground monitor measured later

| Date | Daily PM2.5 |
| --- | ---: |
| 19 September | 32.0 µg/m³ |
| 20 September | 53.2 µg/m³ |
| 21 September | 52.5 µg/m³ |

The 20 September value crossed HazeSignal's **50.5 µg/m³ PM2.5-only “unhealthy” boundary**. This is one missed warning opportunity. The same episode also offered a chance to warn on 18 September, which the rule missed.

## What we can and cannot conclude

The rule missed this episode. Even if the wind alignment had been a perfect 100%, the 18–19 September raw hotspot total would have been only `43 + 420 = 463`, still far below 2,221. Changing the wind calculation alone would not have fixed this miss.

The monitor measured particles **at the destination**. It did not identify where those particles came from. The fires may have been too small or outside the selected boxes, or other pollution sources may have contributed. These records cannot tell us which explanation is correct.

This is why the project reports a negative result instead of claiming it can predict haze. A stronger future test needs more seasons, several monitors and better information about particle transport.

## Check your understanding

1. Why is 420 a hotspot **count**, rather than the number of separate fires?
2. Why does multiplying by 67% make a **clue**, rather than a PM2.5 prediction?
3. What does the missed warning tell us about the 2,221 threshold?

**Answers:** (1) One fire can create multiple satellite detections. (2) Wind direction does not measure smoke emissions or ground-level particles. (3) It was too high to trigger for this episode; one example cannot tell us what a better threshold should be or whether a lower threshold would cause too many false alarms.
