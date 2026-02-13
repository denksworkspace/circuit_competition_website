export function Diamond({ cx, cy, r, fill, stroke, strokeWidth, onClick }) {
    const distance = r * 1.35;
    const points = `${cx},${cy - distance} ${cx + distance},${cy} ${cx},${cy + distance} ${cx - distance},${cy}`;

    return (
        <polygon
            points={points}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            onClick={onClick}
            tabIndex={-1}
            focusable="false"
            onMouseDown={(event) => event.preventDefault()}
            style={{ cursor: "pointer" }}
        />
    );
}
