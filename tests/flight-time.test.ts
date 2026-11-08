import { test } from "node:test";
import assert from "node:assert/strict";
import { airportTime, airportZone, flightDuration } from "../src/flightTime";
test("international flight duration uses each airport timezone", () => {
  assert.equal(
    flightDuration({
      from: "NRT",
      to: "SGN",
      departure: "2030-01-01T08:00",
      arrival: "2030-01-01T13:00",
    }),
    "7時間",
  );
  assert.equal(
    flightDuration({
      from: "SGN",
      to: "DAD",
      departure: "2030-01-03T10:15",
      arrival: "2030-01-03T11:40",
    }),
    "1時間25分",
  );
});
test("overnight arrivals and Hong Kong transfer legs are calculated correctly", () => {
  assert.equal(
    flightDuration({
      from: "DAD",
      to: "NRT",
      departure: "2030-01-04T21:30",
      arrival: "2030-01-05T07:40",
    }),
    "8時間10分",
  );
  assert.equal(
    flightDuration({
      from: "DAD",
      to: "HKG",
      departure: "2030-01-04T21:30",
      arrival: "2030-01-05T00:30",
    }),
    "2時間",
  );
  assert.equal(airportZone(" hkg ")?.label, "香港時間");
});
test("unknown airports and invalid or reversed dates never produce guessed duration", () => {
  assert.equal(airportTime("2030-02-30T08:00", "NRT"), null);
  assert.equal(airportTime("2030-01-01T24:00", "NRT"), null);
  assert.equal(
    flightDuration({
      from: "XXX",
      to: "SGN",
      departure: "2030-01-01T08:00",
      arrival: "2030-01-01T13:00",
    }),
    null,
  );
  assert.equal(
    flightDuration({
      from: "SGN",
      to: "DAD",
      departure: "2030-01-03T12:15",
      arrival: "2030-01-03T11:40",
    }),
    null,
  );
});
