import {
    buildFixedIntervalEvents,
    estimateServerCuModes,
} from "../api/_lib/cuCostSimulator.js";

function parseNumberArg(name, fallback) {
    const key = `--${name}=`;
    const raw = process.argv.find((item) => item.startsWith(key));
    if (!raw) return fallback;
    const value = Number(raw.slice(key.length));
    return Number.isFinite(value) ? value : fallback;
}

const periodHours = parseNumberArg("period-hours", 24);
const periodSeconds = Math.max(1, Math.floor(periodHours * 3600));
const keepAliveSeconds = Math.max(1, Math.floor(parseNumberArg("keepalive-seconds", 300)));
const cuPerActiveHour = Math.max(0, parseNumberArg("cu-per-active-hour", 0.25));

// Passive mode defaults: no periodic maintenance polling, only sparse DB touches.
const passiveEverySeconds = Math.max(1, Math.floor(parseNumberArg("passive-every-seconds", 3600)));
// Active mode defaults: frequent requests keep DB warm almost continuously.
const activeEverySeconds = Math.max(1, Math.floor(parseNumberArg("active-every-seconds", 30)));

const passiveEventTimesSeconds = buildFixedIntervalEvents({
    periodSeconds,
    everySeconds: passiveEverySeconds,
});
const activeEventTimesSeconds = buildFixedIntervalEvents({
    periodSeconds,
    everySeconds: activeEverySeconds,
});

const projection = estimateServerCuModes({
    passiveEventTimesSeconds,
    activeEventTimesSeconds,
    periodSeconds,
    keepAliveSeconds,
    cuPerActiveHour,
});

process.stdout.write(`${JSON.stringify({
    assumptions: {
        periodHours,
        keepAliveSeconds,
        cuPerActiveHour,
        passiveEverySeconds,
        activeEverySeconds,
    },
    projection,
}, null, 2)}\n`);

