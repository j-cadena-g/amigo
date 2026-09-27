import type { ReactNode } from "react";
import { defineMessages } from "../define";

type Role = "owner" | "admin" | "member";

/** Settings page sections and the household, region, appearance, and account forms. */
export const settings = defineMessages({
  en: {
    sections: {
      household: "Household",
      members: "Members",
      invites: "Invites",
      notifications: "Notifications",
      region: "Language and region",
      appearance: "Appearance",
      account: "Account",
      leaveHousehold: "Leave household",
    },
    roles: { owner: "Owner", admin: "Admin", member: "Member" } satisfies Record<Role, string>,
    you: "(you)",
    appearanceHint: "Applies to this device only.",
    theme: {
      label: "Theme",
      light: "Light",
      dark: "Dark",
      system: "System",
    },
    region: {
      language: "Language",
      format: "Number and date format",
      automatic: (resolved: string) => `Automatic · ${resolved}`,
      hint: "Applies to your account on every device. Automatic follows your household's currency, or your browser's language if it's different.",
      saveLanguage: "save the language",
      saveFormat: "save the number and date format",
    },
    household: {
      readOnly: "Only the owner or an admin can change these.",
      homeCurrency: "Home currency",
      homeCurrencyHint:
        "Used for household totals. Changing it refreshes conversion rates; native amounts stay the same.",
      timezone: "Timezone",
      timezoneHint: "Budget periods and transaction dates use your household's local calendar day.",
      saveChanges: "Save changes",
      saved: "Household settings saved",
      saveAction: "save household settings",
      confirmCurrencyTitle: "Change home currency?",
      confirmCurrencyBody:
        "This updates household totals and conversion rates for accounts, debts, assets, transactions, and budgets. Native amounts in each record's own currency are not changed.",
      confirmCurrency: "Change currency",
    },
    account: {
      signedInAs: (email: ReactNode) => <>Signed in as {email}</>,
      signedIn: "Signed in",
    },
    leave: {
      confirmTitle: "Leave this household?",
      confirmBody: "You'll lose access right away. Sign back in within 14 days to restore your access.",
      button: "Leave household",
      leaving: "Leaving…",
      action: "leave the household",
      ownerBlocked:
        "You own this household, so you can't leave it yet. First choose Manage next to another member, then Transfer ownership.",
      body: "You'll lose access to the household's lists and money right away. You can restore your access within 14 days.",
    },
  },
  es: {
    sections: {
      household: "Hogar",
      members: "Miembros",
      invites: "Invitaciones",
      notifications: "Notificaciones",
      region: "Idioma y región",
      appearance: "Apariencia",
      account: "Cuenta",
      leaveHousehold: "Salir del hogar",
    },
    roles: { owner: "Propietario", admin: "Administrador", member: "Miembro" },
    you: "(tú)",
    appearanceHint: "Solo se aplica en este dispositivo.",
    theme: {
      label: "Tema",
      light: "Claro",
      dark: "Oscuro",
      system: "Sistema",
    },
    region: {
      language: "Idioma",
      format: "Formato de números y fechas",
      automatic: (resolved: string) => `Automático · ${resolved}`,
      hint: "Se aplica a tu cuenta en todos tus dispositivos. Automático sigue la moneda de tu hogar, o el idioma de tu navegador si es diferente.",
      saveLanguage: "guardar el idioma",
      saveFormat: "guardar el formato de números y fechas",
    },
    household: {
      readOnly: "Solo el propietario o un administrador puede cambiar esto.",
      homeCurrency: "Moneda principal",
      homeCurrencyHint:
        "Se usa para los totales del hogar. Al cambiarla se actualizan las tasas de cambio; los montos originales no cambian.",
      timezone: "Zona horaria",
      timezoneHint:
        "Los periodos de presupuesto y las fechas de los movimientos usan el día local de tu hogar.",
      saveChanges: "Guardar cambios",
      saved: "Se guardó la configuración del hogar",
      saveAction: "guardar la configuración del hogar",
      confirmCurrencyTitle: "¿Cambiar la moneda principal?",
      confirmCurrencyBody:
        "Esto actualiza los totales del hogar y las tasas de cambio de cuentas, deudas, activos, movimientos y presupuestos. Los montos en la moneda original de cada registro no cambian.",
      confirmCurrency: "Cambiar moneda",
    },
    account: {
      signedInAs: (email: ReactNode) => <>Sesión iniciada como {email}</>,
      signedIn: "Sesión iniciada",
    },
    leave: {
      confirmTitle: "¿Salir de este hogar?",
      confirmBody:
        "Perderás el acceso de inmediato. Vuelve a iniciar sesión en los próximos 14 días para recuperarlo.",
      button: "Salir del hogar",
      leaving: "Saliendo…",
      action: "salir del hogar",
      ownerBlocked:
        "Eres el propietario de este hogar, así que todavía no puedes salir. Primero elige Administrar junto a otro miembro y luego Transferir propiedad.",
      body: "Perderás el acceso a las listas y al dinero del hogar de inmediato. Puedes recuperar el acceso en los próximos 14 días.",
    },
  },
});
