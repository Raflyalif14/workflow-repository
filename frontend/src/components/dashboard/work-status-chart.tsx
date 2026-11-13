"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber, translate } from "@/i18n";

type ChartRow = { status: string; name: string; value: number; color: string };

export default function WorkStatusChart({ data }: { data: ChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={57} outerRadius={78} paddingAngle={2} stroke="none" isAnimationActive={false}>
          {data.map(row => <Cell key={row.status} fill={row.color} />)}
        </Pie>
        <Tooltip
          formatter={value => [formatNumber(Number(value)), translate("dashboardPage.chartProjects")]}
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--popover-foreground))", fontSize: "12px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
