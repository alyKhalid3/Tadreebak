import { Oblien } from "oblien";

const client = new Oblien({ apiKey: process.env.Oblien_ABI_KEY });

// 1. Create a workspace
const ws = await client.workspaces.create({
  image: "node-20",       // Node.js 20 image
  vcpu: 1,
  memory: 1024,           // 1 GB RAM
  zone: "us-east-1"
});

console.log("Workspace created:", ws.id);

// 2. Clone your GitHub repo
await ws.exec("git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git app");

// 3. Install dependencies
await ws.exec("cd app && npm install");

// 4. Start your server (adjust the start command to yours)
await ws.exec("cd app && npm start", { background: true });

// 5. Expose the port your server listens on (e.g. 3000)
const url = await ws.exposePort(3000);
console.log("Your backend is live at:", url);