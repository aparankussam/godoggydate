# GoDoggyDate Analytics Events

Use this as the initial GA4 / dashboard reference for the web funnel.

## Required environment

Set these on the deployed web app:

```bash
NEXT_PUBLIC_SITE_URL=https://godoggydate.com
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
GOOGLE_SITE_VERIFICATION=your-google-token
```

## Core funnel events

| Event | Meaning |
|------|---------|
| `page_view` | Any tracked route view |
| `landing_view` | Homepage viewed |
| `cta_click` | Main landing CTA clicked |
| `auth_open` | Sign-in modal opened |
| `sign_in_attempt` | Google sign-in started |
| `sign_in_success` | Google sign-in completed |
| `sign_in_failure` | Google sign-in failed |
| `profile_saved` | Dog profile saved |
| `profile_completed` | Dog profile became swipe-ready |
| `first_swipe` | First swipe in session |
| `swipe_action` | Like or pass action |
| `match_created` | Mutual match created |
| `chat_view` | Unlocked chat viewed |
| `chat_unlock_prompt_view` | Locked chat / mobile unlock prompt viewed |
| `message_sent` | Chat message sent |
| `chat_unlock_payment_submitted` | Web $4.99 unlock payment submitted (pre-webhook) |
| `playdate_proposed` | Playdate proposal sent in chat — **north-star input** |
| `playdate_confirmed` | Playdate proposal accepted — **north-star metric** |
| `invite_friend_clicked` | Invite flow triggered |
| `report_submitted` | Spam / inappropriate / block action submitted |
| `account_delete_requested` | Account deletion confirmed by user |
| `signed_out` | User signed out |

## Recommended first dashboard

Create a funnel with:

1. `landing_view`
2. `cta_click`
3. `auth_open`
4. `sign_in_success`
5. `profile_completed`
6. `first_swipe`
7. `match_created`
8. `chat_unlock_payment_submitted`
9. `playdate_proposed`
10. `playdate_confirmed` ← the north-star: weekly playdates confirmed

Create a second drop-off report for:

1. `chat_unlock_prompt_view`
2. `invite_friend_clicked`

That tells you whether the real problem is:

- weak top-of-funnel traffic
- auth friction
- profile completion friction
- low local supply
- chat unlock demand without enough mobile conversion

## Recommended custom dimensions

Register these event parameters in GA4 if you want cleaner reporting:

- `source`
- `signed_in`
- `context`
- `action`
- `compatibility_score`
- `is_demo`
- `reason`
- `has_existing_messages`

## Quick validation after deploy

1. Open the homepage in an incognito window.
2. Click the primary CTA.
3. Open the auth modal.
4. Complete sign-in.
5. Save or complete a profile.
6. Swipe once.

You should then see these events in GA4 Realtime:

- `page_view`
- `landing_view`
- `cta_click`
- `auth_open`
- `sign_in_success`
- `profile_saved` or `profile_completed`
- `first_swipe`
