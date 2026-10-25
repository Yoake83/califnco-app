"""Daily AI product posts. Secrets are environment-only; publication is opt-in.

Generation uses local open models, not a paid inference endpoint. Public preview
assets and a durable publication journal live on a separate repository branch.
"""
from __future__ import annotations

import argparse
import base64
import gc
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
IST = timezone(timedelta(hours=5, minutes=30))
IMAGE_MODEL = "stabilityai/sd-turbo"
IMAGE_REVISION = "b261bac6fd2cf515557d5d0707481eafa0485ec2"
CAPTION_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
CONTENT_VERSION = 3
BRANCH = "automation-assets"
EXPECTED_USERNAME = "yohoho080jd"


class AutomationError(RuntimeError):
    pass


def request_json(url, *, method="GET", token=None, body=None, form=False):
    headers = {"Accept": "application/json", "User-Agent": "Califnco-Demo-Automation/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = None
    if body is not None:
        payload = urlencode(body).encode() if form else json.dumps(body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
    try:
        with urlopen(Request(url, data=payload, headers=headers, method=method), timeout=45) as response:
            return json.load(response)
    except HTTPError as error:
        # Never print provider bodies: they may echo a credential or request URL.
        raise AutomationError(f"Provider request failed (HTTP {error.code}); check token, permissions and provider dashboard.") from None
    except (URLError, TimeoutError, ValueError):
        raise AutomationError("Provider request had an uncertain response. Inspect the journal before retrying publication.") from None


def run_day(value=None):
    return date.fromisoformat(value) if value else datetime.now(IST).date()


def choose_product(day, products):
    if not products:
        raise AutomationError("The automation product list is empty.")
    return products[(day - date(2026, 10, 25)).days % len(products)]


def finalize_caption(generated, day):
    text = generated.strip()
    text = re.sub(r"\A(?:Here's|Here is)[^\n]*:\s*", "", text, flags=re.I).strip().strip('"').strip()
    tags = list(dict.fromkeys(re.findall(r"#[A-Za-z][A-Za-z0-9_]{1,35}", text)))
    body = re.sub(r"#[A-Za-z][A-Za-z0-9_]*", "", text).strip().strip('"').strip()
    if len(tags) < 3 or len(body.split()) < 15 or len(text) > 1400:
        raise AutomationError("AI caption did not meet the caption/hashtag checks. Nothing was published.")
    # Demo content must not imply a real offer or proven health/performance claim.
    forbidden = r"https?://|@[A-Za-z0-9_]|\b(cures?|guaranteed|100%|99\.9|certified|buy now|discount|sale|disease|bacteria|viruses|our team|we offer|our experts|order now)\b"
    if re.search(forbidden, text, re.I):
        raise AutomationError("AI caption contained an unsupported claim or promotion. Nothing was published.")
    return f"{body}\n\n{' '.join(tags[:4])}\n\nAssignment demo • AI-generated illustration, not an exact product photograph.\nNot an official Califnco account or a sales offer.\nDemo series {day.isoformat()}. #CalifncoDemo"


class GitHubStore:
    def __init__(self):
        self.repo = os.environ.get("GITHUB_REPOSITORY", "Yoake83/califnco-app")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", self.repo):
            raise AutomationError("Invalid repository name.")
        self.token = os.environ.get("GITHUB_TOKEN", "")
        if not self.token:
            raise AutomationError("GITHUB_TOKEN is required. Use GitHub Actions; do not paste tokens in chat.")
        self.api = f"https://api.github.com/repos/{self.repo}"

    def content(self, path):
        # A missing file is normal on the first run; other API errors fail closed.
        url = f"{self.api}/contents/{path}?ref={BRANCH}"
        try:
            with urlopen(Request(url, headers={"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json", "User-Agent": "Califnco-Demo"}), timeout=45) as response:
                data = json.load(response)
        except HTTPError as error:
            if error.code == 404:
                return None
            raise AutomationError(f"Journal read failed (HTTP {error.code}).") from None
        except (URLError, TimeoutError):
            raise AutomationError("Journal could not be read; refusing to assume no post exists.") from None
        return data

    def ensure_branch(self):
        url = f"{self.api}/git/ref/heads/{BRANCH}"
        try:
            with urlopen(Request(url, headers={"Authorization": f"Bearer {self.token}", "User-Agent": "Califnco-Demo"}), timeout=45):
                return
        except HTTPError as error:
            if error.code != 404:
                raise AutomationError(f"Asset branch lookup failed (HTTP {error.code}).") from None
        sha = os.environ.get("GITHUB_SHA", "")
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise AutomationError("GITHUB_SHA is missing.")
        request_json(f"{self.api}/git/refs", method="POST", token=self.token, body={"ref": f"refs/heads/{BRANCH}", "sha": sha})

    def read(self, path):
        item = self.content(path)
        return json.loads(base64.b64decode(item["content"])) if item else None

    def write(self, path, data):
        existing = self.content(path)
        body = {"message": f"Update automation asset {path}", "branch": BRANCH, "content": base64.b64encode(data).decode()}
        if existing:
            body["sha"] = existing["sha"]
        request_json(f"{self.api}/contents/{path}", method="PUT", token=self.token, body=body)

    def save(self, path, record):
        self.write(path, json.dumps(record, indent=2).encode())

    def public_url(self, path):
        return f"https://raw.githubusercontent.com/{self.repo}/{BRANCH}/{path}"


def generate_caption(product, day):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    print("Generating caption and hashtags with Qwen on CPU…", flush=True)
    torch.set_num_threads(min(4, os.cpu_count() or 2))
    tokenizer = AutoTokenizer.from_pretrained(CAPTION_MODEL, trust_remote_code=False)
    model = AutoModelForCausalLM.from_pretrained(CAPTION_MODEL, torch_dtype=torch.float32, use_safetensors=True, trust_remote_code=False)
    def complete(prompt, tokens=120):
        messages = [{"role": "system", "content": "You are an educational writer. Explain objects factually, without selling anything."}, {"role": "user", "content": prompt}]
        inputs = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, return_tensors="pt", return_dict=True)
        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=tokens, do_sample=False, pad_token_id=tokenizer.eos_token_id)
        return tokenizer.decode(output[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
    # Separate requests prevent a small model from replacing the body with tags.
    body = complete(f"Write two short plain-English sentences about a {product['name']}. Facts: {product['facts']} Return only the two sentences. Do not add hashtags, an introduction, claims or a service offer.")
    hashtags = complete(f"List four Instagram hashtags about this product category: {product['name']}. Return hashtags only. Avoid health, safety, DIY and performance claims.", 60)
    generated = f"{body}\n{hashtags}"
    caption = finalize_caption(generated, day)
    revision = getattr(model.config, "_commit_hash", None)
    del model, tokenizer
    gc.collect()
    return caption, revision


def generate_image(product, day, output):
    import torch
    from diffusers import AutoPipelineForText2Image
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    print("Generating a new product illustration with SD-Turbo on CPU…", flush=True)
    torch.set_num_threads(min(4, os.cpu_count() or 2))
    pipe = AutoPipelineForText2Image.from_pretrained(IMAGE_MODEL, revision=IMAGE_REVISION, torch_dtype=torch.float32, use_safetensors=True)
    pipe.enable_attention_slicing()
    prompt = f"Professional studio product photograph, {product['visual']}, realistic materials, soft daylight, pale teal and white color palette, clean uncluttered composition, no people, no lettering, no watermark"
    seed = int(hashlib.sha256(f"{day}:{product['id']}".encode()).hexdigest()[:8], 16)
    with torch.inference_mode():
        result = pipe(prompt, num_inference_steps=4, guidance_scale=0.0, height=512, width=512, generator=torch.Generator(device="cpu").manual_seed(seed))
    if getattr(result, "nsfw_content_detected", None) and any(result.nsfw_content_detected):
        raise AutomationError("Image did not pass the model's content check.")
    canvas = Image.new("RGB", (1080, 1080), "#f0f7f5")
    canvas.paste(ImageOps.fit(result.images[0].convert("RGB"), (960, 850), method=Image.Resampling.LANCZOS), (60, 110))
    draw = ImageDraw.Draw(canvas)
    font_file = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    font = ImageFont.truetype(str(font_file), 32) if font_file.exists() else ImageFont.load_default()
    small = ImageFont.truetype(str(font_file), 20) if font_file.exists() else ImageFont.load_default()
    draw.text((60, 35), "CALIFNCO / ASSIGNMENT DEMO", fill="#176f64", font=font)
    draw.text((60, 975), product["name"], fill="#143d38", font=font)
    draw.text((60, 1030), "AI-generated illustration / Not an official brand account", fill="#43665f", font=small)
    canvas.save(output, format="JPEG", quality=90, optimize=True)
    del pipe, result, canvas
    gc.collect()
    return {"model": IMAGE_MODEL, "revision": IMAGE_REVISION, "seed": seed, "steps": 4, "prompt": prompt}


def generate(store, day):
    path = f"automation-output/{day}/post.json"
    record = store.read(path)
    if record:
        if record["status"] == "prepared" and record.get("content_version", 1) < CONTENT_VERSION:
            caption, revision = generate_caption(record["product"], day)
            record.update(caption=caption, caption_model=CAPTION_MODEL, caption_model_revision=revision, content_version=CONTENT_VERSION)
            store.save(path, record)
            print(f"Updated unsubmitted preview caption:\n{caption}")
            return record
        print(f"Existing {day} record: {record['status']}; reusing it without regeneration.")
        return record
    products = json.loads((ROOT / "products.json").read_text())
    product = choose_product(day, products)
    caption, caption_revision = generate_caption(product, day)
    output = Path(os.environ.get("RUNNER_TEMP", "tmp")) / f"califnco-{day}.jpg"
    output.parent.mkdir(parents=True, exist_ok=True)
    image_details = generate_image(product, day, output)
    image_path = f"automation-output/{day}/image.jpg"
    store.write(image_path, output.read_bytes())
    record = {"date": str(day), "status": "prepared", "content_version": CONTENT_VERSION, "product": product, "caption": caption,
              "image_url": store.public_url(image_path), "image": image_details,
              "caption_model": CAPTION_MODEL, "caption_model_revision": caption_revision,
              "expected_username": EXPECTED_USERNAME, "created_at": datetime.now(timezone.utc).isoformat()}
    store.save(path, record)
    print(f"AI post prepared for {day}: {product['name']}")
    print(f"Image preview: {record['image_url']}\nCaption:\n{caption}", flush=True)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(f"## AI post prepared — {day}\n\n![AI illustration]({record['image_url']})\n\n{caption}\n\nPublication is a separate, opt-in step.\n")
    return record


class Instagram:
    def __init__(self):
        self.token = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
        self.user_id = os.environ.get("INSTAGRAM_USER_ID", "")
        version = os.environ.get("INSTAGRAM_GRAPH_VERSION", "v24.0")
        if not self.token or not self.user_id.isdigit() or not re.fullmatch(r"v\d+\.0", version):
            raise AutomationError("Configure INSTAGRAM_ACCESS_TOKEN, numeric INSTAGRAM_USER_ID, and a valid API version in GitHub settings.")
        self.base = f"https://graph.instagram.com/{version}"

    def call(self, path, *, method="GET", body=None, fields=None):
        url = f"{self.base}/{path}"
        if fields:
            url += "?" + urlencode(fields)
        return request_json(url, method=method, token=self.token, body=body, form=method == "POST")

    def verify_account(self):
        profile = self.call("me", fields={"fields": "user_id,username"})
        if profile.get("username", "").lower() != EXPECTED_USERNAME or str(profile.get("user_id")) != self.user_id:
            raise AutomationError("Instagram token belongs to a different account; refusing to publish.")

    def container_status(self, container):
        return self.call(container, fields={"fields": "status_code"}).get("status_code")

    def find_published(self, caption):
        media = self.call(f"{self.user_id}/media", fields={"fields": "id,caption,permalink", "limit": "25"})
        return next((item for item in media.get("data", []) if item.get("caption") == caption), None)


def reconcile(store, path, record, instagram):
    found = instagram.find_published(record["caption"])
    if found:
        record.update(status="published", media_id=found["id"], permalink=found.get("permalink"))
        store.save(path, record)
        return record
    raise AutomationError("A prior publish request has an uncertain result. No second publish was sent. Inspect Instagram and this container in Meta before intervention.")


def publish(store, day, instagram=None):
    path = f"automation-output/{day}/post.json"
    record = store.read(path)
    if not record:
        raise AutomationError("Generate today's preview before publishing.")
    if record["status"] == "published":
        print(f"Already published: {record.get('permalink', record.get('media_id'))}")
        return record
    if record.get("content_version", 0) < CONTENT_VERSION:
        raise AutomationError("Regenerate this unsubmitted preview using the current caption checks before publishing.")
    if record.get("expected_username") != EXPECTED_USERNAME:
        raise AutomationError("Preview account does not match the configured demo account.")
    instagram = instagram or Instagram()
    instagram.verify_account()
    if record.get("instagram_user_id") not in (None, instagram.user_id):
        raise AutomationError("Journal belongs to another Instagram account.")
    record["instagram_user_id"] = instagram.user_id
    if record["status"] == "publish_requested":
        return reconcile(store, path, record, instagram)
    if not record.get("container_id"):
        # Public JPEG must be reachable before Meta tries to fetch it.
        try:
            with urlopen(record["image_url"], timeout=30) as response:
                if response.headers.get_content_type() not in ("image/jpeg", "image/jpg"):
                    raise AutomationError("Public asset is not served as JPEG.")
        except (URLError, TimeoutError):
            raise AutomationError("Public image is not reachable yet. Retry this prepared post later.") from None
        container = instagram.call(f"{instagram.user_id}/media", method="POST", body={"image_url": record["image_url"], "caption": record["caption"]})
        if not str(container.get("id", "")).isdigit():
            raise AutomationError("Meta did not return a valid container ID.")
        record.update(status="container_created", container_id=container["id"])
        store.save(path, record)
    for _ in range(24):
        status = instagram.container_status(record["container_id"])
        if status == "FINISHED":
            break
        if status == "PUBLISHED":
            return reconcile(store, path, record, instagram)
        if status in ("ERROR", "EXPIRED"):
            raise AutomationError(f"Instagram container is {status}; no new publication attempted.")
        time.sleep(5)
    else:
        raise AutomationError("Container is still processing; its ID was saved for a later retry.")
    # Durable checkpoint BEFORE the irreversible request. An uncertain response
    # is reconciled read-only on retry, never blindly republished.
    record["status"] = "publish_requested"
    store.save(path, record)
    result = instagram.call(f"{instagram.user_id}/media_publish", method="POST", body={"creation_id": record["container_id"]})
    if not str(result.get("id", "")).isdigit():
        raise AutomationError("Publish response uncertain; inspect the journal before retrying.")
    record.update(status="published", media_id=result["id"], published_at=datetime.now(timezone.utc).isoformat())
    store.save(path, record)
    media = instagram.call(record["media_id"], fields={"fields": "permalink"})
    record["permalink"] = media.get("permalink")
    store.save(path, record)
    print(f"Published successfully: {record.get('permalink') or record['media_id']}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(f"\n## Published\n\n{record.get('permalink') or record['media_id']}\n")
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["generate", "check", "publish"])
    parser.add_argument("--date", help="IST calendar date (YYYY-MM-DD); defaults to today")
    args = parser.parse_args()
    if args.command == "check":
        Instagram().verify_account()
        print(f"Instagram account verified: @{EXPECTED_USERNAME}. No post was created or published.")
        return
    day = run_day(args.date)
    # Historical publishing is intentionally blocked; preview generation is okay.
    if args.command == "publish" and day != run_day():
        raise AutomationError("Only today's prepared post may be published.")
    store = GitHubStore()
    store.ensure_branch()
    generate(store, day) if args.command == "generate" else publish(store, day)


if __name__ == "__main__":
    try:
        main()
    except AutomationError as error:
        print(f"Automation stopped: {error}", file=sys.stderr)
        sys.exit(1)
