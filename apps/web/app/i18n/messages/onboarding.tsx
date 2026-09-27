import type { ReactNode } from "react";
import { defineMessages } from "../define";

/** Setting up, joining, and restoring a household. */
export const onboarding = defineMessages({
  en: {
    defaultHouseholdName: "My household",
    hideInviteCode: "Hide invite code",
    joiningSomeone: (link: ReactNode) => <>Joining someone&apos;s household? {link}</>,
    enterInviteCode: "Enter an invite code",
    inviteCode: "Invite code",
    join: "Join household",
    joining: "Joining…",
    householdName: "Household name",
    householdNameHint: "Everyone you invite sees this name. You can change it later in Settings.",
    create: "Create household",
    creating: "Creating…",
    createAction: "create the household",
    acceptFailed: "Couldn't accept the invite. Try again.",
    networkError: "Couldn't accept the invite. Check your connection and try again.",
    missingCode: "This link is missing its invite code. Open the full link from your invite.",
    signInToAccept: "Sign in or create an account to accept the invite.",
    alreadyInHousehold:
      "Your account already belongs to a household, so this invite can't be used with it. To accept it, sign in with a different account.",
    goToHousehold: "Go to your household",
    useDifferentAccount: "Use a different account",
    askForNew: "If the invite expired or was already used, ask for a new one.",
    createInstead: "Create a household instead",
    accepting: "Accepting the invite…",
    opening: "Opening the invite…",
    restoreTitle: "Restore your household?",
    noLongerMember: (household: ReactNode) => (
      <>
        You&apos;re no longer a member of {household}. For up to 14 days, you can restore your
        access and keep everything you added.
      </>
    ),
    yourHousehold: "your household",
    restore: "Restore household",
    restoring: "Restoring…",
    rejoin: "Rejoin as a new member",
    rejoining: "Rejoining…",
    rejoinHint: "Rejoining as a new member hands everything you added to the household owner.",
    pendingCheckFailed: "Couldn't check whether your household can be restored. Reload to try again.",
    restoreAction: "restore your access",
    rejoinAction: "rejoin the household",
  },
  es: {
    defaultHouseholdName: "Mi hogar",
    hideInviteCode: "Ocultar código de invitación",
    joiningSomeone: (link: ReactNode) => <>¿Te vas a unir al hogar de alguien? {link}</>,
    enterInviteCode: "Escribe un código de invitación",
    inviteCode: "Código de invitación",
    join: "Unirse al hogar",
    joining: "Uniéndote…",
    householdName: "Nombre del hogar",
    householdNameHint:
      "Todas las personas que invites verán este nombre. Puedes cambiarlo después en Ajustes.",
    create: "Crear hogar",
    creating: "Creando…",
    createAction: "crear el hogar",
    acceptFailed: "No se pudo aceptar la invitación. Inténtalo de nuevo.",
    networkError: "No se pudo aceptar la invitación. Revisa tu conexión e inténtalo de nuevo.",
    missingCode:
      "A este enlace le falta el código de invitación. Abre el enlace completo de tu invitación.",
    signInToAccept: "Inicia sesión o crea una cuenta para aceptar la invitación.",
    alreadyInHousehold:
      "Tu cuenta ya pertenece a un hogar, así que no puede usar esta invitación. Para aceptarla, inicia sesión con otra cuenta.",
    goToHousehold: "Ir a tu hogar",
    useDifferentAccount: "Usar otra cuenta",
    askForNew: "Si la invitación venció o ya se usó, pide una nueva.",
    createInstead: "Mejor crear un hogar",
    accepting: "Aceptando la invitación…",
    opening: "Abriendo la invitación…",
    restoreTitle: "¿Restaurar tu hogar?",
    noLongerMember: (household: ReactNode) => (
      <>
        Ya no eres miembro de {household}. Durante 14 días puedes recuperar el acceso y conservar
        todo lo que agregaste.
      </>
    ),
    yourHousehold: "tu hogar",
    restore: "Restaurar hogar",
    restoring: "Restaurando…",
    rejoin: "Volver a unirme como miembro nuevo",
    rejoining: "Volviendo a unirte…",
    rejoinHint:
      "Si vuelves a unirte como miembro nuevo, todo lo que agregaste pasa al propietario del hogar.",
    pendingCheckFailed:
      "No se pudo comprobar si tu hogar se puede restaurar. Recarga la página para intentarlo de nuevo.",
    restoreAction: "recuperar tu acceso",
    rejoinAction: "volver a unirte al hogar",
  },
});
