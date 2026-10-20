/** Mongo connection. The backend requires an explicit local or Atlas URI. */
import mongoose from "mongoose";
import { env } from "./env.js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function mongoHosts(uri: string): string[] {
  const authority = uri.replace(/^mongodb(\+srv)?:\/\//, "").split("/")[0] ?? "";
  const hosts = authority.includes("@") ? authority.slice(authority.lastIndexOf("@") + 1) : authority;
  return hosts.split(",").map((h) => h.replace(/:\d+$/, "").toLowerCase());
}

export async function connectMongo(): Promise<void> {
  if (
    !env.MONGODB_URI ||
    (!env.MONGODB_URI.startsWith("mongodb://") &&
      !env.MONGODB_URI.startsWith("mongodb+srv://"))
  ) {
    throw new Error(
      "MONGODB_URI must be a MongoDB local or Atlas connection string",
    );
  }
  // Test runs must never touch a real (remote) database.
  if (
    env.NODE_ENV === "test" &&
    !mongoHosts(env.MONGODB_URI).every((h) => LOCAL_HOSTS.has(h))
  ) {
    throw new Error("NODE_ENV=test refuses to connect to a non-local MongoDB");
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
    });
    console.log("[mongo] connected");
  } catch {
    // Never echo the URI: it usually embeds credentials.
    throw new Error(
      "Cannot reach MongoDB. Start the local MongoDB server or check the Atlas URI and Network Access.",
    );
  }
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
