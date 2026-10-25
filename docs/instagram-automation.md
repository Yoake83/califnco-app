# Daily AI Instagram demo

Implementation: `.github/workflows/instagram-daily.yml` and `automation/instagram/`.

The workflow rotates one product category per day from a small, reviewed JSON catalog; it does not advertise unverified prices or inventory. Qwen2.5-1.5B-Instruct generates the caption and hashtags. SD-Turbo generates a fresh product illustration, with a visible assignment-demo label. Models run locally on the standard GitHub CPU runner: no paid inference service or AI API key is used. A separate public `automation-assets` branch hosts JPEGs and a durable daily journal. GitHub Actions runs at approximately 09:17 IST; queued schedules can be delayed, and inactive public repositories can have schedules disabled by GitHub. CPU/model download time is a practical limitation.

## Status

Code is implemented; provider-backed AI generation, public asset fetching by Meta and actual Instagram publishing still need verification. No live post or unattended schedule has been enabled. The intended demo username is `yohoho080jd`. Physical screen recording is still a submission deliverable.

## Account setup

1. Create a clearly labelled assignment demo Instagram account and switch it to Creator or Business. Do not imply it is Califnco's official account.
2. Sign in to Meta for Developers, create an app with the Instagram API use case, and choose **Instagram Login**. A Facebook account is used for the developer dashboard; the Instagram Login API does not require a linked Facebook Page.
3. Add the demo professional account as an Instagram tester/account in the app and accept any tester invite on that Instagram account. Use the dashboard's token setup to authorize `instagram_business_basic` and `instagram_business_content_publish`. The app's own roles/test account may be used in development; publishing on behalf of unrelated accounts can require app review.
4. In GitHub repository Settings → Secrets and variables → Actions, save the token as repository secret `INSTAGRAM_ACCESS_TOKEN`. Save the numeric professional account ID as variable `INSTAGRAM_USER_ID`, and the supported Graph API version as `INSTAGRAM_GRAPH_VERSION` (default `v24.0`). Never commit or paste the token into chat. Track its expiry and use Meta's supported refresh/renewal process; an expired token must stop the workflow.
5. Run **Daily Instagram AI post**, mode **generate**. Inspect the AI image and caption linked in the job summary and `automation-assets/automation-output/YYYY-MM-DD/post.json`.
6. After the owner approves the exact post and target account, run the workflow in **publish** mode. It uses the already prepared content, not a new unreviewed generation. Verify the actual post permalink on Instagram.
7. Only after the owner authorizes ongoing daily publication, set repository variables `INSTAGRAM_AUTOMATION_ENABLED=true` and `INSTAGRAM_AUTO_PUBLISH_ENABLED=true`. With only the first variable enabled, the daily workflow generates previews but does not publish. Both default to disabled.

## Reliability and limits

- One workflow concurrency group serializes daily and manual runs. A durable IST-date journal reuses the same prepared content on retries.
- The token's username must match the intended demo account before any publishing request. Token and account credentials are environment-only and never written to the journal or logs.
- The public JPEG URL is checked before creating an Instagram media container. Container processing is polled and the container ID persisted.
- A `publish_requested` checkpoint is saved before the irreversible request. An uncertain result is reconciled against recent Instagram media by the exact caption. It is never blindly published a second time; unresolved ambiguity needs operator inspection.
- Publishing is restricted to today's IST preview. An expired/failed container needs operator review; the workflow fails visibly instead of presenting a fabricated success.
- AI image identity/visual quality and caption correctness require review for the demo. The illustrations are not exact-model product photography. Open-model licenses apply; SD-Turbo commercial deployment has additional licensing considerations. The public demo implementation is not a substitute for a production marketing approval process.
- The caption model is small and may fail the content checks. There is no canned-caption or stock-image fallback presented as AI generation.
- Scheduled-run success is not proven by a manual preview. Record the difference honestly in the submission.

## Recording checklist

Show the workflow's daily schedule, product rotation, successful generation logs, generated JPEG, caption/hashtags, successful publish request and the resulting Instagram post. Hide all tokens, passwords and developer secrets. Upload the actual screen recording to the submission host and verify its viewing permissions.

## Validation

`python -m unittest discover -s automation/instagram -p 'test_*.py' -v` exercises rotation, caption checks, durable publish checkpoints, retry behavior, wrong-account records and journal failures. These mocked tests do not prove live provider authorization or image quality.

References: [Meta's Instagram Login collection](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login), [SD-Turbo model card](https://huggingface.co/stabilityai/sd-turbo), [Qwen model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
