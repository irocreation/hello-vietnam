import { test } from "node:test";
import assert from "node:assert/strict";
import { materialize, toShared, emptyState } from "../src/data";
const hotel = {
  id: "stay",
  name: "Test stay",
  city: "ホーチミン",
  checkin: "2030-01-01T15:00",
  checkout: "2030-01-03T12:00",
  address: "Test address",
  mapUrl: "https://www.google.com/maps",
  url: "",
  booking: "",
  phone: "",
  memo: "15:00以降、12:00まで",
};
test("hotel schedule derives times, location and memo without duplicate persisted events", () => {
  const payload = { ...emptyState(), hotels: [hotel] };
  const state = materialize(payload, []);
  assert.equal(state.events.length, 2);
  assert.equal(state.events[0].hotelId, "stay");
  assert.equal(state.events[0].time, "15:00");
  assert.equal(state.events[1].date, "2030-01-03");
  assert.match(state.events[1].name, /期限/);
  assert.equal(state.events[0].place, "Test address");
  assert.equal(state.events[0].memo, hotel.memo);
  assert.equal(toShared(state).events.length, 0);
  assert.equal(materialize(toShared(state), []).events.length, 2);
});
test("hotel edits update schedule; unknown checkout creates no guessed event", () => {
  const state = materialize(
    {
      ...emptyState(),
      hotels: [{ ...hotel, checkin: "2030-01-02T14:00", checkout: "" }],
    },
    [],
  );
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].date, "2030-01-02");
  assert.equal(state.events[0].time, "14:00");
});
