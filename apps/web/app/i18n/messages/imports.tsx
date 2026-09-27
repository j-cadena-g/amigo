import type { ReactNode } from "react";
import { defineMessages } from "../define";

type Code = (name: string) => ReactNode;

/** The JSON transaction import dialog. Field names stay in English: they're the file format. */
export const imports = defineMessages({
  en: {
    title: "Import transactions",
    help: (code: Code) => (
      <>
        Paste JSON with a {code("rows")} array. Each row needs {code("date")}, {code("type")},{" "}
        {code("category")}, and {code("amount")} in major units (for example 12.34). Optional
        fields: {code("description")}, {code("currency")}, {code("budgetId")}, {code("accountId")},{" "}
        {code("externalId")}. Maximum 200 rows per request.
      </>
    ),
    textareaLabel: "Import transactions JSON",
    dryRun: "Dry run (check the rows without importing)",
    check: "Check rows",
    checking: "Checking…",
    importing: "Importing…",
    invalidJson: "That isn't valid JSON. Check for a missing comma, quote, or bracket.",
    needsRows: 'JSON must be an object with a "rows" array.',
    emptyRows: '"rows" needs at least one transaction.',
    ready: (count: number) =>
      `${count} ${count === 1 ? "row" : "rows"} ready. Turn off dry run to import.`,
    imported: (count: number) => `Imported ${count} ${count === 1 ? "transaction" : "transactions"}.`,
    action: "import the transactions",
  },
  es: {
    title: "Importar movimientos",
    help: (code: Code) => (
      <>
        Pega un JSON con un arreglo {code("rows")}. Cada fila necesita {code("date")},{" "}
        {code("type")}, {code("category")} y {code("amount")} en unidades enteras (por ejemplo
        12.34). Campos opcionales: {code("description")}, {code("currency")}, {code("budgetId")},{" "}
        {code("accountId")}, {code("externalId")}. Máximo 200 filas por solicitud.
      </>
    ),
    textareaLabel: "JSON de movimientos para importar",
    dryRun: "Prueba (revisa las filas sin importarlas)",
    check: "Revisar filas",
    checking: "Revisando…",
    importing: "Importando…",
    invalidJson: "Eso no es un JSON válido. Revisa si falta una coma, unas comillas o un corchete.",
    needsRows: 'El JSON debe ser un objeto con un arreglo "rows".',
    emptyRows: '"rows" necesita al menos un movimiento.',
    ready: (count: number) =>
      `${count} ${count === 1 ? "fila lista" : "filas listas"}. Desactiva la prueba para importar.`,
    imported: (count: number) =>
      `Se ${count === 1 ? "importó 1 movimiento" : `importaron ${count} movimientos`}.`,
    action: "importar los movimientos",
  },
});
