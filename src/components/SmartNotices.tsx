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
}

const SmartNotices = ({
  smartMode,
  smartBlockNotice,
  quotaInfo,
  onSwitchToClassic,
}: SmartNoticesProps) => {
  if (!smartMode) return null;

  // No inline message for local cooldown, only for server rate limits
  if (smartBlockNotice && smartBlockNotice.kind === "server") {
    const title =
      smartBlockNotice.serverKind === "daily_limit"
        ? "Daily AI capacity reached"
        : "Smart Search limit reached";

    let introText = "";
    if (smartBlockNotice.serverKind === "hourly_limit") {
      introText = `You've used your hourly smart searches. To keep this free for everyone, the limit is currently ${
        smartBlockNotice.allowedPerHour || "a few"
      } per hour.`;
    } else if (smartBlockNotice.serverKind === "daily_limit") {
      introText = `Today's shared AI capacity is full. As a community project, I cap daily usage to manage costs.`;
    }

    // For hourly_limit, show the exact retry time
    const showRetryTime =
      smartBlockNotice.serverKind === "hourly_limit" &&
      (smartBlockNotice.resetAtIso || smartBlockNotice.tryAgainAtMs);

    const retryTime =
      smartBlockNotice.resetAtIso ||
      new Date(smartBlockNotice.tryAgainAtMs).toISOString();

    return (
      <div className="mb-4">
        <InlineNotice title={title} kind="warning">
          <p className="mb-2">{introText}</p>

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
              {showRetryTime ? (
                <>
                  Please try again at{" "}
                  <strong>{formatClockTime(retryTime)}</strong>. In the
                  meantime,{" "}
                  <button
                    type="button"
                    className="text-[#9d7dff] underline hover:text-[#c4b3ff]"
                    onClick={onSwitchToClassic}
                  >
                    Classic Filters
                  </button>{" "}
                  are unlimited.
                </>
              ) : (
                <>
                  Please try again later. In the meantime,{" "}
                  <button
                    type="button"
                    className="text-[#9d7dff] underline hover:text-[#c4b3ff]"
                    onClick={onSwitchToClassic}
                  >
                    Classic Filters
                  </button>{" "}
                  are unlimited.
                </>
              )}
            </p>
          )}

          {/* Optional concise quota hint even when blocked */}
          {quotaInfo?.allowedPerHour !== undefined &&
            quotaInfo.usedThisHour !== undefined && (
              <p className="mb-0 text-[#c9c2e6]">
                Used {quotaInfo.usedThisHour}/{quotaInfo.allowedPerHour}
                {quotaInfo.resetAtIso && (
                  <>
                    {" "}
                    this hour (resets around{" "}
                    <strong>{formatClockTime(quotaInfo.resetAtIso)}</strong>).
                  </>
                )}
              </p>
            )}
        </InlineNotice>
      </div>
    );
  }

  // Not blocked: concise quota reminder
  if (
    !smartBlockNotice &&
    quotaInfo?.allowedPerHour &&
    typeof quotaInfo.remainingThisHour === "number"
  ) {
    return (
      <div className="mb-4">
        <InlineNotice kind="info">
          <p className="mb-0">
            {quotaInfo.remainingThisHour} smart searches remaining
            {quotaInfo.resetAtIso && (
              <>
                {" "}
                before reset at{" "}
                <strong>{formatClockTime(quotaInfo.resetAtIso)}</strong>
              </>
            )}
            .
          </p>
        </InlineNotice>
      </div>
    );
  }

  return null;
};

export default SmartNotices;
