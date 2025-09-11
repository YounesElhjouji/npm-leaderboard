import posthog from "posthog-js";
import { formatClockTime } from "../utils/time";

interface SmartSearchBarProps {
  smartQuery: string;
  loading: boolean;
  onSmartQueryChange: (value: string) => void;
  onRunSmartSearch: () => void;
  disabledSeconds?: number;
  showLimitsHint?: boolean;
  disabledUntilMs?: number | null;
}

const MAX_LEN = 160;
const MIN_LEN = 6;

const SparkleIcon = ({ className }: { className?: string }) => (
  <svg
    className={`h-4 w-4 ${className}`}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M11.5 2l1.7 4.7L18 8.5l-4.8 1.4L11.5 15l-1.7-5.1L5 8.5l4.8-1.8L11.5 2zM19 12l1 2.8L23 16l-3 1-.9 3L18 17l-3-1 3-1 .9-3zM4 13l1.2 3.1L8 17l-2.8.9L4 21l-1.1-3.1L0 17l2.9-.9L4 13z" />
  </svg>
);

const SmartSearchBar = ({
  smartQuery,
  loading,
  onSmartQueryChange,
  onRunSmartSearch,
  disabledSeconds = 0,
  showLimitsHint = true,
  disabledUntilMs = null,
}: SmartSearchBarProps) => {
  const len = smartQuery.length;
  const tooShort = len > 0 && len < MIN_LEN;
  const tooLong = len > MAX_LEN; // Should not happen with maxLength

  const overLimit = disabledSeconds > 0 || !!disabledUntilMs;

  // Block the button when overLimit, but DO NOT change its visible label per requirement
  const disabled =
    loading || !smartQuery.trim() || smartQuery.length < MIN_LEN || overLimit;

  const tryAgainAt =
    disabledUntilMs && disabledUntilMs > Date.now()
      ? formatClockTime(disabledUntilMs)
      : null;

  // Keep the label constant as "Run" even when disabled due to local cooldown
  const buttonLabel = "Run";

  const handleChange = (v: string) => {
    onSmartQueryChange(v);
  };

  const handleRun = () => {
    if (disabled) return;
    posthog.capture("smart_search_run", { query: smartQuery });
    onRunSmartSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !disabled) {
      handleRun();
    }
  };

  // Determine if helper row should render at all
  const shouldShowHelper = showLimitsHint || tooShort;

  return (
    <div>
      <label
        htmlFor="smartQuery"
        className="text-sm font-medium text-[#d4d4d4]"
      >
        Smart Search
      </label>

      {/* New Integrated Input Wrapper */}
      <div className="mt-1 flex items-center gap-3 rounded-md border border-violet-700 bg-[#252526] px-3 py-1.5 focus-within:ring-2 focus-within:ring-violet-500">
        <SparkleIcon className="flex-shrink-0 text-violet-400" />
        <input
          type="text"
          id="smartQuery"
          value={smartQuery}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you need..."
          className="flex-1 border-none bg-transparent p-0 text-[#d4d4d4] placeholder:text-[#6a6a6a] focus:outline-none focus:ring-0"
          disabled={loading}
          minLength={MIN_LEN}
          maxLength={MAX_LEN}
          autoComplete="off"
        />
        <div className="flex flex-shrink-0 items-center gap-3">
          <span
            className={`font-mono text-xs ${
              tooShort || tooLong ? "text-red-400" : "text-[#8e8e8e]"
            }`}
          >
            {len}/{MAX_LEN}
          </span>
          <button
            type="button"
            onClick={handleRun}
            disabled={disabled}
            className="inline-flex h-[30px] items-center justify-center rounded bg-violet-600 px-3 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
            title={
              overLimit && tryAgainAt
                ? `Rate limited. You can try again at ${tryAgainAt}.`
                : "Run Smart Search"
            }
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartSearchBar;
