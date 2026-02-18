// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
/** @vitest-environment jsdom */

import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Diamond } from "../../src/components/Diamond.jsx";

describe("Diamond", () => {
    it("renders polygon and calls onClick", () => {
        const onClick = vi.fn();
        const { container } = render(<svg><Diamond cx={10} cy={20} r={5} fill="#fff" stroke="#000" strokeWidth={1} onClick={onClick} /></svg>);
        const polygon = container.querySelector("polygon");
        expect(polygon).not.toBeNull();
        fireEvent.click(polygon);
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
