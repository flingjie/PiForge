import { describe, it, expect } from "vitest";
import { detectGaps } from "../../src/arena/gap-detector.js";

const samplePlan = `# Auth Module Design

## Context
We need to add authentication to the API.

## Design Decision: Database Selection
We need to choose a database for storing user credentials and session tokens.

## Design Decision: API Boundary
The auth module will expose endpoints at /api/auth/*. Other services call these endpoints.

## Design Decision: Logging Format
Use JSON structured logging.

## Out of Scope
- OAuth integration
`;

describe("detectGaps", () => {
  it("detects tech_selection from database-related decisions", () => {
    const gaps = detectGaps(samplePlan);
    const dbGap = gaps.find((g) => g.title.includes("Database"));
    expect(dbGap).toBeDefined();
    expect(dbGap?.type).toBe("tech_selection");
    expect(dbGap?.uncertainty).toBe("high");
  });

  it("detects cross_module from API boundary decisions", () => {
    const gaps = detectGaps(samplePlan);
    const apiGap = gaps.find((g) => g.title.includes("API"));
    expect(apiGap).toBeDefined();
    expect(apiGap?.type).toBe("cross_module");
    expect(apiGap?.sourceSection).toContain("API Boundary");
  });

  it("does NOT flag low-risk decisions (logging format)", () => {
    const gaps = detectGaps(samplePlan);
    const logGap = gaps.find((g) => g.title.includes("Logging"));
    expect(logGap).toBeUndefined();
  });

  it("returns empty array for plan with no gaps", () => {
    const boringPlan = `# Simple Script

## Context
A one-off data migration.

## Design Decision: File Format
Use CSV for input and output.
`;
    const gaps = detectGaps(boringPlan);
    expect(gaps).toHaveLength(0);
  });

  it("each gap has a unique id", () => {
    const gaps = detectGaps(samplePlan);
    const ids = gaps.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flags as medium uncertainty when plan marks decision tentative", () => {
    const tentativePlan = `# Plan

## Design Decision: Queue Choice
Need to pick between Kafka and RabbitMQ. Alternative: could use Redis Streams.
`;
    const gaps = detectGaps(tentativePlan);
    expect(gaps[0]?.uncertainty).toBe("medium");
  });
});
