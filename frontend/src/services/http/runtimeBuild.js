const FRONTEND_BUILD_TS_RAW = Number(import.meta.env.VITE_BUILD_TS || __APP_BUILD_TS__ || 0);

export const FRONTEND_BUILD_TS = Number.isFinite(FRONTEND_BUILD_TS_RAW) && FRONTEND_BUILD_TS_RAW > 0
    ? Math.trunc(FRONTEND_BUILD_TS_RAW)
    : 0;

function shouldAttachBuildHeader(urlRaw) {
    const url = String(urlRaw || "");
    return url.includes("/api/");
}

function withBuildHeader(headersRaw) {
    const headers = new Headers(headersRaw || {});
    if (FRONTEND_BUILD_TS > 0) {
        headers.set("x-frontend-build-ts", String(FRONTEND_BUILD_TS));
    }
    return headers;
}

export function withRuntimeBuildHeader(input, init) {
    if (FRONTEND_BUILD_TS <= 0) return [input, init];
    const url = typeof input === "string" ? input : String(input?.url || "");
    if (!shouldAttachBuildHeader(url)) return [input, init];

    if (typeof Request !== "undefined" && input instanceof Request) {
        const nextInput = new Request(input, {
            ...(init || {}),
            headers: withBuildHeader((init && init.headers) || input.headers),
        });
        return [nextInput, undefined];
    }

    return [
        input,
        {
            ...(init || {}),
            headers: withBuildHeader(init?.headers),
        },
    ];
}
