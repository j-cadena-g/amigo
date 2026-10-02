import type { UiLanguage } from "@amigo/db";

/**
 * Spanish for every user-facing message the API sends as `{ error }`. The
 * English text is the key, so handlers keep throwing plain English and
 * `localizeErrorResponse` translates on the way out. `server-messages.test.ts`
 * scans the server source and fails when a message has no translation here.
 */
const ES: Record<string, string> = {
  "The import currency differs from the account. Confirm the currency before continuing.": "La moneda de la importación difiere de la cuenta. Confirma la moneda antes de continuar.",
  "An OFX description exceeds 500 characters.":
    "Una descripción del archivo OFX supera los 500 caracteres.",
  "CSV account identity is missing.":
    "Falta la cuenta en el archivo CSV.",
  "CSV amount exceeds the supported range.":
    "Un monto del archivo CSV supera el rango admitido.",
  "CSV description exceeds 500 characters.":
    "Una descripción del archivo CSV supera los 500 caracteres.",
  "CSV files must be under 2 MB.":
    "Los archivos CSV deben pesar menos de 2 MB.",
  "CSV files must contain 1–2,000 transactions.":
    "Los archivos CSV deben tener entre 1 y 2.000 movimientos.",
  "CSV files support at most 2,000 transactions.":
    "Los archivos CSV admiten como máximo 2.000 movimientos.",
  "CSV row has an unexpected number of columns.":
    "Una fila del archivo CSV tiene un número de columnas inesperado.",
  "Choose a CSV containing one Wealthsimple account.":
    "Elige un archivo CSV con una sola cuenta de Wealthsimple.",
  "Choose a Wealthsimple activity CSV with the original column headers.":
    "Elige un CSV de actividad de Wealthsimple con los encabezados de columna originales.",
  "Choose an OFX file containing one bank or credit-card account.":
    "Elige un archivo OFX con una sola cuenta bancaria o de tarjeta de crédito.",
  "Conflicting transactions share an OFX transaction ID.":
    "Hay movimientos distintos con el mismo ID de transacción OFX.",
  "Invalid CSV cash amount.":
    "Monto no válido en el archivo CSV.",
  "Invalid CSV effective date.":
    "Fecha no válida en el archivo CSV.",
  "Invalid OFX amount: expected at most two decimal places.":
    "Monto OFX no válido: se esperaban como máximo dos decimales.",
  "Invalid OFX posting date.":
    "Fecha de registro OFX no válida.",
  "Invalid or incomplete OFX file.":
    "El archivo OFX no es válido o está incompleto.",
  "Malformed CSV quoting.":
    "Las comillas del archivo CSV no son válidas.",
  "OFX amounts must be nonzero and within the supported range.":
    "Los montos OFX deben ser distintos de cero y estar dentro del rango admitido.",
  "OFX corrections or transaction-level currencies are not supported yet.":
    "Aún no se admiten correcciones OFX ni monedas por movimiento.",
  "OFX files must be under 2 MB.":
    "Los archivos OFX deben pesar menos de 2 MB.",
  "Only Wealthsimple Chequing cash activities are supported; investment trades are not transaction imports.":
    "Solo se admiten movimientos de efectivo de Wealthsimple Chequing; las operaciones de inversión no se importan como movimientos.",
  "Select the source bank: this file has no bank identifier.":
    "Selecciona el banco de origen: este archivo no identifica al banco.",
  "The OFX file contains a bank error.":
    "El archivo OFX contiene un error del banco.",
  "The OFX file must contain 1–2,000 complete transactions.":
    "El archivo OFX debe tener entre 1 y 2.000 movimientos completos.",
  "Unclosed CSV quote.":
    "Hay comillas sin cerrar en el archivo CSV.",
  "Unsupported CSV currency.":
    "La moneda del archivo CSV no es compatible.",
  "Unsupported OFX currency.":
    "La moneda del archivo OFX no es compatible.",
  "A category with this name already exists": "Ya existe una categoría con este nombre",
  "A primary email address is required to join a household":
    "Se necesita un correo principal para unirse a un hogar",
  "A tag with this name already exists": "Ya existe una etiqueta con este nombre",
  "Account access revoked": "Se revocó el acceso a la cuenta",
  "Account not found": "No se encontró la cuenta",
  "Account was modified concurrently; retry the archive action":
    "La cuenta cambió al mismo tiempo; vuelve a intentar archivarla",
  "Admins cannot change another admin's role":
    "Los administradores no pueden cambiar el rol de otro administrador",
  "Admins cannot remove other admins": "Los administradores no pueden quitar a otros administradores",
  "Audit record not found": "No se encontró el registro del historial",
  "Budget not found": "No se encontró el presupuesto",
  "Cannot archive another user's personal account":
    "No puedes archivar la cuenta personal de otra persona",
  "Cannot change owner's role directly. Use ownership transfer instead.":
    "No se puede cambiar el rol del propietario directamente. Usa la transferencia de propiedad.",
  "Cannot delete another user's personal account":
    "No puedes eliminar la cuenta personal de otra persona",
  "Cannot delete another user's personal budget":
    "No puedes eliminar el presupuesto personal de otra persona",
  "Cannot remove the owner": "No se puede quitar al propietario",
  "Cannot remove this member — they may have become the owner":
    "No se puede quitar a este miembro: puede que ahora sea el propietario",
  "Cannot remove yourself": "No puedes quitarte a ti mismo",
  "Category not found": "No se encontró la categoría",
  "Duplicate category mappings": "Hay vínculos de categoría repetidos",
  "End date must be on or after the first occurrence date":
    "La fecha de fin debe ser igual o posterior a la primera fecha",
  "Explicit admin takeover is required to share another user's personal financial object":
    "Para compartir un registro personal de otra persona, un administrador debe tomarlo explícitamente",
  "Failed to clear household metadata from Clerk user":
    "No se pudieron borrar los datos del hogar de la cuenta",
  "Failed to create category": "No se pudo crear la categoría",
  "Failed to create item": "No se pudo crear el artículo",
  "Failed to refresh home currency rates":
    "No se pudieron actualizar las tasas de cambio de la moneda principal",
  "Failed to resolve import category": "No se pudo resolver la categoría importada",
  "Failed to restore account": "No se pudo restaurar la cuenta",
  "Failed to start fresh": "No se pudo empezar de nuevo",
  "Failed to update category": "No se pudo actualizar la categoría",
  "Household not found": "No se encontró el hogar",
  "Household owner not found": "No se encontró al propietario del hogar",
  "Household setup required": "Primero configura tu hogar",
  "Internal server error": "Error interno del servidor",
  "Invalid JSON": "JSON no válido",
  "Invalid or expired invite code": "El código de invitación no es válido o ya venció",
  "Invalid account filter": "Filtro de cuenta no válido",
  "Invalid request origin": "Origen de la solicitud no válido",
  "Invalid timezone": "Zona horaria no válida",
  'Invalid type filter; expected "income" or "expense".':
    'Filtro de tipo no válido; se esperaba "income" o "expense".',
  "Invite already revoked": "La invitación ya fue revocada",
  "Invite already used": "La invitación ya se usó",
  "Invite has no email address to resend": "La invitación no tiene un correo al cual reenviarla",
  "Invite is no longer valid": "La invitación ya no es válida",
  "Invite not found": "No se encontró la invitación",
  "Item must be marked as purchased before updating purchase date":
    "Marca el artículo como comprado antes de cambiar la fecha de compra",
  "Item not found": "No se encontró el artículo",
  "No pending restore found": "No hay una restauración pendiente",
  "Not authorized": "No autorizado",
  "Not authorized to assign this role": "No tienes permiso para asignar este rol",
  "Not authorized to manage invites": "No tienes permiso para administrar invitaciones",
  "Not authorized to manage members": "No tienes permiso para administrar miembros",
  "Not authorized to remove members": "No tienes permiso para quitar miembros",
  "One or more tag IDs are invalid": "Una o más etiquetas no son válidas",
  "Only owners and admins can archive shared accounts":
    "Solo los propietarios y administradores pueden archivar cuentas compartidas",
  "Only owners and admins can create shared accounts":
    "Solo los propietarios y administradores pueden crear cuentas compartidas",
  "Only owners and admins can create shared budgets":
    "Solo los propietarios y administradores pueden crear presupuestos compartidos",
  "Only owners and admins can delete shared accounts":
    "Solo los propietarios y administradores pueden eliminar cuentas compartidas",
  "Only owners and admins can delete shared budgets":
    "Solo los propietarios y administradores pueden eliminar presupuestos compartidos",
  "Only owners and admins can update household settings":
    "Solo los propietarios y administradores pueden cambiar la configuración del hogar",
  "Only the owner can transfer ownership": "Solo el propietario puede transferir la propiedad",
  "Owners must transfer ownership before leaving the household":
    "El propietario debe transferir la propiedad antes de salir del hogar",
  "Ownership transfer failed — please retry":
    "No se pudo transferir la propiedad. Inténtalo de nuevo",
  "Parent category not found": "No se encontró la categoría principal",
  "Recurring rule not found": "No se encontró el movimiento recurrente",
  "Restore already completed": "La restauración ya se completó",
  "Restore or permanently leave your previous household before joining another":
    "Restaura o abandona definitivamente tu hogar anterior antes de unirte a otro",
  "Session inconsistency — please sign out and back in":
    "Hay un problema con tu sesión. Cierra sesión y vuelve a entrar",
  "Session revoked": "Se revocó la sesión",
  "Session role changed — please refresh": "Tu rol cambió. Recarga la página",
  "Subcategories cannot have children": "Las subcategorías no pueden tener subcategorías",
  "Subcategory type must match parent":
    "La subcategoría debe ser del mismo tipo que su categoría principal",
  "Subscription endpoint belongs to another user":
    "Esta suscripción de notificaciones pertenece a otra persona",
  "Tag not found": "No se encontró la etiqueta",
  "Too many requests": "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo",
  "Transaction not found": "No se encontró el movimiento",
  "Transaction was modified concurrently; try again":
    "El movimiento cambió al mismo tiempo; vuelve a intentarlo",
  Unauthorized: "No autorizado",
  "Unknown category in mappings": "Hay una categoría desconocida en los vínculos",
  "Unknown or archived category": "La categoría no existe o está archivada",
  "Unknown or inaccessible account": "La cuenta no existe o no tienes acceso",
  "Unknown or inaccessible budget": "El presupuesto no existe o no tienes acceso",
  "Unsafe push subscription endpoint": "La dirección de notificaciones no es segura",
  "User is already the owner": "Esa persona ya es la propietaria",
  "User not found": "No se encontró a la persona",
  "User not found in household": "No se encontró a esa persona en el hogar",
  "Valid year and month are required": "Se necesita un año y un mes válidos",
  "Validation error": "Revisa los datos e inténtalo de nuevo",
  "You already belong to a household": "Ya perteneces a un hogar",
  "You are already the owner": "Ya eres el propietario",
  "categoryId is required when changing recurring type":
    "Elige una categoría al cambiar el tipo del movimiento recurrente",
  "categoryId is required when changing transaction type":
    "Elige una categoría al cambiar el tipo del movimiento",
  "chargedCurrency must differ from the transaction currency":
    "La moneda del cobro debe ser distinta de la del movimiento",
  "recordId must be a single path segment": "recordId debe ser un solo segmento de la ruta",
  "recordId path param required": "Falta el parámetro recordId",
  "table query param required": "Falta el parámetro table",
};

const ACTIONS_ES: Record<string, string> = {
  create: "crear",
  update: "actualizar",
  modify: "modificar",
  delete: "eliminar",
  archive: "archivar",
};

/** Plural feminine/masculine phrases for "shared X" and "personal X". */
const OBJECTS_ES: Record<string, { shared: string; personal: string }> = {
  account: { shared: "cuentas compartidas", personal: "la cuenta personal" },
  budget: { shared: "presupuestos compartidos", personal: "el presupuesto personal" },
};

const TYPES_ES: Record<string, string> = {
  income: "ingreso",
  expense: "gasto",
};

const word = (map: Record<string, string>, key: string) => map[key] ?? key;

/** Messages built from templates in handlers; each capture is a template slot. */
const PATTERNS_ES: [RegExp, (...slots: string[]) => string][] = [
  [
    /^Only owners and admins can modify shared (\w+)s$/,
    (object) =>
      `Solo los propietarios y administradores pueden modificar ${OBJECTS_ES[object]?.shared ?? object}`,
  ],
  [
    /^Cannot (\w+) another user's personal (\w+)$/,
    (action, object) =>
      `No puedes ${word(ACTIONS_ES, action)} ${OBJECTS_ES[object]?.personal ?? object} de otra persona`,
  ],
  [
    /^Cannot (\w+) another user's transaction$/,
    (action) => `No puedes ${word(ACTIONS_ES, action)} el movimiento de otra persona`,
  ],
  [/^Category type must be (\w+)$/, (type) => `La categoría debe ser de tipo ${word(TYPES_ES, type)}`],
  [
    /^Unknown or inaccessible budget\(s\): (.+)$/,
    (ids) => `Presupuestos que no existen o sin acceso: ${ids}`,
  ],
  [
    /^Unknown or inaccessible account\(s\): (.+)$/,
    (ids) => `Cuentas que no existen o sin acceso: ${ids}`,
  ],
  [
    /^Missing or repeated OFX field: (\w+)\.$/,
    (name) => `Falta o se repite el campo OFX ${name}.`,
  ],
  [
    /^Invalid (\w+) filter; expected "true" or "false"\.$/,
    (label) => `Filtro ${label} no válido; se esperaba "true" o "false".`,
  ],
];

/** Readable names for bank charges found in an imported description. */
export const BANK_CHARGE_LABELS: Record<
  UiLanguage,
  { interestCharge: string; cardFee: string }
> = {
  en: { interestCharge: "Interest charge", cardFee: "Card fee" },
  es: { interestCharge: "Cargo por intereses", cardFee: "Cargo de la tarjeta" },
};

/** The message in `language`, or unchanged when there's no translation. */
export function translateServerMessage(message: string, language: UiLanguage): string {
  if (language === "en") return message;
  const exact = ES[message];
  if (exact) return exact;
  for (const [pattern, render] of PATTERNS_ES) {
    const match = pattern.exec(message);
    if (match) return render(...match.slice(1));
  }
  return message;
}

/** For tests: whether a literal message has a Spanish entry. */
export function hasServerTranslation(message: string): boolean {
  return translateServerMessage(message, "es") !== message;
}
