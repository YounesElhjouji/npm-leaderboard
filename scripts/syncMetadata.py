import datetime
import os

from pymongo import MongoClient


class SyncMetadata:
    def __init__(self):
        self.client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
        self.db = self.client["npm-leaderboard"]
        # We'll store our sync metadata in a collection called "settings"
        self.settings_collection = self.db["settings"]

    def update_last_sync(self, sync_date: datetime.datetime | None = None):
        """
        Update the last sync date in the database.
        If sync_date is None, the current datetime is used.
        """
        if sync_date is None:
            sync_date = datetime.datetime.now()
        self.settings_collection.update_one(
            {"_id": "lastSync"}, {"$set": {"date": sync_date}}, upsert=True
        )
        print(f"Last sync date updated to {sync_date}")

    def get_last_sync(self):
        """
        Retrieve the last sync date from the database.
        Returns None if the sync date hasn't been set.
        """
        doc = self.settings_collection.find_one({"_id": "lastSync"})
        if doc:
            return doc.get("date")
        return None


if __name__ == "__main__":
    # Test the SyncMetadata functionality
    sync = SyncMetadata()
    sync.update_last_sync()
    last_sync = sync.get_last_sync()
    print("Retrieved last sync date:", last_sync)
