import type { LoaderFunctionArgs } from "react-router";
import { type MetaArgs, useLoaderData } from "react-router";
import { requireSession, getEnv } from "@/app/lib/session.server";
import {
  getDb,
  users,
  households,
  groceryItems,
  groceryItemTags,
  groceryTags,
  eq,
  and,
  asc,
  isNull,
  sql,
  parseHomeCurrency,
  scopeToHousehold,
  type FormatLocale,
  type UiLanguage,
} from "@amigo/db";
import { LedgerSection } from "@/app/components/ledger";
import { AccountSettings } from "@/app/components/settings/account-settings";
import { RegionSettings } from "@/app/components/settings/region-settings";
import { resolveLanguage, resolveLocale } from "@/app/lib/locale";
import { HouseholdSettingsForm } from "@/app/components/settings/household-settings-form";
import { InviteManager } from "@/app/components/settings/invite-manager";
import { LeaveHousehold } from "@/app/components/settings/leave-household";
import { MemberRoleManager } from "@/app/components/settings/member-role-manager";
import { NotificationSettings } from "@/app/components/settings/notification-settings";
import { TagManager } from "@/app/components/settings/tag-manager";
import { SettingsThemeToggle } from "@/app/components/settings/theme-toggle";
import { pageTitle, useT } from "@/app/i18n";

/** Saved choices plus what "Automatic" would resolve to, for the region controls. */
function regionChoices({
  savedLocale,
  savedLanguage,
  homeCurrency,
  acceptLanguage,
}: {
  savedLocale: FormatLocale | null;
  savedLanguage: UiLanguage | null;
  homeCurrency: string | undefined;
  acceptLanguage: string | null;
}) {
  // Automatic format honors a saved language; automatic language ignores it.
  const automaticLocale = resolveLocale({ homeCurrency, acceptLanguage, language: savedLanguage });
  const effectiveLocale = resolveLocale({ preferred: savedLocale, homeCurrency, acceptLanguage });
  return {
    savedLocale,
    automaticLocale,
    savedLanguage,
    automaticLanguage: resolveLanguage({ locale: effectiveLocale }),
  };
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const session = requireSession(context);
  const env = getEnv(context);
  const db = getDb(env.DB);

  const [household, currentUser, members, tags] = await Promise.all([
    db.query.households.findFirst({
      where: eq(households.id, session.householdId),
    }),
    db.query.users.findFirst({
      where: and(
        eq(users.id, session.userId),
        scopeToHousehold(users.householdId, session.householdId)
      ),
      columns: { locale: true, language: true },
    }),
    db.query.users.findMany({
      where: and(
        scopeToHousehold(users.householdId, session.householdId),
        isNull(users.deletedAt)
      ),
      columns: { id: true, name: true, email: true, role: true },
    }),
    db
      .select({
        id: groceryTags.id,
        name: groceryTags.name,
        color: groceryTags.color,
        itemCount: sql<number>`count(${groceryItems.id})`,
      })
      .from(groceryTags)
      .leftJoin(groceryItemTags, eq(groceryItemTags.tagId, groceryTags.id))
      .leftJoin(
        groceryItems,
        and(
          eq(groceryItems.id, groceryItemTags.itemId),
          scopeToHousehold(groceryItems.householdId, session.householdId),
          isNull(groceryItems.deletedAt)
        )
      )
      .where(scopeToHousehold(groceryTags.householdId, session.householdId))
      .groupBy(groceryTags.id)
      .orderBy(asc(sql`lower(${groceryTags.name})`))
      .all(),
  ]);

  return {
    household: household!,
    ...regionChoices({
      savedLocale: currentUser?.locale ?? null,
      savedLanguage: currentUser?.language ?? null,
      homeCurrency: household?.homeCurrency,
      acceptLanguage: request.headers.get("Accept-Language"),
    }),
    members,
    tags,
    session: {
      userId: session.userId,
      role: session.role,
    },
  };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.settings);
}

export default function Settings() {
  const t = useT();
  const {
    household,
    savedLocale,
    automaticLocale,
    savedLanguage,
    automaticLanguage,
    members,
    tags,
    session,
  } = useLoaderData<typeof loader>();
  const canManageHousehold =
    session.role === "owner" || session.role === "admin";

  return (
    <main className="container mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="max-w-2xl">
        <h1 className="type-display text-title-sm md:text-title">{t.nav.settings}</h1>

        <div className="mt-8 space-y-10">
          <LedgerSection title={t.settings.sections.household}>
            <div className="pt-4">
              <HouseholdSettingsForm
                name={household.name}
                homeCurrency={parseHomeCurrency(household.homeCurrency)}
                timezone={household.timezone ?? "UTC"}
                canEdit={canManageHousehold}
              />
            </div>
          </LedgerSection>

          <LedgerSection
            title={t.settings.sections.members}
            aside={
              <span className="font-mono text-sm text-muted-foreground">
                {members.length}
              </span>
            }
          >
            <ul className="divide-y divide-border">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {member.name || member.email}
                      {member.id === session.userId && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          {t.settings.you}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t.settings.roles[member.role]}
                    </p>
                  </div>
                  {member.id !== session.userId && canManageHousehold && (
                    <MemberRoleManager
                      member={{
                        id: member.id,
                        displayName: member.name || member.email,
                        role: member.role,
                      }}
                      currentUserRole={session.role}
                      currentUserId={session.userId}
                    />
                  )}
                </li>
              ))}
            </ul>
          </LedgerSection>

          {canManageHousehold && (
            <LedgerSection title={t.settings.sections.invites}>
              <div className="pt-4">
                <InviteManager />
              </div>
            </LedgerSection>
          )}

          <TagManager tags={tags} />

          <LedgerSection title={t.settings.sections.notifications}>
            <div className="pt-4">
              <NotificationSettings />
            </div>
          </LedgerSection>

          <LedgerSection title={t.settings.sections.region}>
            <div className="pt-4">
              <RegionSettings
                savedLocale={savedLocale}
                automaticLocale={automaticLocale}
                savedLanguage={savedLanguage}
                automaticLanguage={automaticLanguage}
                homeCurrency={parseHomeCurrency(household.homeCurrency)}
              />
            </div>
          </LedgerSection>

          <LedgerSection title={t.settings.sections.appearance}>
            <div className="pt-4">
              <SettingsThemeToggle />
              <p className="mt-2 text-sm text-muted-foreground">
                {t.settings.appearanceHint}
              </p>
            </div>
          </LedgerSection>

          <LedgerSection title={t.settings.sections.account}>
            <div className="pt-4">
              <AccountSettings />
            </div>
          </LedgerSection>

          <LedgerSection title={t.settings.sections.leaveHousehold}>
            <div className="pt-4">
              <LeaveHousehold role={session.role} />
            </div>
          </LedgerSection>
        </div>
      </div>
    </main>
  );
}
