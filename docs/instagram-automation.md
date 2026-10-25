# Daily AI Instagram demo

Implementation: `.github/workflows/instagram-daily.yml` and `automation/instagram/`.

The workflow rotates one product category per day from a small, reviewed JSON catalog; it does not advertise unverified prices or inventory. Qwen2.5-1.5B-Instruct generates the caption and hashtags. SD-Turbo generates a fresh product illustration, with a visible assignment-demo label. Models run locally on the standard GitHub CPU runner: no paid inference service or AI API key is used. A separate public `automation-assets` branch hosts JPEGs and a durable daily journal. GitHub Actions runs at approximately 09:17 IST; queued schedules can be delayed, and inactive public repositories can have schedules disabled by GitHub. CPU/model download time is a practical limitation.

## Status

Verified on 25 October 2026: a real GitHub Actions CPU run generated the product illustration and hosted a public JPEG; a subsequent successful run generated a revised prose caption plus hashtags. The image was visually inspected. Meta app `Califnco Assignment Demo` (ID `1842363726782846`) is created; basic/profile and content-publishing permissions were added with owner approval, and the owner accepted the tester invite for `yohoho080jd`. The owner stored the token directly in GitHub's encrypted secret. A read-only API check verified the expected username and numeric ID.

With explicit owner approval for **this post only**, [publishing run #5](https://github.com/Yoake83/califnco-app/actions/runs/40175530041) succeeded and the [actual Instagram post](https://www.instagram.com/p/De6PuOmlDqp/) was visually verified with its image, caption, hashtags and demo disclaimer. Meta fetched the public JPEG successfully. The owner chose not to enable daily posts: both schedule switches remain unset/disabled. Scheduling code exists but unattended scheduled publication has not been demonstrated. Screen recording is still a submission deliverable.

Ten tests pass, including exact token-account identity, journal failures and uncertain-publication retries. Early workflow summaries accidentally included mocked publication output from tests; test output and summary writes were isolated before the real publishing run. Only run #5 and the actual Instagram permalink are publication evidence.

## Account setup

1. Create a clearly labelled assignment demo Instagram account and switch it to Creator or Business. Do not imply it is Califnco's official account.
2. Sign in to Meta for Developers, create an app with the Instagram API use case, and choose **Instagram Login**. A Facebook account is used for the developer dashboard; the Instagram Login API does not require a linked Facebook Page.
3. Add the demo professional account as an Instagram tester/account in the app and accept any tester invite on that Instagram account. Use the dashboard's token setup to authorize `instagram_business_basic` and `instagram_business_content_publish`. The app's own roles/test account may be used in development; publishing on behalf of unrelated accounts can require app review.
4. In GitHub repository Settings → Secrets and variables → Actions, save the token as repository secret `INSTAGRAM_ACCESS_TOKEN`. Save the numeric professional account ID as variable `INSTAGRAM_USER_ID`, and the supported Graph API version as `INSTAGRAM_GRAPH_VERSION` (default `v24.0`). Never commit or paste the token into chat. Track its expiry and use Meta's supported refresh/renewal process; an expired token must stop the workflow.
5. Run **Daily Instagram AI post**, mode **generate**. Inspect the AI image and caption linked in the job summary and `automation-assets/automation-output/YYYY-MM-DD/post.json`.
6. Run **check** mode to verify the token's username and numeric account ID without publishing. After the owner approves the exact post and target account, run the workflow in **publish** mode. It uses the already prepared content, not a new unreviewed generation. Verify the actual post permalink on Instagram.
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

Use generation run [#3](https://github.com/Yoake83/califnco-app/actions/runs/40174621541) for the final AI caption and publishing run [#5](https://github.com/Yoake83/califnco-app/actions/runs/40175530041) for the successful real publication. Show the schedule as configured but currently disabled by owner choice; do not describe it as a completed unattended daily run. Replaying today's publish mode reuses the journal and does not intentionally create a second post.

## Validation

`python -m unittest discover -s automation/instagram -p 'test_*.py' -v` exercises rotation, caption checks, durable publish checkpoints, retry behavior, wrong-account records and journal failures. These mocked tests do not prove live provider authorization or image quality.

References: [Meta's Instagram Login collection](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login), [SD-Turbo model card](https://huggingface.co/stabilityai/sd-turbo), [Qwen model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
