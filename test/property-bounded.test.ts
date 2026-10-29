import assert from "node:assert/strict";
import test from "node:test";
import { asOpaqueCursor, type GetEventsResponse, type WitnessEvent } from "../src/contracts.ts";
import { FixtureGetEventsPort } from "../src/fake-rpc.ts";
import { validateFixture, type GetEventsFixtureV1 } from "../src/fixture.ts";
import { InMemoryObservationRecorder } from "../src/observations.ts";
import { canonicalJson } from "../src/determinism.ts";
import { createReferencePaginationConsumer, createStopOnEmptyConsumer } from "../src/example-consumers.ts";
import { runPaginationScenario } from "../src/scenario.ts";
import { evaluateOracle } from "../src/oracle.ts";
import { reportFromOracle } from "../src/report.ts";

const MAX_CASES = 32;
const MAX_PAGES = 8;

interface GeneratedCase {
  readonly fixture: GetEventsFixtureV1;
  readonly expectedEventIds: readonly string[];
}

function nextRandom(state: { value: number }): number {
  state.value = (state.value * 1664525 + 1013904223) >>> 0;
  return state.value / 0x1_0000_0000;
}

function event(id: string, ledger: number): WitnessEvent {
  return {
    id,
    type: "contract",
    ledger,
    topic: ["transfer"],
    value: `value-${id}`,
  };
}

function generateCase(seed: number): GeneratedCase {
  const state = { value: seed >>> 0 };
  const pageCount = 2 + Math.floor(nextRandom(state) * (MAX_PAGES - 1));
  const pages: Array<GetEventsFixtureV1["pages"][number]> = [];
  const expectedEventIds: string[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const requestKey = index === 0 ? "initial" : `cursor-${seed}-${index}`;
    const hasNext = index < pageCount - 1;
    const includeEvent = index === pageCount - 1 || nextRandom(state) >= 0.35;
    const events = includeEvent ? [event(`event-${seed}-${index}`, 10_000 + index)] : [];
    expectedEventIds.push(...events.map((entry) => entry.id));
    const response: GetEventsResponse = {
      events,
      oldestLedger: 10_000 + index,
      latestLedger: 10_000 + index,
      ...(hasNext ? { cursor: asOpaqueCursor(`cursor-${seed}-${index + 1}`) } : {}),
    };
    pages.push({ requestKey, response });
  }

  const fixture: GetEventsFixtureV1 = {
    schemaVersion: "fixture.v1",
    id: `generated-${seed}`,
    rpcMethod: "getEvents",
    provenance: "synthetic",
    pages,
  };
  validateFixture(fixture);
  return { fixture, expectedEventIds };
}

async function runGeneratedCase(generated: GeneratedCase) {
  const recorder = new InMemoryObservationRecorder();
  return runPaginationScenario({
    expected: { scenarioId: generated.fixture.id, expectedEventIds: generated.expectedEventIds },
    rpc: new FixtureGetEventsPort(generated.fixture),
    consumer: createReferencePaginationConsumer(),
    recorder,
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
    maxPages: MAX_PAGES,
  });
}

test("bounded generated opaque-cursor chains preserve all expected events", async () => {
  for (let seed = 1; seed <= MAX_CASES; seed += 1) {
    const result = await runGeneratedCase(generateCase(seed));
    assert.equal(result.report.status, "pass", `seed ${seed} produced ${canonicalJson(result.report)}`);
    assert.ok(result.pagesObserved <= MAX_PAGES);
    assert.equal(result.terminalPageObserved, true);
  }
});

test("repeated generated scenarios have identical semantic reports", async () => {
  for (let seed = 101; seed < 101 + MAX_CASES; seed += 1) {
    const generated = generateCase(seed);
    const first = await runGeneratedCase(generated);
    const second = await runGeneratedCase(generated);
    assert.equal(canonicalJson(first.report), canonicalJson(second.report), `seed ${seed} was not semantically deterministic`);
  }
});

function shrinkFailingFixture(fixture: GetEventsFixtureV1, remainsFailing: (candidate: GetEventsFixtureV1) => boolean): GetEventsFixtureV1 {
  let current = fixture;
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < current.pages.length; index += 1) {
      const candidatePages = current.pages.filter((_, pageIndex) => pageIndex !== index);
      if (candidatePages.length === 0) continue;
      const candidate = { ...current, pages: candidatePages };
      try {
        validateFixture(candidate);
      } catch {
        continue;
      }
      if (remainsFailing(candidate)) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }
  return current;
}

test("bounded shrinking preserves an actionable empty-page failure", async () => {
  const generated = generateCase(7);
  const pages = [
    { requestKey: "initial", response: { events: [event("before-empty", 1)], oldestLedger: 1, latestLedger: 1, cursor: asOpaqueCursor("after-empty") } },
    { requestKey: "after-empty", response: { events: [], oldestLedger: 2, latestLedger: 2, cursor: asOpaqueCursor("terminal") } },
    { requestKey: "terminal", response: { events: [event("after-empty", 3)], oldestLedger: 3, latestLedger: 3 } },
  ] as const;
  const fixture: GetEventsFixtureV1 = { ...generated.fixture, id: "shrinking-empty-page", pages };
  const expected = { scenarioId: fixture.id, expectedEventIds: ["before-empty", "after-empty"] };
  const remainsActionablyFailing = (candidate: GetEventsFixtureV1): boolean => {
    const [first, second, third] = candidate.pages;
    return candidate.pages.length >= 3
      && first?.response?.events.length === 1
      && second?.response?.events.length === 0
      && second.response.cursor !== undefined
      && third?.response?.events.length === 1
      && third.response.cursor === undefined;
  };

  // The shrink predicate keeps the smallest structural counterexample for the
  // same actionable invariant. The asynchronous consumer run below then proves
  // that the minimized case still produces the expected report violations.
  const minimized = shrinkFailingFixture(fixture, remainsActionablyFailing);
  assert.equal(minimized.pages.length, 3);
  const recorder = new InMemoryObservationRecorder();
  const result = await runPaginationScenario({
    expected,
    rpc: new FixtureGetEventsPort(minimized),
    consumer: createStopOnEmptyConsumer(),
    recorder,
    evaluate: evaluateOracle,
    buildReport: reportFromOracle,
    maxPages: MAX_PAGES,
  });
  assert.equal(result.report.status, "fail");
  assert.ok(result.report.assertions.some((assertion) => assertion.id === "expected-event-delivered"));
  assert.ok(result.report.assertions.some((assertion) => assertion.id === "pagination-terminal-page-observed"));
});
