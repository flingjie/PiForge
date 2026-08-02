# Design Rubric Checklist

Constitution v3 rubric converted to a scoring checklist. Score each dimension as **poor/ok/good**.
Use during `writing-plans` (self-check) and `design-arena` (debate anchor).

| # | Dimension | Weight | Poor | Ok | Good |
|---|-----------|--------|------|----|------|
| 1 | **Decoupling** | 25 | Modules tightly coupled; change in one forces change in others; serial execution required | Most modules independent; some coupling across module boundaries; partial parallelization possible | Fully decoupled; modules communicate only through defined interfaces; maximum concurrency |
| 2 | **Maintainability** | 15 | Hard to change behavior safely; high risk of regression; no clear separation of concerns | Changes require moderate effort; some risk of side effects; basic separation of concerns | Safe, isolated changes; clear module boundaries; low regression risk |
| 3 | **Extensibility** | 15 | Adding capabilities requires rewriting core logic; no extension points | New capabilities need moderate refactoring; some extension points exist | Plugin/strategy pattern; new capabilities added without touching core |
| 4 | **Testability** | 15 | Cannot test in isolation; requires full system setup; no contract tests | Most modules testable with moderate mocking; contract tests for key interfaces | Every module independently verifiable; contract tests for all interfaces; fast test suite |
| 5 | **Observability** | 10 | Internal state invisible; no structured logging; no trace propagation | Basic logging present; some trace IDs; key metrics tracked | Full structured logging with trace IDs everywhere; dashboards; debug toggle |
| 6 | **Performance** | 5 | Obvious bottlenecks; no concurrency; blocking I/O | Acceptable performance; some concurrency; basic async patterns | Optimized hot paths; structured concurrency; rate limiting; no unnecessary work |
| 7 | **Implementation Complexity** | 5 | Over-engineered; excessive abstraction; more code than needed | Appropriate abstraction level; some unnecessary indirection | Minimal code; right abstractions; no unused generality |
| 8 | **AI Coding Friendliness** | 5 | Hard to navigate; inconsistent patterns; no CLAUDE.md guidance | Basic project docs; AI can navigate with effort; some conventions documented | Clear conventions; explicit interfaces; AI can modify confidently |
| 9 | **Concurrency** | 5 | All work serialized; no parallel execution possible | Some parallel groups; moderate dependency chains | Maximum concurrency; minimal dependency chains; independent work streams identified |

## Scoring Summary

```
Plan: [plan name]
Date: [date]

| Dimension | Score | Notes |
|-----------|-------|-------|
| Decoupling (25) |   |   |
| Maintainability (15) |   |   |
| Extensibility (15) |   |   |
| Testability (15) |   |   |
| Observability (10) |   |   |
| Performance (5) |   |   |
| Complexity (5) |   |   |
| AI Friendliness (5) |   |   |
| Concurrency (5) |   |   |

Weighted Score: [sum(weight * score_numeric)] / 100
Pass: all dimensions >= "ok"
```

## Score Numeric Mapping

- poor = 0
- ok = 0.5
- good = 1.0

Weighted score >= 0.5 = pass. Any "poor" dimension requires revision before execution.
