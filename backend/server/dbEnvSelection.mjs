const DB_ENV_KEYS = [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "NEON_PROJECT_ID",
    "PGDATABASE",
    "PGHOST",
    "PGHOST_UNPOOLED",
    "PGPASSWORD",
    "PGUSER",
    "POSTGRES_DATABASE",
    "POSTGRES_HOST",
    "POSTGRES_PASSWORD",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL_NO_SSL",
    "POSTGRES_USER",
];

function firstNonEmpty(...values) {
    for (const value of values) {
        if (value == null) continue;
        const normalized = String(value).trim();
        if (normalized) return normalized;
    }
    return "";
}

function getDbMode(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "2" || normalized === "extra") return "extra";
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on" || normalized === "reserve") {
        return "reserve";
    }
    return "primary";
}

function readDbEnvSet({ prefix = "", suffix = "", includeBase = false } = {}) {
    const envSet = {};

    for (const key of DB_ENV_KEYS) {
        const value = firstNonEmpty(
            prefix ? process.env[`${prefix}${key}`] : undefined,
            suffix ? process.env[`${key}${suffix}`] : undefined,
            includeBase ? process.env[key] : undefined
        );
        if (value) envSet[key] = value;
    }

    if (!envSet.DATABASE_URL && envSet.POSTGRES_URL) {
        envSet.DATABASE_URL = envSet.POSTGRES_URL;
    }
    if (!envSet.POSTGRES_URL && envSet.DATABASE_URL) {
        envSet.POSTGRES_URL = envSet.DATABASE_URL;
    }

    return envSet;
}

function applyDbEnvSet(envSet) {
    for (const key of DB_ENV_KEYS) {
        delete process.env[key];
    }

    for (const [key, value] of Object.entries(envSet)) {
        process.env[key] = value;
    }

    // @vercel/postgres expects POSTGRES_URL.
    if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
        process.env.POSTGRES_URL = process.env.DATABASE_URL;
    }
}

function assertRequiredDbUrls(mode, envSet) {
    if (envSet.DATABASE_URL && envSet.POSTGRES_URL) return;

    if (mode === "reserve") {
        throw new Error(
            "USE_RESERVE_DB=1 but reserve DB env is missing. Set RESERVE_DATABASE_URL/RESERVE_POSTGRES_URL (or DATABASE_URL_RESERVE/POSTGRES_URL_RESERVE)."
        );
    }

    if (mode === "extra") {
        throw new Error(
            "USE_RESERVE_DB=2 but EXTRA DB env is missing. Set EXTRA_DATABASE_URL/EXTRA_POSTGRES_URL (or DATABASE_URL_EXTRA/POSTGRES_URL_EXTRA)."
        );
    }
}

export function applyDbEnvSelection() {
    const primaryEnvSet = readDbEnvSet({ suffix: "_PRIMARY", includeBase: true });
    const reserveEnvSet = readDbEnvSet({ prefix: "RESERVE_", suffix: "_RESERVE" });
    const extraEnvSet = readDbEnvSet({ prefix: "EXTRA_", suffix: "_EXTRA" });

    if (primaryEnvSet.DATABASE_URL) process.env.DATABASE_URL_PRIMARY = primaryEnvSet.DATABASE_URL;
    if (primaryEnvSet.POSTGRES_URL) process.env.POSTGRES_URL_PRIMARY = primaryEnvSet.POSTGRES_URL;

    if (reserveEnvSet.DATABASE_URL && !process.env.RESERVE_DATABASE_URL) {
        process.env.RESERVE_DATABASE_URL = reserveEnvSet.DATABASE_URL;
    }
    if (reserveEnvSet.POSTGRES_URL && !process.env.RESERVE_POSTGRES_URL) {
        process.env.RESERVE_POSTGRES_URL = reserveEnvSet.POSTGRES_URL;
    }

    if (extraEnvSet.DATABASE_URL && !process.env.EXTRA_DATABASE_URL) {
        process.env.EXTRA_DATABASE_URL = extraEnvSet.DATABASE_URL;
    }
    if (extraEnvSet.POSTGRES_URL && !process.env.EXTRA_POSTGRES_URL) {
        process.env.EXTRA_POSTGRES_URL = extraEnvSet.POSTGRES_URL;
    }

    const dbMode = getDbMode(process.env.USE_RESERVE_DB);

    if (dbMode === "reserve") {
        assertRequiredDbUrls(dbMode, reserveEnvSet);
        applyDbEnvSet(reserveEnvSet);
        return;
    }

    if (dbMode === "extra") {
        assertRequiredDbUrls(dbMode, extraEnvSet);
        applyDbEnvSet(extraEnvSet);
        return;
    }

    applyDbEnvSet(primaryEnvSet);
}
