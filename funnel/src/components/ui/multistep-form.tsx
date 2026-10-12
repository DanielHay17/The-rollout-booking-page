"use client";

import * as React from "react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
} from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/*
 * A one-question-at-a-time form: a plain progress bar on top, a back arrow,
 * and each step sliding in. It owns navigation only; each step renders its
 * own content and decides when to move on via the controls it's handed.
 */

export interface MultiStepFormControls {
  next: () => void;
  back: () => void;
  goTo: (index: number) => void;
  stepIndex: number;
  stepCount: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface MultiStepFormStep {
  id: string;
  render: (controls: MultiStepFormControls) => React.ReactNode;
}

export interface MultiStepFormProps {
  steps: MultiStepFormStep[];
  /**
   * 0 to 1. Defaults to (step + 1) / (steps + 1), so the bar already shows
   * some progress on the first question: they've done one thing already.
   */
  progress?: number;
  initialStep?: number;
  onStepChange?: (index: number, id: string) => void;
  className?: string;
}

const slide = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 40 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -40,
    transition: { duration: 0.15, ease: "easeIn" as const },
  }),
};

export function MultiStepForm({
  steps,
  progress,
  initialStep = 0,
  onStepChange,
  className,
}: MultiStepFormProps) {
  const [stepIndex, setStepIndex] = React.useState(initialStep);
  const [direction, setDirection] = React.useState(1);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const moved = React.useRef(false);

  const stepCount = steps.length;
  const step = steps[stepIndex];

  const goTo = React.useCallback(
    (index: number) => {
      if (index < 0 || index >= stepCount || index === stepIndex) return;
      moved.current = true;
      setDirection(index > stepIndex ? 1 : -1);
      setStepIndex(index);
      onStepChange?.(index, steps[index].id);
    },
    [onStepChange, stepCount, stepIndex, steps],
  );

  const controls: MultiStepFormControls = {
    next: () => goTo(stepIndex + 1),
    back: () => goTo(stepIndex - 1),
    goTo,
    stepIndex,
    stepCount,
    isFirst: stepIndex === 0,
    isLast: stepIndex === stepCount - 1,
  };

  // After a step change, move focus to the new question so keyboard and
  // screen-reader users land in the right place. Never on first load.
  const focusHeading = () => {
    if (!moved.current) return;
    const heading = bodyRef.current?.querySelector<HTMLElement>("[data-step-heading]");
    heading?.focus({ preventScroll: true });
  };

  const value = progress ?? (stepIndex + 1) / (stepCount + 1);
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div className={cn("w-full", className)}>
          <div className="flex h-10 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={controls.back}
              aria-label="Back to the previous question"
              className={cn("-ml-2 shrink-0", controls.isFirst && "invisible")}
              tabIndex={controls.isFirst ? -1 : 0}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div
              role="progressbar"
              aria-label="Progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <m.div
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>
            {/* Mirrors the back button so the bar stays centred. */}
            <span className="w-8 shrink-0" aria-hidden="true" />
          </div>

          <div ref={bodyRef} className="relative mt-6 overflow-x-clip sm:mt-8">
            <AnimatePresence
              mode="wait"
              initial={false}
              custom={direction}
              onExitComplete={focusHeading}
            >
              <m.div
                key={step.id}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {step.render(controls)}
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

/** The question line of a step. Focus lands here when the step changes. */
export function StepHeading({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-step-heading
      tabIndex={-1}
      className={cn("text-2xl font-semibold outline-none sm:text-[1.75rem]", className)}
      {...props}
    />
  );
}

export interface ChoiceOption<V extends string = string> {
  value: V;
  label: string;
}

export interface ChoiceQuestionProps<V extends string> {
  name: string;
  question: React.ReactNode;
  description?: React.ReactNode;
  options: readonly ChoiceOption<V>[];
  value?: V;
  onChange: (value: V) => void;
  /**
   * Called on a deliberate pick (a tap, a click, Space) but not while
   * arrowing through the options, so keyboard users aren't thrown forward.
   */
  onPick?: (value: V) => void;
  /**
   * A "Next" button for when tapping isn't how they'll move on: shown when
   * they come back to an answered question, or choose with the arrow keys.
   */
  continueLabel?: string;
  onContinue?: () => void;
}

export function ChoiceQuestion<V extends string>({
  name,
  question,
  description,
  options,
  value,
  onChange,
  onPick,
  continueLabel = "Next",
  onContinue,
}: ChoiceQuestionProps<V>) {
  const headingId = `${name}-question`;
  const [showContinue, setShowContinue] = React.useState(Boolean(value));
  const viaKeyboard = React.useRef(false);
  return (
    <div>
      <StepHeading id={headingId}>{question}</StepHeading>
      {description ? (
        <p className="mt-2 text-muted-foreground">{description}</p>
      ) : null}
      <RadioGroup
        aria-labelledby={headingId}
        value={value ?? ""}
        onKeyDown={() => {
          viaKeyboard.current = true;
        }}
        onPointerDown={() => {
          viaKeyboard.current = false;
        }}
        onValueChange={(next) => {
          onChange(next as V);
          if (viaKeyboard.current) setShowContinue(true);
        }}
        className="mt-5 gap-2.5"
      >
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const selected = value === option.value;
          return (
            <Label
              key={option.value}
              htmlFor={id}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border bg-card px-4 py-3 text-base font-normal leading-snug transition-colors",
                "hover:border-primary hover:bg-accent",
                selected && "border-primary bg-accent",
              )}
            >
              <RadioGroupItem
                id={id}
                value={option.value}
                onClick={() => onPick?.(option.value)}
                className="h-5 w-5 shrink-0"
              />
              <span>{option.label}</span>
            </Label>
          );
        })}
      </RadioGroup>
      {value && showContinue && onContinue ? (
        <Button type="button" variant="ghost" onClick={onContinue} className="mt-4 -ml-2 gap-1.5">
          {continueLabel} <ArrowRight className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
