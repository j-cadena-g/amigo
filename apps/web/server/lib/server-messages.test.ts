import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { hasServerTranslation, translateServerMessage } from "./server-messages";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");

interface FoundMessage {
  where: string;
  literal?: string;
  template?: string;
}

/** Messages the API can send as `{ error }`: ActionError, jsonError, assertPermission, `error:`. */
function collectMessages(): FoundMessage[] {
  const found: FoundMessage[] = [];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "test") walk(full);
      } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
        files.push(full);
      }
    }
  };
  walk(SERVER_DIR);

  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const add = (node: ts.Node, arg: ts.Node | undefined) => {
      if (!arg) return;
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      const where = `${path.relative(SERVER_DIR, file)}:${line + 1}`;
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        found.push({ where, literal: arg.text });
      } else if (ts.isTemplateExpression(arg)) {
        found.push({ where, template: arg.getText() });
      }
    };
    const visit = (node: ts.Node) => {
      if (ts.isNewExpression(node) && node.expression.getText() === "ActionError") {
        add(node, node.arguments?.[0]);
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression.getText();
        if (callee === "jsonError") add(node, node.arguments[0]);
        if (callee === "assertPermission") add(node, node.arguments[1]);
      } else if (
        ts.isPropertyAssignment(node) &&
        node.name.getText() === "error" &&
        (ts.isStringLiteral(node.initializer) || ts.isTemplateExpression(node.initializer))
      ) {
        add(node, node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

/** Each templated message, with sample values that fill its slots. */
const TEMPLATE_SAMPLES: Record<string, string[]> = {
  "`Only owners and admins can ${action} shared assets`": [
    "Only owners and admins can delete shared assets",
    "Only owners and admins can convert shared assets",
  ],
  "`Cannot ${action} another user's personal asset`": [
    "Cannot delete another user's personal asset",
  ],
  "`Legacy ${existing.type} assets convert to ${defaultType}`": [
    "Legacy INVESTMENT assets convert to INVESTMENT",
  ],
  "`Cannot ${action} another user's transaction`": ["Cannot modify another user's transaction"],
  "`Category type must be ${expectedType}`": ["Category type must be expense"],
  "`Only owners and admins can modify shared ${objectName}s`": [
    "Only owners and admins can modify shared budgets",
    "Only owners and admins can modify shared accounts",
  ],
  "`Cannot modify another user's personal ${objectName}`": [
    "Cannot modify another user's personal debt",
  ],
  '`Unknown or inaccessible budget(s): ${missing.join(", ")}`': [
    "Unknown or inaccessible budget(s): b1, b2",
  ],
  '`Unknown or inaccessible account(s): ${missing.join(", ")}`': [
    "Unknown or inaccessible account(s): a1",
  ],
  '`Invalid ${label} filter; expected "true" or "false".`': [
    'Invalid reviewed filter; expected "true" or "false".',
  ],
};

describe("server messages", () => {
  const messages = collectMessages();

  it("finds the messages it is meant to check", () => {
    expect(messages.length).toBeGreaterThan(100);
  });

  it("translates every literal message into Spanish", () => {
    const missing = messages
      .filter((m) => m.literal !== undefined && !hasServerTranslation(m.literal))
      .map((m) => `${m.where}  ${m.literal}`);
    expect(missing).toEqual([]);
  });

  it("covers every templated message with a pattern", () => {
    const templates = [...new Set(messages.flatMap((m) => (m.template ? [m.template] : [])))];
    const unknown = templates.filter((template) => !(template in TEMPLATE_SAMPLES));
    expect(unknown).toEqual([]);
    for (const samples of Object.values(TEMPLATE_SAMPLES)) {
      for (const sample of samples) expect(hasServerTranslation(sample)).toBe(true);
    }
  });

  it("reads naturally in Spanish", () => {
    expect(translateServerMessage("Only owners and admins can modify shared budgets", "es")).toBe(
      "Solo los propietarios y administradores pueden modificar presupuestos compartidos"
    );
    expect(translateServerMessage("Cannot delete another user's personal asset", "es")).toBe(
      "No puedes eliminar el activo personal de otra persona"
    );
    expect(translateServerMessage("Item not found", "es")).toBe("No se encontró el artículo");
  });

  it("leaves English and unknown messages alone", () => {
    expect(translateServerMessage("Item not found", "en")).toBe("Item not found");
    expect(translateServerMessage("Something new", "es")).toBe("Something new");
  });
});
