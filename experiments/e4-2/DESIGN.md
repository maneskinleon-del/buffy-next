# E4.2 — Freshness Gating Experiment Design

## Objective

Validate that the freshness gating implementation:
1. Never sends STALE relevant data as fresh
2. Successfully refreshes stale relevant fields
3. Maintains baseline behavior for fresh data

## Setup

### Adapter
- LinuxAdapter (real system measurements)
- No mocking (real OS data)

### Queries
- 5 fresh queries (CPU, RAM, temperature, processes)
- 5 stale queries (disk, GPU, network, storage, internet)

### Protocol
1. Run 3 iterations of each query
2. For stale cases, wait 5 seconds between fresh and stale runs
3. Record: observations, refresh required, refresh performed, staleness state

## Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| staleRelevantSentAsFresh | STALE + relevant + sent as fresh | = 0 |
| refreshSuccessRate | refreshPerformed / refreshRequired | ≥ 0.90 |
| freshContextBehavior | Fresh cases pass unchanged | ≈ baseline |

## Pass Criteria

- `staleRelevantSentAsFresh = 0`
- `refreshSuccessRate ≥ 0.90`
- No regression in fresh context behavior
