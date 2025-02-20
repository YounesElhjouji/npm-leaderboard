// types.ts
export type SortBy = "downloads" | "growth" | "dependents";

export interface WeeklyTrend {
  week_ending: string;
  downloads: number;
}

export interface NPMPackage {
  _id: string;
  name: string;
  description: string;
  link: string;
  downloads?: {
    total: number;
    weekly_trends: WeeklyTrend[];
  };
  dependent_packages_count: number;
  avgGrowth?: number;
}
