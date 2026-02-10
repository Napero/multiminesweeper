import { App } from "./ui/app";

async function main(): Promise<void> {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  if (!canvas) throw new Error("Canvas element not found");

  const app = new App(canvas);
  await app.init();
}

main().catch(console.error);
