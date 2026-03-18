/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaintenanceScreen } from "../../src/components/app/MaintenanceScreen.jsx";

describe("MaintenanceScreen", () => {
    it("shows maintenance message from props", () => {
        render(<MaintenanceScreen message="Maintenance message from admin panel" />);
        expect(screen.getByText("Maintenance message from admin panel")).toBeInTheDocument();
    });
});
