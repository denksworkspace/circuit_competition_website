import { useState } from "react";
import { MAX_MULTI_FILE_BATCH_COUNT } from "../constants/appConstants.js";
import { fetchAdminUserById, updateAdminUserUploadSettings } from "../services/apiClient.js";

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
    const [isAdminLoading, setIsAdminLoading] = useState(false);
    const [isAdminSaving, setIsAdminSaving] = useState(false);

    function applyAdminUserDrafts(user) {
        setAdminUser(user || null);
        setAdminSingleGbDraft(formatGb(user?.maxSingleUploadBytes || 0));
        setAdminTotalGbDraft(formatGb(user?.totalUploadQuotaBytes || 0));
        setAdminBatchCountDraft(String(user?.maxMultiFileBatchCount || MAX_MULTI_FILE_BATCH_COUNT));
        setAdminVerifyTleSecondsDraft(String(user?.abcVerifyTimeoutSeconds || 60));
        setAdminMetricsTleSecondsDraft(String(user?.abcMetricsTimeoutSeconds || 60));
    }

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
        isAdminLoading,
        isAdminSaving,
        loadAdminUser,
        saveAdminUserSettings,
    };
}
