import Oblien, { OblienError } from "oblien";
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('./src/config/.env') })
const client = new Oblien({
  clientId: process.env.OBLIEN_CLIENT_ID!,
  clientSecret: process.env.OBLIEN_CLIENT_SECRET!,
});

async function deploy(): Promise<void> {
  // Stop all existing workspaces to free the running slot
  const existing = await client.workspaces.list();
  for (const w of existing.workspaces) {
    console.log(`🛑 Stopping workspace: ${w.id} (${w.status})`);
    await client.workspaces.stop(w.id);
  }

  // Wait for the slot to free up
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 1. Create workspace (don't call ws.start() — it auto-starts)
  const data = await client.workspaces.create({
    image: "node:22",
    cpus: 1,
    memory_mb: 1024,
  });

  const ws = client.workspace(data.id);
  console.log("✅ Workspace created:", data.id);

  // NO ws.start() call — workspace auto-starts on creation

  // 2. Get runtime handle
  const rt = await ws.runtime();

  // 3. Clone repo
  await rt.exec.run(["git", "clone", "https://github.com/alyKhalid3/Tadreebak.git", "app"]);
  console.log("✅ Repo cloned");

  // 4. Install dependencies
  await rt.exec.run(["npm", "install", "--prefix", "app"]);
  console.log("✅ Dependencies installed");

  // 5. Start server as background workload
  await ws.workloads.create({
    cmd: ["npm", "start"],
    name: "tadreebak-server",
    working_dir: "/root/app",
    restart_policy: "always",
  });
  await ws.workloads.start("tadreebak-server");
  console.log("✅ Server started");

  // 6. Expose port
  const port = Number(process.env.PORT) || 3000;
  const access = await ws.publicAccess.expose({ port });
  console.log("🚀 Your backend is live at:", access.url);
}
deploy().catch((err: unknown) => {
  if (err instanceof OblienError) {
    console.error(`❌ Oblien error [${err.code}]:`, err.message);
  } else {
    console.error("❌ Deployment failed:", err);
  }
  process.exit(1);
});