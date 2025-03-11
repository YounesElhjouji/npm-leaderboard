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
  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={data}>
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
          contentStyle={{
            backgroundColor: "rgba(30, 30, 30, 0.8)",
            border: "none",
          }}
          itemStyle={{ color: "#d4d4d4" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default LineGraph;
