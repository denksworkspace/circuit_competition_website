// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { formatIntNoGrouping } from "../utils/numberUtils.js";

export function CustomTooltip({ active, payload }) {
    if (!active || !payload || payload.length === 0) return null;

    const point = payload[0]?.payload;
    if (!point) return null;

    return (
        <div className="tooltip">
            <div className="tooltipTitle">Point</div>

            <div className="tooltipRow">
                <span className="tooltipKey">benchmark:</span>
                <span className="tooltipVal">{point.benchmark}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">sender:</span>
                <span className="tooltipVal">{point.sender}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">status:</span>
                <span className="tooltipVal">{point.status}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">checker:</span>
                <span className="tooltipVal">{point.checkerVersion || "null"}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">name:</span>
                <span className="tooltipVal">{point.description}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">delay:</span>
                <span className="tooltipVal">{formatIntNoGrouping(point.delay)}</span>
            </div>

            <div className="tooltipRow">
                <span className="tooltipKey">area:</span>
                <span className="tooltipVal">{formatIntNoGrouping(point.area)}</span>
            </div>

            {point.fileName ? (
                <div className="tooltipRow">
                    <span className="tooltipKey">file:</span>
                    <span className="tooltipVal">{point.fileName}</span>
                </div>
            ) : null}
        </div>
    );
}
