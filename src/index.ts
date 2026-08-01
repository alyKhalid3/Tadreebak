import { bootstrap } from "./bootstrap";

bootstrap().catch((err) => {
    console.error("Bootstrap failed:", err);
    process.exit(1);
});
