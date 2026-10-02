export const JEV_MODEL = "typesafe/jev";

export interface JevAi {
  run(
    model: string,
    input: JevChoiceInput,
    options?: { signal?: AbortSignal }
  ): Promise<unknown>;
}

/** What the binding accepts for a single choice question. */
export interface JevChoiceInput {
  state: string;
  questions: Record<
    string,
    {
      type: "choice";
      instructions: string;
      criteria: Record<string, string>;
    }
  >;
}

export type JevFallbackReason =
  | "no_binding"
  | "timeout"
  | "deadline"
  | "error"
  | "unrecognized_response"
  | "unknown_choice"
  | "low_confidence";

export function jevAi(ai: Ai | undefined): JevAi | undefined {
  if (!ai) return undefined;
  const runner = ai as unknown as JevAi;
  return {
    run: (model, input, options) => runner.run(model, input, options),
  };
}

/** One JSON line per fallback. Never log the prompt state or merchant text. */
export function logJevFallback(
  context: string,
  reason: JevFallbackReason,
  meta?: Record<string, unknown>
): void {
  console.warn(JSON.stringify({ context, reason, ...meta, ts: Date.now() }));
}

/**
 * One choice from Jev. Null when the binding is missing, the call fails, or
 * the answer is not a confident criteria key. An already-aborted `signal`
 * skips the model.
 */
export async function askJevChoice(
  ai: JevAi,
  options: {
    context: string;
    question: string;
    state: string;
    instructions: string;
    criteria: Record<string, string>;
    minConfidence: number;
    timeoutMs: number;
    signal?: AbortSignal;
    redact: readonly string[];
    logChoice?: boolean;
  }
): Promise<{ choice: string; confidence: number } | null> {
  if (options.signal?.aborted) {
    logJevFallback(options.context, "deadline");
    return null;
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let deadline = false;
  let rejectDeadline: ((error: Error) => void) | undefined;
  const onDeadline = () => {
    deadline = true;
    controller.abort();
    rejectDeadline?.(new Error("aborted"));
  };

  let deadlinePromise: Promise<never> | undefined;
  if (options.signal) {
    deadlinePromise = new Promise<never>((_, reject) => {
      rejectDeadline = reject;
    });
    // The race handles the rejection it observes. This covers the one it doesn't.
    void deadlinePromise.catch(() => undefined);
    options.signal.addEventListener("abort", onDeadline, { once: true });
  }

  try {
    const inference = ai.run(
      JEV_MODEL,
      {
        state: options.state,
        questions: {
          [options.question]: {
            type: "choice",
            instructions: options.instructions,
            criteria: options.criteria,
          },
        },
      },
      { signal: controller.signal }
    );
    void Promise.resolve(inference).catch(() => undefined);

    const response = await Promise.race([
      inference,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("jev choice timed out"));
        }, options.timeoutMs);
      }),
      ...(deadlinePromise ? [deadlinePromise] : []),
    ]);
    return choiceFromResponse(response, options);
  } catch (error) {
    controller.abort();
    if (deadline || options.signal?.aborted) {
      logJevFallback(options.context, "deadline");
    } else if (timedOut) {
      logJevFallback(options.context, "timeout");
    } else {
      logJevFallback(options.context, "error", {
        error: redactErrorText(error, options.redact),
      });
    }
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onDeadline);
  }
}

function choiceFromResponse(
  response: unknown,
  options: {
    context: string;
    question: string;
    criteria: Record<string, string>;
    minConfidence: number;
    logChoice?: boolean;
  }
): { choice: string; confidence: number } | null {
  // The AI binding wraps third-party output as { state, result: { answers } }.
  const body = field(response, "result") ?? response;
  const answer = field(field(body, "answers"), options.question);
  if (!answer || typeof answer !== "object") {
    logJevFallback(options.context, "unrecognized_response", {
      shape: responseShape(response, options.question),
    });
    return null;
  }
  const choice = field(answer, "choice");
  const confidence = field(answer, "confidence");
  if (typeof choice !== "string" || !Object.hasOwn(options.criteria, choice)) {
    logJevFallback(options.context, "unknown_choice");
    return null;
  }
  if (typeof confidence !== "number" || confidence < options.minConfidence) {
    logJevFallback(
      options.context,
      "low_confidence",
      options.logChoice ? { choice, confidence } : { confidence }
    );
    return null;
  }
  return { choice, confidence };
}

function responseShape(response: unknown, question: string): string {
  if (response === null) return "null";
  if (Array.isArray(response)) return "array";
  if (typeof response !== "object") return typeof response;
  const body = field(response, "result") ?? response;
  if (!body || typeof body !== "object" || Array.isArray(body)) return "no_body";
  const answers = field(body, "answers");
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return "no_answers";
  }
  return `no_${question}`;
}

/** Generalises grocery `safeErrorText` across every needle the prompt contained. */
function redactErrorText(error: unknown, redact: readonly string[]): string {
  const message = error instanceof Error ? error.message : "rejected";
  const needles = redact.map((needle) => needle.trim()).filter((needle) => needle.length > 0);
  if (needles.some((needle) => needle.length < 3)) return "rejected";
  let redacted = message;
  for (const needle of needles) {
    redacted = redacted.split(needle).join("[redacted]");
  }
  return redacted.slice(0, 200);
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
