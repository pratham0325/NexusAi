/** Usage service — per-user analytics + platform admin stats. */
import { Conversation } from "../../models/Conversation.js";
import { Document } from "../../models/Document.js";
import { Assistant } from "../../models/Assistant.js";
import { Message } from "../../models/Message.js";
import { UsageEvent } from "../../models/UsageEvent.js";
import { User } from "../../models/User.js";
import type { AdminStatsWire, UsageSummaryWire } from "../../types/index.js";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function usageSummary(userId: string): Promise<UsageSummaryWire> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    userMsgs,
    assistantMsgs,
    totalConversations,
    totalAssistants,
    totalDocuments,
    events,
  ] = await Promise.all([
    Message.countDocuments({ userId, role: "user" }),
    Message.countDocuments({ userId, role: "assistant" }),
    Conversation.countDocuments({ userId }),
    Assistant.countDocuments({ userId }),
    Document.countDocuments({ userId }),
    UsageEvent.find({ userId, createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean(),
  ]);

  const daysMap = new Map<string, { messages: number; chars: number }>();
  for (let i = 29; i >= 0; i--) {
    daysMap.set(dayKey(new Date(Date.now() - i * 86_400_000)), { messages: 0, chars: 0 });
  }
  for (const ev of events) {
    const k = dayKey(new Date(ev.createdAt));
    const entry = daysMap.get(k);
    if (entry) {
      entry.messages += 1;
      entry.chars += ev.completionChars;
    }
  }

  const modelCounts = new Map<string, number>();
  let totalCompletionChars = 0;
  for (const ev of events) {
    totalCompletionChars += ev.completionChars;
    modelCounts.set(ev.modelId, (modelCounts.get(ev.modelId) ?? 0) + 1);
  }

  return {
    totalMessages: userMsgs + assistantMsgs,
    userMessages: userMsgs,
    assistantMessages: assistantMsgs,
    totalConversations,
    totalAssistants,
    totalDocuments,
    totalCompletionChars,
    days: [...daysMap.entries()].map(([date, v]) => ({ date, ...v })),
    modelBreakdown: [...modelCounts.entries()]
      .map(([modelId, count]) => ({ modelId, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function adminStats(): Promise<AdminStatsWire> {
  const [
    totalUsers,
    totalGenerations,
    totalCharsAgg,
    events,
    users,
  ] = await Promise.all([
    User.countDocuments({}),
    UsageEvent.countDocuments({}),
    UsageEvent.aggregate<{ _id: null; chars: number }>([
      { $group: { _id: null, chars: { $sum: "$completionChars" } } },
    ]),
    UsageEvent.find({}).sort({ createdAt: -1 }).limit(5000).lean(),
    User.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .select("name email role isAnonymous")
      .lean(),
  ]);

  const daysMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    daysMap.set(dayKey(new Date(Date.now() - i * 86_400_000)), 0);
  }
  for (const ev of events) {
    const k = dayKey(new Date(ev.createdAt));
    if (daysMap.has(k)) daysMap.set(k, (daysMap.get(k) ?? 0) + 1);
  }

  const modelCounts = new Map<string, number>();
  for (const ev of events) {
    modelCounts.set(ev.modelId, (modelCounts.get(ev.modelId) ?? 0) + 1);
  }

  return {
    totalUsers,
    totalGenerations,
    totalChars: totalCharsAgg[0]?.chars ?? 0,
    modelBreakdown: [...modelCounts.entries()]
      .map(([modelId, count]) => ({ modelId, count }))
      .sort((a, b) => b.count - a.count),
    days: [...daysMap.entries()].map(([date, messages]) => ({ date, messages })),
    users: users.map((u) => ({
      _id: String(u._id),
      name: u.name ?? "—",
      email: u.email ?? "Anonymous",
      role: u.role,
      isAnonymous: u.isAnonymous,
    })),
  };
}
