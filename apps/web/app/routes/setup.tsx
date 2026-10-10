import { useState } from "react";
import { useAuth } from "@clerk/react-router";
import {
  type LoaderFunctionArgs,
  type MetaArgs,
  redirect,
  useLoaderData,
  useNavigate,
} from "react-router";
import { CURRENCY_CODES } from "@amigo/db";
import { NativeSelect } from "@/app/components/financial/form-controls";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Wordmark } from "@/app/components/wordmark";
import { acceptInvite } from "@/app/lib/accept-invite";
import {
  buildTimezoneOptions,
  getBrowserTimezone,
} from "@/app/lib/timezones";
import { getSessionStatus } from "@/app/lib/session.server";
import { pageTitle, useLanguage, useT } from "@/app/i18n";
import { parseAcceptLanguage } from "@/app/lib/locale";
import { useLocale } from "@/app/lib/use-locale";
import { currencyName, defaultCurrencyForLocale } from "@/app/lib/currency";

export function loader({ context, request }: LoaderFunctionArgs) {
  const status = getSessionStatus(context);

  if (status === "unauthenticated") {
    throw redirect("/");
  }

  if (status === "authenticated") {
    throw redirect("/dashboard");
  }

  if (status === "revoked") {
    throw redirect("/restore-account");
  }

  // The browser's region ("en-US" → USD), not the display format, which may
  // keep a household default.
  const regional = parseAcceptLanguage(request.headers.get("Accept-Language")).find((tag) => {
    try {
      return Boolean(new Intl.Locale(tag).region);
    } catch {
      return false;
    }
  });
  return { regionCurrency: regional ? defaultCurrencyForLocale(regional) : null };
}

export function meta({ matches }: MetaArgs) {
  return pageTitle(matches, (t) => t.nav.setUpHousehold);
}

export default function Setup() {
  const t = useT();
  const language = useLanguage();
  const locale = useLocale();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [householdName, setHouseholdName] = useState(t.onboarding.defaultHouseholdName);
  const { regionCurrency } = useLoaderData<typeof loader>();
  const [currency, setCurrency] = useState<string>(
    () => regionCurrency ?? defaultCurrencyForLocale(locale)
  );
  const [timezone, setTimezone] = useState(getBrowserTimezone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          householdName: householdName.trim(),
          homeCurrency: currency,
          timezone,
        }),
      });

      if (res.ok) {
        navigate("/dashboard");
        return;
      }

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? t.common.couldNot(t.onboarding.createAction));
    } catch {
      setError(t.common.couldNotConnection(t.onboarding.createAction));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptInvite(e: React.FormEvent) {
    e.preventDefault();
    setAcceptingInvite(true);
    setInviteError(null);

    const result = await acceptInvite(inviteCode.trim(), getToken);
    if (result.ok) {
      navigate("/dashboard");
      return;
    }

    setInviteError(result.error ?? (result.network ? t.onboarding.networkError : t.onboarding.acceptFailed));
    setAcceptingInvite(false);
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
        <Wordmark />
        <h1 className="type-display mt-6 text-title-sm">{t.nav.setUpHousehold}</h1>

        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowInviteCode((open) => !open)}
            aria-expanded={showInviteCode}
            aria-controls="invite-code-form"
            className="block py-2 text-left text-muted-foreground hover:text-foreground"
          >
            {showInviteCode
              ? t.onboarding.hideInviteCode
              : t.onboarding.joiningSomeone(
                  <span className="font-semibold text-foreground underline decoration-muted-foreground/60 underline-offset-4">
                    {t.onboarding.enterInviteCode}
                  </span>
                )}
          </button>

          {showInviteCode && (
            <form
              id="invite-code-form"
              onSubmit={handleAcceptInvite}
              className="mt-4 border-b border-border pb-8"
            >
              <label htmlFor="inviteCode" className="block text-sm font-semibold">
                {t.onboarding.inviteCode}
              </label>
              <Input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="mt-1.5 font-mono uppercase"
                placeholder="AMIGO-XXXXXXXXXXXXX"
                autoComplete="off"
                required
              />

              {inviteError && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {inviteError}
                </p>
              )}

              <Button
                type="submit"
                disabled={acceptingInvite || inviteCode.trim().length === 0}
                className="mt-4 w-full"
              >
                {acceptingInvite ? t.onboarding.joining : t.onboarding.join}
              </Button>
            </form>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="householdName" className="block text-sm font-semibold">
              {t.onboarding.householdName}
            </label>
            <Input
              id="householdName"
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              required
              maxLength={100}
              aria-describedby="householdName-hint"
              className="mt-1.5"
            />
            <p id="householdName-hint" className="mt-1.5 text-sm text-muted-foreground">
              {t.onboarding.householdNameHint}
            </p>
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-semibold">
              {t.settings.household.homeCurrency}
            </label>
            <NativeSelect
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1.5"
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {`${code} – ${currencyName(code, language)}`}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-semibold">
              {t.settings.household.timezone}
            </label>
            <NativeSelect
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              aria-describedby="timezone-hint"
              className="mt-1.5"
            >
              {buildTimezoneOptions(timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </NativeSelect>
            <p id="timezone-hint" className="mt-1.5 text-sm text-muted-foreground">
              {t.settings.household.timezoneHint}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting || householdName.trim().length === 0}
            className="w-full"
          >
            {submitting ? t.onboarding.creating : t.onboarding.create}
          </Button>
        </form>
      </div>
    </main>
  );
}
