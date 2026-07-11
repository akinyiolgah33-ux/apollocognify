// holidays-data.js
const holidaysData = [
    { date: '2024-01-01', name: 'New Year\'s Day', type: 'international' },
    { date: '2024-02-14', name: 'Valentine\'s Day', type: 'international' },
    { date: '2024-03-17', name: 'St. Patrick\'s Day', type: 'international' },
    { date: '2024-04-22', name: 'Earth Day', type: 'international' },
    { date: '2024-05-01', name: 'Labor Day', type: 'international' },
    { date: '2024-07-04', name: 'Independence Day', type: 'national' },
    { date: '2024-10-31', name: 'Halloween', type: 'international' },
    { date: '2024-11-11', name: 'Veterans Day', type: 'national' },
    { date: '2024-11-28', name: 'Thanksgiving', type: 'national' },
    { date: '2024-12-25', name: 'Christmas Day', type: 'international' },
    { date: '2024-12-31', name: 'New Year\'s Eve', type: 'international' },
    // 2025 dates for future proofing
    { date: '2025-01-01', name: 'New Year\'s Day', type: 'international' },
    { date: '2025-02-14', name: 'Valentine\'s Day', type: 'international' },
    { date: '2025-03-17', name: 'St. Patrick\'s Day', type: 'international' },
    { date: '2025-04-22', name: 'Earth Day', type: 'international' },
    { date: '2025-05-01', name: 'Labor Day', type: 'international' },
    { date: '2025-07-04', name: 'Independence Day', type: 'national' },
    { date: '2025-10-31', name: 'Halloween', type: 'international' },
    { date: '2025-11-11', name: 'Veterans Day', type: 'national' },
    { date: '2025-11-27', name: 'Thanksgiving', type: 'national' },
    { date: '2025-12-25', name: 'Christmas Day', type: 'international' },
    { date: '2025-12-31', name: 'New Year\'s Eve', type: 'international' }
];

window.holidaysData = holidaysData;

window.HolidayCalendar = {
    getHolidaysForDay(year, monthIndex, day, filter = 'all') {
        const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return holidaysData.filter((holiday) => {
            if (holiday.date !== dateKey) return false;
            if (filter === 'all') return true;
            return holiday.type === filter;
        });
    },
    getWeekStartDate(year, monthIndex, day) {
        const date = new Date(year, monthIndex, day);
        const start = new Date(date);
        start.setDate(date.getDate() - date.getDay());
        return start;
    }
};
