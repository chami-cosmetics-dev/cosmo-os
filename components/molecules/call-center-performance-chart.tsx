"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface CallCenterPerformanceDatum {
  agent: string;
  na: number;
  interested: number;
  notInterested: number;
  notResponding: number;
  wrongNumber: number;
  blackList: number;
  busy: number;
  interestedSms: number;
}

interface CallCenterPerformanceChartProps {
  data: CallCenterPerformanceDatum[];
}

const chartConfig: ChartConfig = {
  na: { label: "N / A", color: "#7cb5ec" },
  interested: { label: "Interested", color: "#434348" },
  notInterested: { label: "Not Interested", color: "#90ed7d" },
  notResponding: { label: "Not Responding", color: "#f7a35c" },
  wrongNumber: { label: "Wrong Number", color: "#8085e9" },
  blackList: { label: "Black List", color: "#f15c80" },
  busy: { label: "Busy", color: "#e4d354" },
  interestedSms: { label: "Interested-SMS", color: "#2b908f" },
};

export function CallCenterPerformanceChart({
  data,
}: CallCenterPerformanceChartProps) {
  if (!data.length) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Call Outcomes by Agent
        </CardTitle>
        <CardDescription>
          Review customer response categories for each call center agent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[420px] w-full">
          <BarChart
            data={data}
            margin={{ top: 16, right: 16, left: 8, bottom: 24 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="agent" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={44} />
            <ChartTooltip
              cursor={false}
              shared={false}
              content={<ChartTooltipContent />}
            />
            <Legend />
            <Bar dataKey="na" name="N / A" fill="var(--color-na)" />
            <Bar
              dataKey="interested"
              name="Interested"
              fill="var(--color-interested)"
            />
            <Bar
              dataKey="notInterested"
              name="Not Interested"
              fill="var(--color-notInterested)"
            />
            <Bar
              dataKey="notResponding"
              name="Not Responding"
              fill="var(--color-notResponding)"
            />
            <Bar
              dataKey="wrongNumber"
              name="Wrong Number"
              fill="var(--color-wrongNumber)"
            />
            <Bar
              dataKey="blackList"
              name="Black List"
              fill="var(--color-blackList)"
            />
            <Bar dataKey="busy" name="Busy" fill="var(--color-busy)" />
            <Bar
              dataKey="interestedSms"
              name="Interested-SMS"
              fill="var(--color-interestedSms)"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
