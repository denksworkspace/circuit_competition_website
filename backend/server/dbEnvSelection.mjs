function firstNonEmpty(...values) {
    for (const value of values) {
        if (value == null) continue;
        const normalized = String(value).trim();
        if (normalized) return normalized;
    }
    return "";
}

function isReserveEnabled(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on" || normalized === "reserve";
}

export function applyDbEnvSelection() {
    const primaryDatabaseUrl = firstNonEmpty(process.env.DATABASE_URL_PRIMARY, process.env.DATABASE_URL);
    const primaryPostgresUrl = firstNonEmpty(process.env.POSTGRES_URL_PRIMARY, process.env.POSTGRES_URL, primaryDatabaseUrl);

    if (primaryDatabaseUrl) process.env.DATABASE_URL_PRIMARY = primaryDatabaseUrl;
    if (primaryPostgresUrl) process.env.POSTGRES_URL_PRIMARY = primaryPostgresUrl;

    const reserveDatabaseUrl = firstNonEmpty(process.env.RESERVE_DATABASE_URL, process.env.DATABASE_URL_RESERVE);
    const reservePostgresUrl = firstNonEmpty(
        process.env.RESERVE_POSTGRES_URL,
        process.env.POSTGRES_URL_RESERVE,
        reserveDatabaseUrl
    );

    if (reserveDatabaseUrl && !process.env.RESERVE_DATABASE_URL) {
        process.env.RESERVE_DATABASE_URL = reserveDatabaseUrl;
    }
    if (reservePostgresUrl && !process.env.RESERVE_POSTGRES_URL) {
        process.env.RESERVE_POSTGRES_URL = reservePostgresUrl;
    }

    if (isReserveEnabled(process.env.USE_RESERVE_DB)) {
        const nextDatabaseUrl = reserveDatabaseUrl || reservePostgresUrl;
        const nextPostgresUrl = reservePostgresUrl || reserveDatabaseUrl;

        if (!nextDatabaseUrl || !nextPostgresUrl) {
            throw new Error(
                "USE_RESERVE_DB=1 but reserve DB env is missing. Set RESERVE_DATABASE_URL/RESERVE_POSTGRES_URL (or DATABASE_URL_RESERVE/POSTGRES_URL_RESERVE)."
            );
        }

        process.env.DATABASE_URL = nextDatabaseUrl;
        process.env.POSTGRES_URL = nextPostgresUrl;
        return;
    }

    if (primaryDatabaseUrl) process.env.DATABASE_URL = primaryDatabaseUrl;
    if (primaryPostgresUrl) process.env.POSTGRES_URL = primaryPostgresUrl;

    // @vercel/postgres expects POSTGRES_URL.
    if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
        process.env.POSTGRES_URL = process.env.DATABASE_URL;
    }
}
