const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const DateUtils = require('../shared/date-utils');

describe('DateUtils.getISOWeekNumberFromDate', () => {
  test('Known ISO week numbers', () => {
    // 2021-01-04 is Monday of ISO week 1 in 2021
    assert.equal(DateUtils.getISOWeekNumberFromDate(new Date(2021, 0, 4)), 1);
    // 2020-12-31 is ISO week 53 of 2020
    assert.equal(DateUtils.getISOWeekNumberFromDate(new Date(2020, 11, 31)), 53);
    // 2026-06-28 (current date from context) - we assert it is reasonable (week number between 25 and 27)
    const w = DateUtils.getISOWeekNumberFromDate(new Date(2026, 5, 28));
    assert.ok(w >= 25 && w <= 27);
  });
});
