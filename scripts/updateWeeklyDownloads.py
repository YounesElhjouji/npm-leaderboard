import asyncio
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict

import aiohttp
from pymongo import MongoClient


class PackageDownloadsUpdater:
    def __init__(self):
        # MongoDB setup
        self.client = MongoClient("mongodb://localhost:27017/")
        self.db = self.client["npm-leaderboard"]
        self.collection = self.db["packages"]

        # NPM downloads API URL
        self.downloads_url = "https://api.npmjs.org/downloads"
        self.semaphore = asyncio.Semaphore(10)  # Limit concurrent requests

        # Setup logging
        self.log_dir = Path("data/logs")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.failed_updates = []

    def get_week_boundaries(self) -> tuple[datetime, datetime]:
        """
        Calculate the start and end dates for the 8-week period.
        Start from the last completed Sunday, then go back 8 weeks for the start date.
        """
        today = datetime.now()
        days_since_sunday = (today.weekday() + 1) % 7  # Days since last Sunday
        last_sunday = today - timedelta(days=days_since_sunday)
        start_date = last_sunday - timedelta(weeks=8)

        return (
            start_date.replace(hour=0, minute=0, second=0, microsecond=0),
            last_sunday,
        )

    async def fetch_weekly_downloads(
        self, session: aiohttp.ClientSession, package_name: str
    ) -> Dict:
        """Fetch and process weekly download data for a package."""
        try:
            start_date, end_date = self.get_week_boundaries()
            downloads_url = (
                f"{self.downloads_url}/range/"
                f"{start_date.strftime('%Y-%m-%d')}:{end_date.strftime('%Y-%m-%d')}/"
                f"{package_name}"
            )

            async with self.semaphore:
                async with session.get(downloads_url) as response:
                    if response.status != 200:
                        raise Exception(
                            f"Failed to fetch download stats: {response.status}"
                        )
                    download_data = await response.json()

            # Process downloads by week (Monday to Sunday)
            downloads_by_week = []
            current_week = []
            current_week_start = None

            for day_data in download_data.get("downloads", []):
                day_date = datetime.strptime(day_data["day"], "%Y-%m-%d")

                # Start new week on Monday
                if day_date.weekday() == 0:  # Monday
                    if current_week:
                        week_end = day_date - timedelta(days=1)  # Previous Sunday
                        downloads_by_week.append(
                            {
                                "week_ending": week_end.strftime("%Y-%m-%d"),
                                "downloads": sum(current_week),
                            }
                        )
                    current_week = []
                    current_week_start = day_date

                current_week.append(day_data["downloads"])

            # Add the last week if it's complete (ends on Sunday)
            if current_week and len(current_week) == 7:
                week_end = current_week_start + timedelta(days=6)
                downloads_by_week.append(
                    {
                        "week_ending": week_end.strftime("%Y-%m-%d"),
                        "downloads": sum(current_week),
                    }
                )

            return {"weekly_trends": downloads_by_week, "error": None}
        except Exception as e:
            return {"error": str(e)}

    def log_failed_update(self, package_name: str, error: str):
        """Log failed package updates."""
        self.failed_updates.append(
            {
                "package": package_name,
                "error": error,
                "timestamp": datetime.now().isoformat(),
            }
        )

    def save_failed_updates_log(self):
        """Save failed updates to a log file."""
        if self.failed_updates:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = self.log_dir / f"failed_downloads_updates_{timestamp}.log"
            with open(log_file, "w") as f:
                json.dump(self.failed_updates, f, indent=2)
            print(f"Failed updates log saved to: {log_file}")

    async def update_package(self, session: aiohttp.ClientSession, package: Dict):
        """Update weekly download stats for a single package."""
        try:
            package_name = package["name"]
            downloads_info = await self.fetch_weekly_downloads(session, package_name)

            if downloads_info.get("error"):
                raise Exception(downloads_info["error"])

            # Update document in MongoDB
            update_result = self.collection.update_one(
                {"name": package_name},
                {
                    "$set": {
                        "downloads.weekly_trends": downloads_info["weekly_trends"],
                        "last_updated": datetime.now(),
                    }
                },
            )

            if update_result.modified_count > 0:
                print(f"Successfully updated download stats for {package_name}")
            else:
                print(f"No changes made for {package_name}")

        except Exception as e:
            error_msg = f"Error updating {package_name}: {str(e)}"
            print(f"WARNING: {error_msg}")
            self.log_failed_update(package_name, str(e))

    async def update_all_packages(self):
        """Update all packages in the database with new download stats."""
        # Get all packages from MongoDB
        packages = list(self.collection.find({}, {"name": 1}))
        print(
            f"Starting to update {len(packages)} packages with weekly download stats..."
        )

        # Process packages
        async with aiohttp.ClientSession() as session:
            tasks = [self.update_package(session, package) for package in packages]
            await asyncio.gather(*tasks)

        # Save failed updates log
        self.save_failed_updates_log()

        # Print summary
        total_failed = len(self.failed_updates)
        successful = len(packages) - total_failed
        print("\nUpdate complete:")
        print(f"Total packages processed: {len(packages)}")
        print(f"Successfully updated: {successful}")
        print(f"Failed: {total_failed}")


def main():
    updater = PackageDownloadsUpdater()
    asyncio.run(updater.update_all_packages())


if __name__ == "__main__":
    start_time = time.time()
    main()
    print(f"\nTotal execution time: {time.time() - start_time:.2f} seconds")
