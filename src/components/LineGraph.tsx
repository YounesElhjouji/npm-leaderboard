import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export type WeeklyData = {
  week_ending: string;
  downloads: number;
};

export type LineGraphProps = {
  data: WeeklyData[];
};

const LineGraph: React.FC<LineGraphProps> = ({ data }) => {
  // Remove the first data point
  const filteredData = data.slice(1);

  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={filteredData}>
        <Line
          type="monotone"
          dataKey="downloads"
          stroke="#569CD6"
          strokeWidth={2}
          dot={false}
        />
        <XAxis dataKey="week_ending" hide />
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip
          formatter={(value: number) => value.toLocaleString()}
          labelFormatter={(label) => `Week ending: ${label}`}
          contentStyle={{ backgroundColor: "#1e1e1e", border: "none" }}
          itemStyle={{ color: "#d4d4d4" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default LineGraph;
