import * as React from "react";
import { ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/*
 * A social-profile style card: cover, photo, name, follower counts, bio.
 * Adapted from 21st.dev's AnimatedProfileCard. Its circular reveal ran on
 * hover, which phones never fire, and needed GSAP and next-themes. Here the
 * same reveal plays once, when the card appears, as a plain CSS animation
 * (animate-cover-reveal in index.css).
 */

export interface ProfileStat {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ProfileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  avatarSrc: string;
  /** Shown if the photo hasn't loaded, usually initials. */
  avatarFallback: string;
  /** The line under the name: role, location. */
  headline?: string;
  /** e.g. "Verified on LinkedIn". Shows a shield beside the name. */
  verified?: string;
  stats?: ProfileStat[];
  bio: React.ReactNode;
}

// Photo centre, from the card's top-left: 16px padding + half of 80px across,
// and the photo hangs half over the 64px cover. The reveal in index.css
// starts from the same point.
const RING_X = 56;
const RING_Y = 64;

export const ProfileCard = React.forwardRef<HTMLDivElement, ProfileCardProps>(
  ({ className, name, avatarSrc, avatarFallback, headline, verified, stats = [], bio, ...props }, ref) => {
    return (
      <Card ref={ref} className={cn("overflow-hidden rounded-md shadow-none", className)} {...props}>
        <div aria-hidden="true" className="relative h-16 animate-cover-reveal bg-primary motion-reduce:animate-none">
          {/* The Rollout's radar mark, rippling out from the photo. */}
          <svg className="absolute inset-0 h-full w-full" fill="none" stroke="white" strokeOpacity="0.35">
            {[52, 76, 100, 124, 148, 172].map((r) => (
              <circle key={r} cx={RING_X} cy={RING_Y} r={r} strokeWidth="1.5" />
            ))}
          </svg>
        </div>

        <CardContent className="px-4 pt-0 pb-4 sm:px-5">
          <div className="-mt-10 flex items-end justify-between gap-3">
            <Avatar className="h-20 w-20 ring-4 ring-card">
              <AvatarImage src={avatarSrc} alt={name} className="object-cover" />
              <AvatarFallback delayMs={600} className="font-serif text-xl font-bold">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            {stats.length ? (
              <dl className="flex gap-5 pb-0.5">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex flex-col-reverse text-right">
                    <dt className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      {stat.icon}
                      {stat.label}
                    </dt>
                    <dd className="text-[0.9375rem] font-semibold">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          <p className="mt-3 flex items-center gap-1.5 font-serif text-xl leading-tight font-bold">
            {name}
            {verified ? (
              <ShieldCheck className="h-[1.125rem] w-[1.125rem] text-subtle-foreground" aria-label={verified}>
                <title>{verified}</title>
              </ShieldCheck>
            ) : null}
          </p>
          {headline ? <p className="mt-0.5 text-sm text-muted-foreground">{headline}</p> : null}
          <div className="mt-3 text-[0.9375rem] leading-relaxed">{bio}</div>
        </CardContent>
      </Card>
    );
  },
);
ProfileCard.displayName = "ProfileCard";
