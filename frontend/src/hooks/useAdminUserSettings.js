import { useCallback, useEffect, useState } from "react";
import { MAX_MULTI_FILE_BATCH_COUNT } from "../constants/appConstants.js";
import {
    fetchAdminMaintenanceSettings,
    fetchAdminUserById,
    recalculateParetoFilenameCsvs,
    updateAdminMaintenanceSettings,
    updateAdminUserUploadSettings,
} from "../services/apiClient.js";

export function useAdminUserSettings({
    isAdmin,
    authKeyDraft,
    formatGb,
    refreshAdminLogs,
}) {
    const [adminUserIdDraft, setAdminUserIdDraft] = useState("");
    const [adminPanelError, setAdminPanelError] = useState("");
    const [adminUser, setAdminUser] = useState(null);
    const [adminSingleGbDraft, setAdminSingleGbDraft] = useState("");
    const [adminTotalGbDraft, setAdminTotalGbDraft] = useState("");
    const [adminBatchCountDraft, setAdminBatchCountDraft] = useState("");
    const [adminVerifyTleSecondsDraft, setAdminVerifyTleSecondsDraft] = useState("");
    const [adminMetricsTleSecondsDraft, setAdminMetricsTleSecondsDraft] = useState("");
    const [isMaintenanceModeEnabled, setIsMaintenanceModeEnabled] = useState(false);
    const [maintenanceMessageDraft, setMaintenanceMessageDraft] = useState("Technical maintenance is in progress. Please try again later.");
    const [maintenanceWhitelistDraft, setMaintenanceWhitelistDraft] = useState("");
    const [isAdminLoading, setIsAdminLoading] = useState(false);
    const [isAdminSaving, setIsAdminSaving] = useState(false);
    const [isParetoCsvRecalculating, setIsParetoCsvRecalculating] = useState(false);

    function applyAdminUserDrafts(user) {
        setAdminUser(user || null);
        setAdminSingleGbDraft(formatGb(user?.maxSingleUploadBytes || 0));
        setAdminTotalGbDraft(formatGb(user?.totalUploadQuotaBytes || 0));
        setAdminBatchCountDraft(String(user?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));
        setAdminVerifyTleSecondsDraft(String(user?.abcVerifyTimeoutSeconds || 60));
        setAdminMetricsTleSecondsDraft(String(user?.abcMetricsTimeoutSeconds || 60));
    }

    function applyMaintenanceDrafts(maintenance) {
        const row = maintenance && typeof maintenance === "object" ? maintenance : {};
        setIsMaintenanceModeEnabled(Boolean(row.enabled));
        setMaintenanceMessageDraft(String(row.message || "Technical maintenance is in progress. Please try again later."));
        setMaintenanceWhitelistDraft(
            Array.isArray(row.whitelistAdminIds)
                ? row.whitelistAdminIds.join(", ")
                : ""
        );
    }

    const loadMaintenanceSettings = useCallback(async () => {
        if (!isAdmin) return;
        const maintenancePayload = await fetchAdminMaintenanceSettings({ authKey: authKeyDraft });
        applyMaintenanceDrafts(maintenancePayload?.maintenance || {});
    }, [isAdmin, authKeyDraft]);

    async function loadAdminUser() {
        if (!isAdmin) return;

        const userId = Number(adminUserIdDraft);
        if (!Number.isInteger(userId) || userId < 1) {
            setAdminPanelError("Enter a valid numeric user id.");
            return;
        }

        setIsAdminLoading(true);
        setAdminPanelError("");
        try {
            const payload = await fetchAdminUserById({ authKey: authKeyDraft, userId });
            applyAdminUserDrafts(payload.user);
            await loadMaintenanceSettings().catch(() => {
                // Keep user settings usable even if maintenance endpoint is temporarily unavailable.
            });
            refreshAdminLogs();
        } catch (error) {
            setAdminUser(null);
            setAdminPanelError(error?.message || "Failed to load user.");
        } finally {
            setIsAdminLoading(false);
        }
    }

    async function saveAdminUserSettings() {
        if (!adminUser) return;
        setIsAdminSaving(true);
        setAdminPanelError("");
        try {
            const payload = await updateAdminUserUploadSettings({
                authKey: authKeyDraft,
                userId: adminUser.id,
                maxSingleUploadGb: adminSingleGbDraft,
                totalUploadQuotaGb: adminTotalGbDraft,
                maxMultiFileBatchCount: adminBatchCountDraft,
                abcVerifyTimeoutSeconds: adminVerifyTleSecondsDraft,
                abcMetricsTimeoutSeconds: adminMetricsTleSecondsDraft,
            });
            applyAdminUserDrafts(payload.user);
            refreshAdminLogs();
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to save settings.");
        } finally {
            setIsAdminSaving(false);
        }
    }

    async function saveMaintenanceSettings() {
        if (!isAdmin) return;
        setIsAdminSaving(true);
        setAdminPanelError("");
        try {
            const whitelistAdminIds = String(maintenanceWhitelistDraft || "")
                .split(/[,\s]+/)
                .map((part) => Number(part))
                .filter((id) => Number.isInteger(id) && id > 0);
            const payload = await updateAdminMaintenanceSettings({
                authKey: authKeyDraft,
                enabled: isMaintenanceModeEnabled,
                message: maintenanceMessageDraft,
                whitelistAdminIds,
            });
            applyMaintenanceDrafts(payload?.maintenance || {});
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to save maintenance settings.");
        } finally {
            setIsAdminSaving(false);
        }
    }

    async function recalculateParetoCsvFilenames() {
        if (!isAdmin) return;
        setIsParetoCsvRecalculating(true);
        setAdminPanelError("");
        try {
            await recalculateParetoFilenameCsvs({ authKey: authKeyDraft });
            refreshAdminLogs();
        } catch (error) {
            setAdminPanelError(error?.message || "Failed to recalculate pareto filename CSVs.");
        } finally {
            setIsParetoCsvRecalculating(false);
        }
    }

    useEffect(() => {
        if (!isAdmin) return;
        if (!String(authKeyDraft || "").trim()) return;
        loadMaintenanceSettings().catch(() => {
            // do not block main UI on maintenance read failures
        });
    }, [isAdmin, authKeyDraft, loadMaintenanceSettings]);

    return {
        adminUserIdDraft,
        setAdminUserIdDraft,
        adminPanelError,
        setAdminPanelError,
        adminUser,
        adminSingleGbDraft,
        setAdminSingleGbDraft,
        adminTotalGbDraft,
        setAdminTotalGbDraft,
        adminBatchCountDraft,
        setAdminBatchCountDraft,
        adminVerifyTleSecondsDraft,
        setAdminVerifyTleSecondsDraft,
        adminMetricsTleSecondsDraft,
        setAdminMetricsTleSecondsDraft,
        isMaintenanceModeEnabled,
        setIsMaintenanceModeEnabled,
        maintenanceMessageDraft,
        setMaintenanceMessageDraft,
        maintenanceWhitelistDraft,
        setMaintenanceWhitelistDraft,
        isAdminLoading,
        isAdminSaving,
        isParetoCsvRecalculating,
        loadAdminUser,
        saveAdminUserSettings,
        saveMaintenanceSettings,
        recalculateParetoCsvFilenames,
    };
}
