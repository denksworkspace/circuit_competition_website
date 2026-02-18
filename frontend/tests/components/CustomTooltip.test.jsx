// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomTooltip } from "../../src/components/CustomTooltip.jsx";

describe("CustomTooltip", () => {
    it("renders null when inactive", () => {
        const { container } = render(<CustomTooltip active={false} payload={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders point data", () => {
        render(
            <CustomTooltip
                active
                payload={[
                    {
                        payload: {
                            benchmark: "254",
                            sender: "team",
                            status: "verified",
                            checkerVersion: null,
                            description: "schema",
                            delay: 10,
                            area: 20,
                            fileName: "bench254_10_20_team_id.bench",
                        },
                    },
                ]}
            />
        );

        expect(screen.getByText("Point")).toBeInTheDocument();
        expect(screen.getByText("254")).toBeInTheDocument();
        expect(screen.getByText("team")).toBeInTheDocument();
        expect(screen.getByText("verified")).toBeInTheDocument();
        expect(screen.getByText("null")).toBeInTheDocument();
        expect(screen.getByText("schema")).toBeInTheDocument();
        expect(screen.getByText("bench254_10_20_team_id.bench")).toBeInTheDocument();
    });
});
