import copy
from datetime import date
from email.message import Message
import unittest
from unittest.mock import patch

import run as automation


class MemoryStore:
    def __init__(self, record):
        self.record = record
        self.checkpoints = []

    def read(self, path):
        return copy.deepcopy(self.record)

    def save(self, path, record):
        self.record = copy.deepcopy(record)
        self.checkpoints.append(record["status"])


class FakeInstagram:
    user_id = "12345"

    def __init__(self, store, uncertain=False):
        self.store = store
        self.uncertain = uncertain
        self.publish_calls = 0
        self.found = None

    def verify_account(self):
        pass

    def container_status(self, container):
        return "FINISHED"

    def find_published(self, caption):
        return self.found

    def call(self, path, *, method="GET", body=None, fields=None):
        if path.endswith("/media_publish"):
            self.publish_calls += 1
            assert self.store.record["status"] == "publish_requested"
            if self.uncertain:
                raise automation.AutomationError("Uncertain provider response")
            return {"id": "98765"}
        if path.endswith("/media"):
            return {"id": "55555"}
        return {"permalink": "https://www.instagram.com/p/demo/"}


def prepared(**changes):
    return {"date": "2026-10-25", "status": "container_created", "caption": "A unique generated demo caption", "image_url": "https://raw.githubusercontent.com/example/image.jpg", "container_id": "55555", "expected_username": automation.EXPECTED_USERNAME, **changes}


class AutomationTests(unittest.TestCase):
    def test_product_rotation_is_daily_and_wraps(self):
        products = ["purifier", "pump", "filter"]
        self.assertEqual(automation.choose_product(date(2026, 10, 25), products), "purifier")
        self.assertEqual(automation.choose_product(date(2026, 10, 26), products), "pump")
        self.assertEqual(automation.choose_product(date(2026, 10, 28), products), "purifier")

    def test_caption_requires_generated_hashtags_and_discloses_demo(self):
        text = "Explore a water filter category and ask an installer about compatibility. #Water #Filter #Home"
        result = automation.finalize_caption(text, date(2026, 10, 25))
        self.assertIn("AI-generated illustration", result)
        self.assertIn("Demo series 2026-10-25", result)
        with self.assertRaises(automation.AutomationError):
            automation.finalize_caption("A template without hashtags", date.today())

    def test_caption_rejects_false_claims(self):
        with self.assertRaises(automation.AutomationError):
            automation.finalize_caption("This cures disease guaranteed. #Water #Filter #Home", date.today())

    def test_success_is_checkpointed_before_publish_and_not_repeated(self):
        store = MemoryStore(prepared())
        api = FakeInstagram(store)
        automation.publish(store, date(2026, 10, 25), api)
        self.assertEqual(store.record["status"], "published")
        self.assertEqual(store.record["media_id"], "98765")
        self.assertIn("publish_requested", store.checkpoints)
        automation.publish(store, date(2026, 10, 25), api)
        self.assertEqual(api.publish_calls, 1)

    def test_uncertain_publish_does_not_duplicate_on_retry(self):
        store = MemoryStore(prepared())
        api = FakeInstagram(store, uncertain=True)
        with self.assertRaises(automation.AutomationError):
            automation.publish(store, date(2026, 10, 25), api)
        self.assertEqual(store.record["status"], "publish_requested")
        with self.assertRaises(automation.AutomationError):
            automation.publish(store, date(2026, 10, 25), api)
        self.assertEqual(api.publish_calls, 1)
        api.found = {"id": "98765", "permalink": "https://www.instagram.com/p/demo/"}
        automation.publish(store, date(2026, 10, 25), api)
        self.assertEqual(store.record["status"], "published")
        self.assertEqual(api.publish_calls, 1)

    def test_journal_write_failure_prevents_publish(self):
        store = MemoryStore(prepared())
        api = FakeInstagram(store)
        with patch.object(store, "save", side_effect=automation.AutomationError("Storage unavailable")):
            with self.assertRaises(automation.AutomationError):
                automation.publish(store, date(2026, 10, 25), api)
        self.assertEqual(api.publish_calls, 0)

    def test_wrong_account_record_is_rejected(self):
        store = MemoryStore(prepared(instagram_user_id="99999"))
        api = FakeInstagram(store)
        with self.assertRaises(automation.AutomationError):
            automation.publish(store, date(2026, 10, 25), api)
        self.assertEqual(api.publish_calls, 0)

    def test_existing_prepared_post_is_not_regenerated(self):
        store = MemoryStore(prepared())
        with patch.object(automation, "generate_caption", side_effect=AssertionError("Do not regenerate")):
            result = automation.generate(store, date(2026, 10, 25))
        self.assertEqual(result["status"], "container_created")


if __name__ == "__main__":
    unittest.main()
