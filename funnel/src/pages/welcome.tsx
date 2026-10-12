import "../index.css";

import * as React from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import {
  AI_STAGES,
  BOTTLENECKS,
  PHONE_COUNTRIES,
  TEAM_SIZES,
  cleanEmail,
  cleanName,
  normalisePhone,
  normaliseWebsite,
  type AiStage,
  type Bottleneck,
  type TeamSize,
} from "@shared/survey";
import { PageColumn, SiteHeader, mountPage } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkedInMark } from "@/components/linkedin-mark";
import { ProfileCard, type ProfileStat } from "@/components/ui/profile-card";
import {
  ChoiceQuestion,
  MultiStepForm,
  StepHeading,
  type MultiStepFormStep,
} from "@/components/ui/multistep-form";
import { config } from "@/config";
import {
  currentState,
  postJson,
  readState,
  sendEvent,
  attribution,
  writeState,
  type FunnelState,
} from "@/lib/funnel";
import { initPixel, trackPixel } from "@/lib/pixel";
import { cn } from "@/lib/utils";

/*
 * Step 2: the survey. Three multiple-choice taps, then one screen for name,
 * website and mobile. Every answer is saved the moment it's given, so even a
 * half-finished survey tells the CRM something.
 */

/** Long enough to see the choice land, short enough to feel instant. */
const PICK_DELAY_MS = 260;

type Answers = Pick<FunnelState, "stage" | "bottleneck" | "team">;

function saveAnswers(answers: Answers) {
  const { token } = readState();
  if (!token) return;
  postJson("/api/answers", { token, answers }, { keepalive: true }).catch(() => {});
}

function WelcomePage() {
  const initial = React.useMemo(() => currentState(), []);
  const [stage, setStage] = React.useState<AiStage | undefined>(initial.stage);
  const [bottleneck, setBottleneck] = React.useState<Bottleneck | undefined>(initial.bottleneck);
  const [team, setTeam] = React.useState<TeamSize | undefined>(initial.team);
  // Kept up here, not in the details step, so going back a question and
  // forward again doesn't wipe what they typed.
  const [details, setDetails] = React.useState<DetailsValues>({
    email: initial.email ?? "",
    name: initial.name ?? "",
    website: initial.website ?? "",
    country: PHONE_COUNTRIES[0].value,
    phone: "",
  });
  const pickTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    initPixel({ email: initial.email, firstName: initial.name });
    if (readState().pendingSubscribeEvent) {
      trackPixel("Subscribe");
      writeState({ pendingSubscribeEvent: false });
    }
    sendEvent("page_welcome");
    return () => window.clearTimeout(pickTimer.current);
  }, []);

  const remember = (answers: Answers) => {
    writeState(answers);
    saveAnswers(answers);
  };

  const after = (move: () => void) => {
    window.clearTimeout(pickTimer.current);
    pickTimer.current = window.setTimeout(move, PICK_DELAY_MS);
  };

  const steps: MultiStepFormStep[] = [
    {
      id: "stage",
      render: ({ next }) => (
        <>
          <Intro />
          <ChoiceQuestion
            name="stage"
            question="Where are you with AI right now?"
            options={AI_STAGES}
            value={stage}
            onChange={(value) => {
              setStage(value);
              remember({ stage: value });
            }}
            onPick={() => after(next)}
            onContinue={next}
          />
        </>
      ),
    },
    {
      id: "bottleneck",
      render: ({ next }) => (
        <ChoiceQuestion
          name="bottleneck"
          question="Where's the most manual work in your business?"
          options={BOTTLENECKS}
          value={bottleneck}
          onChange={(value) => {
            setBottleneck(value);
            remember({ bottleneck: value });
          }}
          onPick={() => after(next)}
          onContinue={next}
        />
      ),
    },
    {
      id: "team",
      render: ({ next }) => (
        <ChoiceQuestion
          name="team"
          question="How big is the team?"
          options={TEAM_SIZES}
          value={team}
          onChange={(value) => {
            setTeam(value);
            remember({ team: value });
          }}
          onPick={() => after(next)}
          onContinue={next}
        />
      ),
    },
    {
      id: "details",
      render: () => (
        <DetailsStep
          initial={initial}
          answers={{ stage, bottleneck, team }}
          values={details}
          onValues={(patch) => setDetails((current) => ({ ...current, ...patch }))}
        />
      ),
    },
  ];

  return (
    <PageColumn className="max-w-[560px] pb-16">
      <SiteHeader />
      <div className="mt-6 sm:mt-10">
        <MultiStepForm steps={steps} />
      </div>
    </PageColumn>
  );
}

/** "You're in", then who's actually reading the answers, as a social profile. */
function Intro() {
  const { profile } = config;
  const stats: ProfileStat[] = [{ value: profile.subscribers, label: "subscribers" }];
  if (profile.linkedinFollowers) {
    stats.push({ value: profile.linkedinFollowers, label: "followers", icon: <LinkedInMark /> });
  }

  return (
    <div className="mb-8">
      <h1 className="text-[1.75rem] font-bold sm:text-3xl">You&apos;re in. Now let me actually help.</h1>
      <ProfileCard
        className="mt-5"
        name={profile.name}
        avatarSrc={config.danielPhoto}
        avatarFallback="DH"
        headline={profile.headline}
        verified="Verified on LinkedIn"
        stats={stats}
        bio={
          <p>
            Hey, I&apos;m Daniel. I read every one of these myself. Three quick taps so I can tailor
            what I send you, and if I spot something worth building in your business, I&apos;ll reach
            out.
          </p>
        }
      />
    </div>
  );
}

type FieldName = "email" | "name" | "website" | "phone";

interface DetailsValues {
  email: string;
  name: string;
  website: string;
  country: string;
  phone: string;
}

function DetailsStep({
  initial,
  answers,
  values,
  onValues,
}: {
  initial: FunnelState;
  answers: Answers;
  values: DetailsValues;
  onValues: (patch: Partial<DetailsValues>) => void;
}) {
  const needsEmail = !initial.token;
  const { email, name, website, country, phone } = values;
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({});
  const [submitting, setSubmitting] = React.useState<"phone" | "skip" | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const clearError = (field: FieldName) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  async function finish(withPhone: boolean) {
    if (submitting) return;

    const firstName = cleanName(name);
    const site = website.trim() ? normaliseWebsite(website) : null;
    const fullPhone = withPhone ? normalisePhone(phone, country === "other" ? null : country) : null;
    const typedEmail = email.trim();
    const mail = needsEmail ? cleanEmail(typedEmail) : (initial.email ?? null);

    const found: Partial<Record<FieldName, string>> = {};
    if (needsEmail && (withPhone || typedEmail) && !mail) {
      found.email = "That email doesn't look quite right.";
    }
    if (withPhone && !firstName) found.name = "What should I call you?";
    if (website.trim() && !site) found.website = "That doesn't look like a website. Try something like acme.com.au";
    if (withPhone && !fullPhone) {
      found.phone = phone.trim()
        ? "That number doesn't look right. Check the digits?"
        : "Pop your mobile in, or continue without it below.";
    }
    setErrors(found);
    const firstProblem = (["email", "name", "website", "phone"] as const).find((key) => found[key]);
    if (firstProblem) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${firstProblem}"]`)?.focus();
      return;
    }

    setSubmitting(withPhone ? "phone" : "skip");
    writeState({
      ...answers,
      name: firstName ?? undefined,
      website: site ?? undefined,
      phone: fullPhone ?? undefined,
    });

    try {
      let token = readState().token;
      if (!token && mail) {
        const { utm, referrer } = attribution();
        const created = await postJson<{ token: string | null }>("/api/subscribe", {
          email: mail,
          referrer,
          ...utm,
        });
        token = created.token ?? undefined;
        writeState({ token, email: mail, utm });
        trackPixel("Subscribe");
      }
      if (token) {
        await postJson(
          "/api/answers",
          {
            token,
            complete: true,
            answers: {
              ...answers,
              first_name: firstName ?? undefined,
              website: site ?? undefined,
              phone: fullPhone ?? undefined,
            },
          },
          { timeoutMs: 6000 },
        );
      }
    } catch {
      // Never trap someone on the survey. Their answers are kept in this tab
      // and the next page still works; at worst the CRM misses this update.
    }

    if (fullPhone) trackPixel("Lead");
    window.location.assign("/sprint");
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        finish(true);
      }}
    >
      <StepHeading>Last bit. Where should I send your ideas?</StepHeading>

      <div className="mt-6 space-y-5">
        {needsEmail ? (
          <Field id="email" label="Email" error={errors.email}>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                onValues({ email: event.target.value });
                clearError("email");
              }}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={fieldClass}
            />
          </Field>
        ) : null}

        <Field id="name" label="First name" error={errors.name}>
          <Input
            id="name"
            name="name"
            autoComplete="given-name"
            value={name}
            onChange={(event) => {
              onValues({ name: event.target.value });
              clearError("name");
            }}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "name-error" : undefined}
            className={fieldClass}
          />
        </Field>

        <Field
          id="website"
          label={
            <>
              Company website <span className="font-normal text-muted-foreground">(optional)</span>
            </>
          }
          error={errors.website}
        >
          <Input
            id="website"
            name="website"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="acme.com.au"
            value={website}
            onChange={(event) => {
              onValues({ website: event.target.value });
              clearError("website");
            }}
            aria-invalid={Boolean(errors.website)}
            aria-describedby={errors.website ? "website-error" : undefined}
            className={fieldClass}
          />
        </Field>

        <Field id="phone" label="Mobile" error={errors.phone}>
          <div className="flex gap-2">
            <select
              aria-label="Country code"
              value={country}
              onChange={(event) => onValues({ country: event.target.value })}
              className="h-12 shrink-0 rounded-md border border-input bg-card px-2 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {PHONE_COUNTRIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete={country === "other" ? "tel" : "tel-national"}
              placeholder={country === "+61" ? "0412 345 678" : country === "other" ? "+ country code and number" : ""}
              value={phone}
              onChange={(event) => {
                onValues({ phone: event.target.value });
                clearError("phone");
              }}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "phone-error phone-note" : "phone-note"}
              className={fieldClass}
            />
          </div>
          <p id="phone-note" className="mt-2 text-sm text-muted-foreground">
            I&apos;ll look at your site before we talk, and only text if I spot something worth a
            quick chat. No spam, reply STOP anytime.
          </p>
        </Field>
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={submitting !== null}
        className="mt-7 h-12 w-full gap-2 text-base font-semibold hover:bg-primary-hover"
      >
        {submitting === "phone" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> One sec…
          </>
        ) : (
          <>
            Show me what you&apos;d build <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
      <button
        type="button"
        onClick={() => finish(false)}
        disabled={submitting !== null}
        className="mx-auto mt-4 block cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:cursor-wait"
      >
        {submitting === "skip" ? "One sec…" : "Continue without my number"}
      </button>
    </form>
  );
}

const fieldClass = "h-12 bg-card text-base aria-[invalid=true]:border-destructive";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-2 block text-[0.9375rem]">
        {label}
      </Label>
      {children}
      <p
        id={`${id}-error`}
        role="alert"
        className={cn("mt-1.5 text-sm text-destructive", !error && "hidden")}
      >
        {error}
      </p>
    </div>
  );
}

mountPage(WelcomePage);
