"use client";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

// @ts-expect-error complains about children's type
export function PostHogProvider({ children }) {
  useEffect(() => {
    // @ts-expect-error if env vars not set
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      person_profiles: "identified_only", // or 'always' to create profiles for anonymous users as well
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
