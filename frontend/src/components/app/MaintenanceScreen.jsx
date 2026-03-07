import { useEffect, useMemo, useRef, useState } from "react";

const SVG_SIZE = 220;
const PADDING = 28;
const AXIS_MIN = PADDING;
const AXIS_MAX = SVG_SIZE - PADDING;

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePoints() {
    const count = randomInt(10, 15);
    const points = [];
    for (let i = 0; i < count; i += 1) {
        points.push({
            x: randomInt(12, 92),
            y: randomInt(12, 92),
        });
    }
    return points;
}

function computePareto(pointsRaw) {
    const points = Array.isArray(pointsRaw) ? pointsRaw : [];
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    let bestY = Infinity;
    const front = [];
    for (const point of sorted) {
        if (point.y < bestY) {
            front.push(point);
            bestY = point.y;
        }
    }
    return front;
}

function toSvgX(value) {
    return AXIS_MIN + (value / 100) * (AXIS_MAX - AXIS_MIN);
}

function toSvgY(value) {
    return AXIS_MAX - (value / 100) * (AXIS_MAX - AXIS_MIN);
}

function buildPath(frontRaw) {
    const front = Array.isArray(frontRaw) ? frontRaw : [];
    if (front.length === 0) return "";
    const parts = front.map((point, index) => {
        const x = toSvgX(point.x);
        const y = toSvgY(point.y);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    });
    return parts.join(" ");
}

function getPointAlongPareto(frontRaw, progressRaw) {
    const front = Array.isArray(frontRaw) ? frontRaw : [];
    if (front.length === 0) return { x: AXIS_MIN, y: AXIS_MAX };
    if (front.length === 1) {
        return { x: toSvgX(front[0].x), y: toSvgY(front[0].y) };
    }

    const progress = Math.max(0, Math.min(1, Number(progressRaw) || 0));
    const segments = [];
    let totalLength = 0;
    for (let i = 1; i < front.length; i += 1) {
        const x1 = toSvgX(front[i - 1].x);
        const y1 = toSvgY(front[i - 1].y);
        const x2 = toSvgX(front[i].x);
        const y2 = toSvgY(front[i].y);
        const len = Math.hypot(x2 - x1, y2 - y1);
        segments.push({ x1, y1, x2, y2, len });
        totalLength += len;
    }
    if (totalLength <= 0) return { x: toSvgX(front[0].x), y: toSvgY(front[0].y) };

    let target = totalLength * progress;
    for (const seg of segments) {
        if (target <= seg.len) {
            const t = seg.len > 0 ? target / seg.len : 0;
            return {
                x: seg.x1 + (seg.x2 - seg.x1) * t,
                y: seg.y1 + (seg.y2 - seg.y1) * t,
            };
        }
        target -= seg.len;
    }
    const last = segments[segments.length - 1];
    return { x: last.x2, y: last.y2 };
}

export function MaintenanceScreen() {
    const [points, setPoints] = useState(() => generatePoints());
    const pareto = useMemo(() => computePareto(points), [points]);
    const pathD = useMemo(() => buildPath(pareto), [pareto]);
    const pathRef = useRef(null);
    const [pathLength, setPathLength] = useState(1);
    const [progress, setProgress] = useState(0);
    const pencilAngleDeg = 120;

    useEffect(() => {
        const pathNode = pathRef.current;
        if (!pathNode) return;
        try {
            setPathLength(Math.max(1, pathNode.getTotalLength()));
        } catch {
            setPathLength(1);
        }
    }, [pathD]);

    useEffect(() => {
        let frameId = 0;
        let startMs = 0;
        let restartTimer = 0;
        const durationMs = 3400;
        function step(ts) {
            if (!startMs) startMs = ts;
            const elapsed = ts - startMs;
            const next = Math.min(1, elapsed / durationMs);
            setProgress(next);
            if (next < 1) {
                frameId = requestAnimationFrame(step);
                return;
            }
            restartTimer = window.setTimeout(() => {
                setPoints(generatePoints());
                setProgress(0);
            }, 650);
        }
        frameId = requestAnimationFrame(step);
        return () => {
            cancelAnimationFrame(frameId);
            if (restartTimer) window.clearTimeout(restartTimer);
        };
    }, [pathD]);

    const dashOffset = Math.max(0, pathLength * (1 - progress));
    const pencilPosition = useMemo(() => getPointAlongPareto(pareto, progress), [pareto, progress]);

    return (
        <div className="maintenanceScreen">
            <div className="maintenanceContent">
                <h1 className="maintenanceTitle">
                    Technical maintenance is in progress, please try again in 5-10 minutes.
                </h1>
                <div className="maintenanceSketchWrap" aria-hidden="true">
                    <svg className="maintenanceSketch" viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
                        <rect x="0" y="0" width={SVG_SIZE} height={SVG_SIZE} rx="12" className="maintenanceBg" />
                        <line x1={AXIS_MIN} y1={AXIS_MAX} x2={AXIS_MAX} y2={AXIS_MAX} className="maintenanceAxis" />
                        <line x1={AXIS_MIN} y1={AXIS_MAX} x2={AXIS_MIN} y2={AXIS_MIN} className="maintenanceAxis" />

                        {points.map((point, index) => (
                            <circle
                                key={`pt-${index}`}
                                cx={toSvgX(point.x)}
                                cy={toSvgY(point.y)}
                                r="3.1"
                                className="maintenancePoint"
                            />
                        ))}

                        <path
                            ref={pathRef}
                            d={pathD}
                            className="maintenancePareto"
                            style={{
                                strokeDasharray: pathLength,
                                strokeDashoffset: dashOffset,
                            }}
                        />

                        <g
                            transform={`translate(${pencilPosition.x},${pencilPosition.y}) rotate(${pencilAngleDeg})`}
                            className="maintenancePencil"
                        >
                            <rect x="-22.4" y="-2.45" width="3.4" height="4.9" rx="1.1" className="maintenancePencilEraser" />
                            <rect x="-19" y="-2.45" width="1.8" height="4.9" rx="0.6" className="maintenancePencilFerrule" />
                            <rect x="-17.5" y="-2.2" width="13.8" height="4.4" rx="1.5" className="maintenancePencilBody" />
                            <polygon points="0,0 -3.7,-2.2 -3.7,2.2" className="maintenancePencilWood" />
                            <polygon points="0,0 -1.6,-0.95 -1.6,0.95" className="maintenancePencilLead" />
                        </g>
                    </svg>
                </div>
            </div>
        </div>
    );
}
