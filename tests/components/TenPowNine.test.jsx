/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TenPowNine } from "../../src/components/TenPowNine.jsx";

describe("TenPowNine", () => {
    it("renders exponent notation", () => {
        render(<TenPowNine />);
        expect(screen.getByText("10")).toBeInTheDocument();
        expect(screen.getByText("9")).toBeInTheDocument();
    });
});
