import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Props = {
  data: Array<{ name: string; value: number }>;
};

export const LowStockCategoryChart: React.FC<Props> = ({ data }) => {
  if (data.length === 0) {
    return <div className="empty-state">No low-stock items at locations</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="value" fill="#3b82f6" name="On hand (base)" />
      </BarChart>
    </ResponsiveContainer>
  );
};
