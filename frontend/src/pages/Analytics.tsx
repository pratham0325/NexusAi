import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { usageApi } from "@/api";
import { modelLabel } from "@/lib/models";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bot,
  FileText,
  MessageSquare,
  MessagesSquare,
  Type,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

export default function Analytics() {
  const query = useQuery({ queryKey: ["usage"], queryFn: usageApi.summary });
  const summary = query.data;

  if (query.isLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!summary) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Unable to load analytics.
        </div>
      </AppLayout>
    );
  }

  const stats = [
    {
      label: "Conversations",
      value: summary.totalConversations,
      icon: MessageSquare,
    },
    {
      label: "Messages",
      value: summary.totalMessages,
      icon: MessagesSquare,
    },
    {
      label: "Generations",
      value: summary.assistantMessages,
      icon: BarChart3,
    },
    {
      label: "Completion chars",
      value: summary.totalCompletionChars,
      icon: Type,
    },
    { label: "Assistants", value: summary.totalAssistants, icon: Bot },
    { label: "Documents", value: summary.totalDocuments, icon: FileText },
  ];

  return (
    <AppLayout>
      <div className="scrollbar-slim h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Analytics
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your AI usage over the last 14 days.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {stats.map((s) => (
              <Card key={s.label} className="shadow-none">
                <CardContent className="p-4">
                  <s.icon className="size-4 text-primary" />
                  <p className="mt-2 font-display text-xl font-bold tabular-nums">
                    {s.value.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Daily generations</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    messages: { label: "Generations", color: "var(--chart-1)" },
                  }}
                  className="h-56 w-full"
                >
                  <AreaChart data={summary.days} margin={{ left: -22, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="messages"
                      stroke="var(--chart-1)"
                      fill="var(--chart-1)"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Model breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.modelBreakdown.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    No generations yet — start a chat to see data here.
                  </p>
                ) : (
                  <ChartContainer
                    config={{ count: { label: "Uses", color: "var(--chart-2)" } }}
                    className="h-56 w-full"
                  >
                    <BarChart
                      data={summary.modelBreakdown.map((m) => ({
                        ...m,
                        label: modelLabel(m.modelId),
                      }))}
                      margin={{ left: -22, right: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                      />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="count"
                        fill="var(--chart-2)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
