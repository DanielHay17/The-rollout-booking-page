---
name: meta-ads-build
description: Build or reorganise The Rollout's Meta ads (campaign, ad set, ads, uploaded media) through the Meta ads MCP using the house naming and structure. Use whenever creating, renaming, restructuring or uploading media to the Rollout ad account.
---

# Building Rollout Meta ads

Live IDs (ad account, page, pixel, interests, current campaigns) are in Claude's project memory, not here. This repo is public.

## Structure: one test = one campaign

```
Campaign   <Theme 3 words> | <D Mon>          e.g. Xero Real Footage | 1 Oct
  Ad set   <Audience 3 words> | <D Mon>       e.g. AU Business Owners | 1 Oct   (one budget, shared)
    Ad     <Creative 3 words> | <D Mon>       e.g. Best Ad Script | 1 Oct
    Ad     <Creative 3 words> | <D Mon>       e.g. One Prompt Hook | 1 Oct
    Ad     <Creative 3 words> | <D Mon>       e.g. Let AI In | 1 Oct
```

- Put all the videos for one test in **one campaign and one ad set**, as separate ads. Don't make one campaign per video. Meta splits the single budget toward the winner.
- The budget sits on the ad set and covers the whole test. For example, AU$15/day across 3 videos, not AU$5 each.
- Names are about three plain words saying what the thing is, then ` | ` and the date it was made, written as `1 Oct`. No codes like R2B, no budgets, no version tags.

## Name every upload

The MCP-created ads sometimes need fixing by hand in Ads Manager. When that happens, Daniel has to find the media in the account library. So:

- Pass `name` on every `ads_creative_upload_media` call (video and image), using the same name as the ad: `Best Ad Script | 1 Oct`.
- Name the cover image `<ad name minus date> cover | <date>`: `Best Ad Script cover | 1 Oct`.
- Name the creative the same as the ad.

## Build order (Meta ads MCP)

1. Host the files publicly (mp4 + 1080x1920 cover PNG), then `ads_creative_upload_media` with `upload_source: "URL"`, `media_type: "VIDEO"` / `"IMAGE"` (uppercase) and `name`.
2. `ads_create_campaign`: `campaign_name`, `objective: OUTCOME_LEADS`, `buying_type: AUCTION`, `special_ad_categories: []`.
3. `ads_create_ad_set`: `ad_set_name`, `daily_budget` in cents, `optimization_goal: OFFSITE_CONVERSIONS`, `billing_event: IMPRESSIONS`, pixel SUBSCRIBE `promoted_object`, `destination_type: WEBSITE`. Copy targeting from the current best ad set: read it first with `ads_get_ad_entities` (level adset, filter `campaign.id`).
4. `ads_create_creative` (flat args): `page_id`, `video_id`, `image_hash` (cover), `headline`, `message`, `link_url: https://the-rollout.co`, `call_to_action_type: SUBSCRIBE`.
5. `ads_create_ad`: `ad_set_id`, `ad_name`, `creative: {"creative_id": ...}`, `conversion_domain: the-rollout.co`.
6. Changes land as **drafts**. Nothing spends until Daniel reviews and publishes in Ads Manager. Never publish or activate yourself.
7. `ads_update_entity` takes `fields: {"status": "PAUSED"}`, not a bare `status`.

## Before handing over

- List what is live and the total daily spend after this test is published. Name what should be paused to stay on budget. Cash constrains spend.
- Retired tests: pause them. Daniel deletes them himself in Ads Manager.
- Ad copy follows the script rules in docs/rollout-ads-playbook.md: ICP callout and hook, open loop, then an explicit subscribe ask.
- Record the new IDs in project memory, never in this repo.
