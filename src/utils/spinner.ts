import ora from "ora";

export function spinner(text: string) {
  return ora({ text, color: "cyan" });
}
