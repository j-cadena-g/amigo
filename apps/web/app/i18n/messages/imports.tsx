import { defineMessages } from "../define";

export const imports = defineMessages({
  en: {
    amountCurrency: "Currency of the exported amounts",
    useFileCurrency: "Use the file's currency",
    overrideHelp:
      "Choose the currency of the posted amounts shown on your bank statement. This changes the currency label only; the numbers are not converted.",
    repairCurrency:
      "Correct matching transactions already imported (do not add new transactions)",
    repairHelp:
      "Only your matching imports in this account with unchanged amounts and the original file currency can be corrected. Categories and descriptions are preserved. Deleted entries and entries with a separate charged amount are excluded.",
    correctCurrency: "Correct currency",
    noCorrection: "No matching correction",
    originalCurrency: "Original file currency",
    corrected: (count: number) =>
      `Corrected the currency of ${count} ${count === 1 ? "transaction" : "transactions"}. Amounts were unchanged.`,
    currencyMismatch: (currency: string) =>
      `The imported amounts use a different currency from this account (${currency}). Check the posted amounts and select the correct currency before continuing.`,
    acceptCurrencyMismatch:
      "I confirm these amounts are in the selected import currency, despite the different account currency.",
    bank: "Source bank",
    bankFromFile: "Read bank from file",
    currency: "Import currency",
    zeroAmount: "Zero — skipped",
    possibleDuplicate: "Possible duplicate",
    csvWarning:
      "CSV matches are possible duplicates, not bank-confirmed IDs. They start unchecked; include one only if it is a separate transaction. Transfers and credits also start unchecked. Zero-value rows are skipped.",
    title: "Import transactions",
    ofxHelp:
      "Upload an OFX/QFX bank download or Wealthsimple Chequing activity CSV (up to 2 MB / 2,000 transactions). For National Bank, choose OFX v1.0.2. New transactions are imported as Uncategorized for review.",
    file: "Transaction file",
    account: "Destination account",
    chooseAccount: "Choose an account",
    noAccounts: "Create a financial account before importing.",
    fileError:
      "Choose an OFX/QFX file (UTF-8 or Windows-1252), or a Wealthsimple UTF-8 CSV, under 2 MB.",
    preview: "Preview transactions",
    include: "Include",
    date: "Date",
    description: "Description",
    nameFor: (date: string, amount: string) => `Name for ${date}, ${amount}`,
    uncategorized: "Uncategorized",
    categoryFor: (date: string, amount: string) => `Category for ${date}, ${amount}`,
    suggested: "Suggested",
    applyToMerchant: (category: string, count: number, name: string) =>
      `Apply ${category} to ${count} other ${name} ${count === 1 ? "row" : "rows"}?`,
    apply: "Apply",
    dismiss: "Dismiss",
    remembered: (count: number) =>
      `Remembered ${count} ${count === 1 ? "merchant" : "merchants"} for next time.`,
    amount: "Amount",
    duplicate: "Duplicate — skipped",
    creditsWarning:
      "Credits are unchecked by default. Including a credit records it as income. Leave card payments and transfers unchecked; review refunds separately.",
    previewSummary: (selected: number, duplicates: number) =>
      `${selected} selected · ${duplicates} ${duplicates === 1 ? "duplicate" : "duplicates"} will be skipped.`,
    finished: (inserted: number, skipped: number) =>
      `Imported ${inserted} ${inserted === 1 ? "transaction" : "transactions"}. Skipped ${skipped} ${skipped === 1 ? "duplicate" : "duplicates"}.`,
    checking: "Checking…",
    importing: "Importing…",
    action: "import the transactions",
  },
  es: {
    amountCurrency: "Moneda de los importes exportados",
    useFileCurrency: "Usar la moneda del archivo",
    overrideHelp:
      "Elige la moneda de los importes contabilizados en tu estado de cuenta. Solo cambia la etiqueta de moneda; no se convierten los importes.",
    repairCurrency:
      "Corregir movimientos ya importados que coincidan (sin agregar nuevos)",
    repairHelp:
      "Solo se corrigen importaciones de esta cuenta con importes sin cambios y la moneda original del archivo. Se conservan las categorías y descripciones. Se excluyen movimientos eliminados o con un importe cobrado separado.",
    correctCurrency: "Corregir moneda",
    noCorrection: "Sin corrección aplicable",
    originalCurrency: "Moneda original del archivo",
    corrected: (count: number) =>
      `Se corrigió la moneda de ${count} ${count === 1 ? "movimiento" : "movimientos"} sin cambiar sus importes.`,
    currencyMismatch: (currency: string) =>
      `Los importes usan una moneda distinta de la cuenta (${currency}). Comprueba los importes contabilizados y elige la moneda correcta.`,
    acceptCurrencyMismatch:
      "Confirmo que los importes están en la moneda seleccionada, aunque sea distinta de la moneda de la cuenta.",
    bank: "Banco de origen",
    bankFromFile: "Leer banco del archivo",
    currency: "Moneda de importación",
    zeroAmount: "Cero — se omite",
    possibleDuplicate: "Posible duplicado",
    csvWarning:
      "Las coincidencias CSV son posibles duplicados, sin identificadores bancarios. No se seleccionan por defecto; incluye una solo si es otro movimiento. Las transferencias y los abonos tampoco se seleccionan. Se omiten importes de cero.",
    title: "Importar movimientos",
    ofxHelp:
      "Carga un archivo OFX/QFX del banco o un CSV de actividades de Wealthsimple Chequing (hasta 2 MB / 2.000 movimientos). Para National Bank, elige OFX v1.0.2. Los movimientos se importan sin clasificar (Uncategorized) para su revisión.",
    file: "Archivo de movimientos",
    account: "Cuenta de destino",
    chooseAccount: "Elige una cuenta",
    noAccounts: "Crea una cuenta financiera antes de importar.",
    fileError:
      "Elige un archivo OFX/QFX (UTF-8 o Windows-1252) o CSV de Wealthsimple (UTF-8), de menos de 2 MB.",
    preview: "Vista previa",
    include: "Incluir",
    date: "Fecha",
    description: "Descripción",
    nameFor: (date: string, amount: string) => `Nombre para ${date}, ${amount}`,
    uncategorized: "Sin categoría",
    categoryFor: (date: string, amount: string) => `Categoría para ${date}, ${amount}`,
    suggested: "Sugerida",
    applyToMerchant: (category: string, count: number, name: string) =>
      `¿Aplicar ${category} a ${count} ${count === 1 ? "fila" : "filas"} más de ${name}?`,
    apply: "Aplicar",
    dismiss: "Descartar",
    remembered: (count: number) =>
      count === 1
        ? "Se recordó 1 comercio para la próxima vez."
        : `Se recordaron ${count} comercios para la próxima vez.`,
    amount: "Importe",
    duplicate: "Duplicado — se omite",
    creditsWarning:
      "Los abonos no se seleccionan por defecto. Incluir un abono lo registra como ingreso. Excluye pagos de tarjeta y transferencias; revisa los reembolsos por separado.",
    previewSummary: (selected: number, duplicates: number) =>
      `${selected} ${selected === 1 ? "seleccionado" : "seleccionados"} · ${duplicates === 1 ? "Se omitirá 1 duplicado" : `Se omitirán ${duplicates} duplicados`}.`,
    finished: (inserted: number, skipped: number) =>
      `${inserted === 1 ? "Se importó 1 movimiento" : `Se importaron ${inserted} movimientos`}. ${skipped === 1 ? "Se omitió 1 duplicado" : `Se omitieron ${skipped} duplicados`}.`,
    checking: "Revisando…",
    importing: "Importando…",
    action: "importar los movimientos",
  },
});
