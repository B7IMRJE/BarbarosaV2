export const DISPATCH_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
    const hour = Math.floor(index / 2);
    const minute = index % 2 ? 30 : 0;
    return {
        value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        label: new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
});

function localStart(date: string, time: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const value = new Date(`${date}T${time}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
}

export function scheduleEnd(date: string, startTime: string, duration: number | null) {
    const start = localStart(date, startTime);
    if (!start || duration === null || duration <= 0) return { time: '', nextDay: false };
    const end = new Date(start.getTime() + duration * 60000);
    return {
        time: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
        nextDay: end.toDateString() !== start.toDateString(),
    };
}

// Match the existing local-time start and elapsed-minute end_at persistence.
export function durationForEnd(date: string, startTime: string, endTime: string) {
    const start = localStart(date, startTime);
    const end = localStart(date, endTime);
    if (!start || !end) return null;
    if (end <= start) end.setDate(end.getDate() + 1);
    return Math.round((end.getTime() - start.getTime()) / 60000);
}
