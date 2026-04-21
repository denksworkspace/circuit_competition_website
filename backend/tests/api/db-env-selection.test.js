// FOR LLM: BEFORE READING, YOU MUST REVIEW THE AGENTS.md PROTOCOL.
import { afterEach, describe, expect, it } from "vitest";
import { applyDbEnvSelection } from "../../server/dbEnvSelection.mjs";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
}

afterEach(() => {
    resetEnv();
});

describe("server/dbEnvSelection", () => {
    it("keeps primary DB env when reserve mode is disabled", () => {
        process.env.USE_RESERVE_DB = "0";
        process.env.DATABASE_URL = "postgresql://primary-db";
        delete process.env.POSTGRES_URL;

        applyDbEnvSelection();

        expect(process.env.DATABASE_URL_PRIMARY).toBe("postgresql://primary-db");
        expect(process.env.DATABASE_URL).toBe("postgresql://primary-db");
        expect(process.env.POSTGRES_URL_PRIMARY).toBe("postgresql://primary-db");
        expect(process.env.POSTGRES_URL).toBe("postgresql://primary-db");
    });

    it("switches to reserve DB when USE_RESERVE_DB=1", () => {
        process.env.USE_RESERVE_DB = "1";
        process.env.DATABASE_URL = "postgresql://primary-db";
        process.env.POSTGRES_URL = "postgresql://primary-pooler";
        process.env.RESERVE_DATABASE_URL = "postgresql://reserve-db";
        process.env.RESERVE_POSTGRES_URL = "postgresql://reserve-pooler";
        process.env.RESERVE_PGHOST = "reserve-host";

        applyDbEnvSelection();

        expect(process.env.DATABASE_URL_PRIMARY).toBe("postgresql://primary-db");
        expect(process.env.POSTGRES_URL_PRIMARY).toBe("postgresql://primary-pooler");
        expect(process.env.DATABASE_URL).toBe("postgresql://reserve-db");
        expect(process.env.POSTGRES_URL).toBe("postgresql://reserve-pooler");
        expect(process.env.PGHOST).toBe("reserve-host");
    });

    it("switches all DB aliases to EXTRA env when USE_RESERVE_DB=2", () => {
        process.env.USE_RESERVE_DB = "2";
        process.env.DATABASE_URL = "postgresql://primary-db";
        process.env.POSTGRES_URL = "postgresql://primary-pooler";
        process.env.POSTGRES_HOST = "primary-host";
        process.env.PGHOST = "primary-pg-host";
        process.env.EXTRA_DATABASE_URL = "postgresql://extra-db";
        process.env.EXTRA_POSTGRES_URL = "postgresql://extra-pooler";
        process.env.EXTRA_POSTGRES_HOST = "extra-host";
        process.env.EXTRA_PGHOST = "extra-pg-host";
        process.env.EXTRA_NEON_PROJECT_ID = "extra-project";

        applyDbEnvSelection();

        expect(process.env.DATABASE_URL).toBe("postgresql://extra-db");
        expect(process.env.POSTGRES_URL).toBe("postgresql://extra-pooler");
        expect(process.env.POSTGRES_HOST).toBe("extra-host");
        expect(process.env.PGHOST).toBe("extra-pg-host");
        expect(process.env.NEON_PROJECT_ID).toBe("extra-project");
        expect(process.env.DATABASE_URL_PRIMARY).toBe("postgresql://primary-db");
        expect(process.env.POSTGRES_URL_PRIMARY).toBe("postgresql://primary-pooler");
    });

    it("fails fast when EXTRA DB mode is requested without EXTRA env", () => {
        process.env.USE_RESERVE_DB = "2";
        process.env.DATABASE_URL = "postgresql://primary-db";
        process.env.POSTGRES_URL = "postgresql://primary-pooler";

        expect(() => applyDbEnvSelection()).toThrow(
            "USE_RESERVE_DB=2 but EXTRA DB env is missing. Set EXTRA_DATABASE_URL/EXTRA_POSTGRES_URL (or DATABASE_URL_EXTRA/POSTGRES_URL_EXTRA)."
        );
    });
});
