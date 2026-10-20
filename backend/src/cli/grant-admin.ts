/**
 * Server-side admin provisioning: grants the admin role to an existing user.
 *
 *   npm run grant-admin -- someone@example.com
 *
 * Uses MONGODB_URI from the environment (or backend/.env). Only the given
 * user's role field is changed.
 */
import { connectMongo, disconnectMongo } from "../config/mongo.js";
import { User } from "../models/User.js";

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    console.error("Usage: npm run grant-admin -- <email>");
    process.exit(1);
  }
  await connectMongo();
  try {
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { role: "admin" } },
      { new: true },
    );
    if (!user) {
      console.error(`No user found with email ${email}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Granted admin to ${email}. They must sign in again to refresh their token.`);
  } finally {
    await disconnectMongo();
  }
}

void main().catch((err) => {
  console.error("grant-admin failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
