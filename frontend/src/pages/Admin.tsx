import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { usageApi } from "@/api";
import { modelLabel } from "@/lib/models";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Activity,
  Database,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: usageApi.adminStats,
    retry: false,
  });
  const claimAdmin = useMutation({
    mutationFn: usageApi.claimAdmin,
    onSuccess: () => void statsQuery.refetch(),
  });
  const stats = statsQuery.data;

  if (statsQuery.isLoading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!stats) {
    return (
      <AppLayout>
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <ShieldCheck className="size-7 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold">
            Admin access required
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No admin exists on this deployment yet. The first person to claim
            becomes the platform admin.
          </p>
          <Button
            className="mt-5 rounded-xl"
            onClick={async () => {
              try {
                await claimAdmin.mutateAsync();
                toast.success("You are now the admin");
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Claim failed",
                );
              }
            }}
          >
            <ShieldCheck className="mr-2 size-4" />
            Claim admin
          </Button>
        </div>
      </AppLayout>
    );
  }

  const cards = [
    { label: "Total users", value: stats.totalUsers, icon: Users },
    { label: "Generations", value: stats.totalGenerations, icon: Zap },
    { label: "Completion chars", value: stats.totalChars, icon: Activity },
    {
      label: "Models used",
      value: stats.modelBreakdown.length,
      icon: Database,
    },
  ];

  return (
    <AppLayout>
      <div className="scrollbar-slim h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Admin dashboard
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform-wide usage and user management.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.label} className="shadow-none">
                <CardContent className="p-4">
                  <c.icon className="size-4 text-primary" />
                  <p className="mt-2 font-display text-2xl font-bold tabular-nums">
                    {c.value.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{c.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-4 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">
                Generations · last 14 days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{ messages: { label: "Generations", color: "var(--chart-1)" } }}
                className="h-56 w-full"
              >
                <AreaChart data={stats.days} margin={{ left: -22, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
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

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Model breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.modelBreakdown.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No usage yet.
                  </p>
                )}
                {stats.modelBreakdown.map((m) => (
                  <div key={m.modelId} className="flex items-center gap-3">
                    <span className="w-32 truncate text-sm">
                      {modelLabel(m.modelId)}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${
                            (m.count / stats.totalGenerations) * 100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm font-semibold tabular-nums">
                      {m.count}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Users</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">User</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.users.map((u) => (
                      <TableRow key={u._id}>
                        <TableCell className="pl-6">
                          <p className="text-sm font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {u.email}
                          </p>
                        </TableCell>
                        <TableCell>
                          {u.role === "admin" ? (
                            <Badge className="rounded-full bg-primary/15 text-primary">
                              admin
                            </Badge>
                          ) : u.isAnonymous ? (
                            <Badge variant="secondary" className="rounded-full">
                              guest
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="rounded-full">
                              {u.role}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
