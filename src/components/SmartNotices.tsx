import InlineNotice from "./InlineNotice";
import { formatClockTime } from "../utils/time";

type ServerBlockKind = "cooldown" | "hourly_limit" | "daily_limit";

interface LocalBlockNotice {
  kind: "local";
  tryAgainAtMs: number;
  allowedPerHour?: number;
  resetAtIso?: string;
}

interface ServerBlockNotice {
  kind: "server";
  serverKind: ServerBlockKind;
  tryAgainAtMs: number;
  allowedPerHour?: number;
  remaining?: number;
  resetAtIso?: string;
  userScoped?: boolean;
}

type SmartBlockNotice = LocalBlockNotice | ServerBlockNotice | null;

interface QuotaInfo {
  allowedPerHour?: number;
  usedThisHour?: number;
  remainingThisHour?: number;
  resetAtIso?: string | null;
  userScoped?: boolean;
}

interface SmartNoticesProps {
  smartMode: boolean;
  smartBlockNotice: SmartBlockNotice;
  quotaInfo: QuotaInfo | null;
  onSwitchToClassic: () => void;
  // NEW: generic error flag for unknown failures
  smartGenericError?: boolean;
}

const SmartNotices = ({
  smartMode,
  smartBlockNotice,
  quotaInfo,
  onSwitchToClassic,
  smartGenericError = false,
}: SmartNoticesProps) => {
  if (!smartMode) return null;

  // Server-side limits
  if (smartBlockNotice && smartBlockNotice.kind === "server") {
    const tryAtIso =
      smartBlockNotice.resetAtIso ||
      new Date(smartBlockNotice.tryAgainAtMs).toISOString();
    const tryAtClock = formatClockTime(tryAtIso);

    const perHour = smartBlockNotice.allowedPerHour;

    const title =
      smartBlockNotice.serverKind === "daily_limit"
        ? "Daily AI capacity reached"
        : "Smart Search limit reached";

    return (
      <div className="mb-4">
        <InlineNotice title={title} kind="warning">
          <p className="mb-2">
            {smartBlockNotice.serverKind === "daily_limit"
              ? "Today's shared AI capacity is full."
              : `You've used your hourly smart searches${typeof perHour === "number" ? ` (limit ${perHour}/hour)` : ""
              }.`}
          </p>
          {smartBlockNotice.serverKind === "daily_limit" ? (
            <p className="mb-2">
              Please try again tomorrow. In the meantime,{" "}
              <button
                type="button"
                className="text-[#9d7dff] underline hover:text-[#c4b3ff]"
                onClick={onSwitchToClassic}
              >
                Classic Filters
              </button>{" "}
              are unlimited.
            </p>
          ) : (
            <p className="mb-2">
              Try again at <strong>{tryAtClock}</strong>. Meanwhile,{" "}
              <button
                type="button"
                className="text-[#9d7dff] underline hover:text-[#c4b3ff]"
                onClick={onSwitchToClassic}
              >
                Classic Filters
              </button>{" "}
              are unlimited.
            </p>
          )}
          {quotaInfo?.allowedPerHour !== undefined &&
            quotaInfo.remainingThisHour !== undefined &&
            smartBlockNotice.serverKind === "hourly_limit" && (
              <p className="mb-0 text-[#c9c2e6]">
                Remaining this hour: {quotaInfo.remainingThisHour}. Resets{" "}
                {quotaInfo.resetAtIso && (
                  <>
                    at <strong>{formatClockTime(quotaInfo.resetAtIso)}</strong>.
                  </>
                )}
              </p>
            )}
        </InlineNotice>
      </div>
    );
  }

  // Generic unknown error (not blocked)
  if (!smartBlockNotice && smartGenericError) {
    return (
      <div className="mb-4">
        <InlineNotice kind="info">
          <p className="mb-0">
            Smart Search ran into an issue. Please use{" "}
            <button
              type="button"
              className="text-[#9d7dff] underline hover:text-[#c4b3ff]"
              onClick={onSwitchToClassic}
            >
              Classic Filters
            </button>{" "}
            for now while we work on a fix.
          </p>
        </InlineNotice>
      </div>
    );
  }

  // Not blocked: concise quota reminder (use lowkey for minimal footprint)
  if (
    !smartBlockNotice &&
    quotaInfo?.allowedPerHour &&
    typeof quotaInfo.remainingThisHour === "number" &&
    quotaInfo?.remainingThisHour < 4
  ) {
    return (
      <div className="mb-3">
        <InlineNotice kind="info" lowkey>
          {quotaInfo.remainingThisHour} smart searches remaining before reset
          {quotaInfo.resetAtIso && (
            <>
              {" "}
              at <strong>{formatClockTime(quotaInfo.resetAtIso)}</strong>
            </>
          )}
          .
        </InlineNotice>
      </div>
    );
  }

  return null;
};

export default SmartNotices;
