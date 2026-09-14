import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const notebook = JSON.parse(readFileSync("notebooks/01_analysis.ipynb", "utf8"));
const code = notebook.cells
  .filter((cell) => cell.cell_type === "code")
  .map((cell) => cell.source.join(""))
  .join("\n\n");

const deno = resolve("node_modules", "deno", process.platform === "win32" ? "deno.exe" : "deno");
const result = spawnSync(deno, ["run", "--allow-read=..", "--allow-write=../data", "-"], {
  cwd: "notebooks",
  input: `const display = (..._args: unknown[]) => {};\n${code}`,
  stdio: ["pipe", "inherit", "inherit"],
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
