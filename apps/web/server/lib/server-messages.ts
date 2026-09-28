import type { UiLanguage } from "@amigo/db";

/**
 * Spanish for every user-facing message the API sends as `{ error }`. The
 * English text is the key, so handlers keep throwing plain English and
 * `localizeErrorResponse` translates on the way out. `server-messages.test.ts`
 * scans the server source and fails when a message has no translation here.
 */
const ES: Record<string, string> = {
  "A category with this name already exists": "Ya existe una categoría con este nombre",
  "A converted account for this asset already exists and was deleted. Restore it instead of converting again.":
    "Ya existe una cuenta convertida a partir de este activo y fue eliminada. Restáurala en lugar de volver a convertirlo.",
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
  "Asset not found": "No se encontró el activo",
  "Asset was deleted and cannot be converted": "El activo fue eliminado y no se puede convertir",
  "Audit record not found": "No se encontró el registro del historial",
  "BANK assets convert to CHECKING or SAVINGS":
    "Las cuentas bancarias se convierten en cuenta corriente o de ahorros",
  "Budget not found": "No se encontró el presupuesto",
  "Cannot archive another user's personal account":
    "No puedes archivar la cuenta personal de otra persona",
  "Cannot change owner's role directly. Use ownership transfer instead.":
    "No se puede cambiar el rol del propietario directamente. Usa la transferencia de propiedad.",
  "Cannot delete another user's personal account":
    "No puedes eliminar la cuenta personal de otra persona",
  "Cannot delete another user's personal budget":
    "No puedes eliminar el presupuesto personal de otra persona",
  "Cannot delete another user's personal debt":
    "No puedes eliminar la deuda personal de otra persona",
  "Cannot remove the owner": "No se puede quitar al propietario",
  "Cannot remove this member — they may have become the owner":
    "No se puede quitar a este miembro: puede que ahora sea el propietario",
  "Cannot remove yourself": "No puedes quitarte a ti mismo",
  "Category not found": "No se encontró la categoría",
  "Converted account not found": "No se encontró la cuenta convertida",
  "Debt not found": "No se encontró la deuda",
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
  "Only owners and admins can create shared assets":
    "Solo los propietarios y administradores pueden crear activos compartidos",
  "Only owners and admins can create shared budgets":
    "Solo los propietarios y administradores pueden crear presupuestos compartidos",
  "Only owners and admins can create shared debts":
    "Solo los propietarios y administradores pueden crear deudas compartidas",
  "Only owners and admins can delete shared accounts":
    "Solo los propietarios y administradores pueden eliminar cuentas compartidas",
  "Only owners and admins can delete shared budgets":
    "Solo los propietarios y administradores pueden eliminar presupuestos compartidos",
  "Only owners and admins can delete shared debts":
    "Solo los propietarios y administradores pueden eliminar deudas compartidas",
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
  "Unsupported legacy asset type": "Tipo de activo anterior no admitido",
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
  convert: "convertir",
  archive: "archivar",
};

/** Plural feminine/masculine phrases for "shared X" and "personal X". */
const OBJECTS_ES: Record<string, { shared: string; personal: string }> = {
  account: { shared: "cuentas compartidas", personal: "la cuenta personal" },
  asset: { shared: "activos compartidos", personal: "el activo personal" },
  budget: { shared: "presupuestos compartidos", personal: "el presupuesto personal" },
  debt: { shared: "deudas compartidas", personal: "la deuda personal" },
};

const TYPES_ES: Record<string, string> = {
  income: "ingreso",
  expense: "gasto",
  BANK: "cuenta bancaria",
  INVESTMENT: "inversión",
  CASH: "efectivo",
  PROPERTY: "propiedad",
  CHECKING: "cuenta corriente",
  SAVINGS: "ahorros",
};

const word = (map: Record<string, string>, key: string) => map[key] ?? key;

/** Messages built from templates in handlers; each capture is a template slot. */
const PATTERNS_ES: [RegExp, (...slots: string[]) => string][] = [
  [
    /^Only owners and admins can (\w+) shared assets$/,
    (action) => `Solo los propietarios y administradores pueden ${word(ACTIONS_ES, action)} activos compartidos`,
  ],
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
  [
    /^Legacy (\w+) assets convert to (\w+)$/,
    (from, to) => `Los activos de tipo ${word(TYPES_ES, from)} se convierten en ${word(TYPES_ES, to)}`,
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
    /^Invalid (\w+) filter; expected "true" or "false"\.$/,
    (label) => `Filtro ${label} no válido; se esperaba "true" o "false".`,
  ],
];

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
