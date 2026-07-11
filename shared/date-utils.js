(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DateUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  return {
    // Return ISO week number for a Date object
    getISOWeekNumberFromDate: function(d) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      // Thursday in current week decides the year
      date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
      return weekNo;
    },

    // Compute grid start date (Sunday) for month grid
    getMonthGridStart: function(year, month) {
      const first = new Date(year, month, 1);
      const start = new Date(first);
      start.setDate(start.getDate() - start.getDay());
      return start;
    }
  };
});
