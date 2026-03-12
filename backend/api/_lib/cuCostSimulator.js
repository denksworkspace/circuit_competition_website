function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildFixedIntervalEvents({ periodSeconds = 24 * 60 * 60, everySeconds, offsetSeconds = 0 } = {}) {
    const period = Math.max(1, Math.floor(toFiniteNumber(periodSeconds, 24 * 60 * 60)));
    const every = Math.max(1, Math.floor(toFiniteNumber(everySeconds, 60)));
    const offset = Math.max(0, Math.floor(toFiniteNumber(offsetSeconds, 0)));
    const events = [];
    for (let at = offset; at < period; at += every) {
        events.push(at);
    }
    return events;
}

export function calculateActiveSecondsFromEvents({
    eventTimesSeconds,
    periodSeconds = 24 * 60 * 60,
    keepAliveSeconds = 300,
}) {
    const period = Math.max(1, Math.floor(toFiniteNumber(periodSeconds, 24 * 60 * 60)));
    const keepAlive = Math.max(1, Math.floor(toFiniteNumber(keepAliveSeconds, 300)));
    const raw = Array.isArray(eventTimesSeconds) ? eventTimesSeconds : [];
    const points = raw
        .map((value) => Math.floor(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 0 && value < period)
        .sort((a, b) => a - b);
    if (points.length === 0) return 0;

    let activeSeconds = 0;
    let windowStart = points[0];
    let windowEnd = Math.min(period, windowStart + keepAlive);

    for (let index = 1; index < points.length; index += 1) {
        const point = points[index];
        const endCandidate = Math.min(period, point + keepAlive);
        if (point <= windowEnd) {
            windowEnd = Math.max(windowEnd, endCandidate);
            continue;
        }
        activeSeconds += Math.max(0, windowEnd - windowStart);
        windowStart = point;
        windowEnd = endCandidate;
    }

    activeSeconds += Math.max(0, windowEnd - windowStart);
    return Math.min(period, activeSeconds);
}

export function estimateModeCu({
    eventTimesSeconds = [],
    periodSeconds = 24 * 60 * 60,
    keepAliveSeconds = 300,
    cuPerActiveHour = 0.25,
} = {}) {
    const period = Math.max(1, Math.floor(toFiniteNumber(periodSeconds, 24 * 60 * 60)));
    const rate = Math.max(0, toFiniteNumber(cuPerActiveHour, 0.25));
    const activeSeconds = calculateActiveSecondsFromEvents({
        eventTimesSeconds,
        periodSeconds: period,
        keepAliveSeconds,
    });
    const activeHours = activeSeconds / 3600;
    const periodHours = period / 3600;
    const cuHours = activeHours * rate;
    return {
        periodSeconds: period,
        periodHours,
        activeSeconds,
        activeHours,
        idleSeconds: Math.max(0, period - activeSeconds),
        idleHours: Math.max(0, periodHours - activeHours),
        cuPerActiveHour: rate,
        cuHours,
    };
}

export function estimateServerCuModes({
    passiveEventTimesSeconds = [],
    activeEventTimesSeconds = [],
    periodSeconds = 24 * 60 * 60,
    keepAliveSeconds = 300,
    cuPerActiveHour = 0.25,
} = {}) {
    return {
        passive: estimateModeCu({
            eventTimesSeconds: passiveEventTimesSeconds,
            periodSeconds,
            keepAliveSeconds,
            cuPerActiveHour,
        }),
        active: estimateModeCu({
            eventTimesSeconds: activeEventTimesSeconds,
            periodSeconds,
            keepAliveSeconds,
            cuPerActiveHour,
        }),
    };
}

