import asyncio
import datetime
import json
import os
import time
from pathlib import Path

import aiohttp
from pymongo import MongoClient


class NPMPackageUpdater:
    def __init__(self, batch_size: int = 100):
        self.registry_url = "https://registry.npmjs.org"
        self.downloads_url = "https://api.npmjs.org/downloads"
        self.ecosystem_url = (
            "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages"
        )
        self.semaphore = asyncio.Semaphore(10)

        self.client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
        self.db = self.client["npm-leaderboard"]
        self.collection = self.db["packages"]

        self.log_dir = Path("data/logs")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.failed_updates = []

        self.batch_size = batch_size
        self.total_processed = 0
        self.batch_start_time = None
        self.successful_in_current_batch = 0
        self.failed_in_current_batch = 0

    async def fetch_ecosystem_stats(self, session, package_name):
        try:
            async with session.get(f"{self.ecosystem_url}/{package_name}") as response:
                if response.status != 200:
                    return {
                        "error": f"Failed to fetch ecosystem stats: {response.status}"
                    }
                data = await response.json()
                return {
                    "total_downloads": data.get("downloads", 0),
                    "dependent_count": data.get("dependent_packages_count", 0),
                    "error": None,
                }
        except Exception as e:
            return {"error": str(e)}

    def get_week_boundaries(self):
        today = datetime.datetime.now()
        days_since_sunday = (today.weekday() + 1) % 7
        last_sunday = today - datetime.timedelta(days=days_since_sunday)
        start_date = last_sunday - datetime.timedelta(weeks=8)
        return (
            start_date.replace(hour=0, minute=0, second=0, microsecond=0),
            last_sunday,
        )

    async def fetch_weekly_trends(self, session, package_name):
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
                        return {
                            "error": f"Failed to fetch download stats: {response.status}"
                        }
                    download_data = await response.json()
            downloads_by_week = []
            current_week = []
            current_week_start = None
            for day_data in download_data.get("downloads", []):
                day_date = datetime.datetime.strptime(day_data["day"], "%Y-%m-%d")
                if day_date.weekday() == 0:
                    if current_week:
                        week_end = day_date - datetime.timedelta(days=1)
                        downloads_by_week.append(
                            {
                                "week_ending": week_end.strftime("%Y-%m-%d"),
                                "downloads": sum(current_week),
                            }
                        )
                    current_week = []
                    current_week_start = day_date
                current_week.append(day_data["downloads"])
            if current_week and len(current_week) == 7:
                week_end = current_week_start + datetime.timedelta(days=6)
                downloads_by_week.append(
                    {
                        "week_ending": week_end.strftime("%Y-%m-%d"),
                        "downloads": sum(current_week),
                    }
                )
            return {"weekly_trends": downloads_by_week, "error": None}
        except Exception as e:
            return {"error": str(e)}

    async def update_package_info(self, session, package_doc):
        package_name = package_doc["name"]
        try:
            async with self.semaphore:
                async with session.get(
                    f"{self.registry_url}/{package_name}"
                ) as response:
                    if response.status != 200:
                        raise Exception(
                            f"Failed to fetch package info: {response.status}"
                        )
                    data = await response.json()
            ecosystem_stats = await self.fetch_ecosystem_stats(session, package_name)
            if ecosystem_stats.get("error"):
                raise Exception(ecosystem_stats["error"])
            weekly_stats = await self.fetch_weekly_trends(session, package_name)
            if weekly_stats.get("error"):
                raise Exception(weekly_stats["error"])
            latest_version = data.get("dist-tags", {}).get("latest")
            if not latest_version or "versions" not in data:
                raise Exception("No version information found")
            latest_data = data["versions"][latest_version]
            peer_dependencies = list(latest_data.get("peerDependencies", {}).keys())
            update_fields = {
                "description": data.get("description", ""),
                "link": f"https://www.npmjs.com/package/{package_name}",
                "dependencies": list(latest_data.get("dependencies", {}).keys()),
                "peerDependencies": peer_dependencies,
                "downloads": {
                    "total": ecosystem_stats["total_downloads"],
                    "weekly_trends": weekly_stats["weekly_trends"],
                },
                "dependent_packages_count": ecosystem_stats["dependent_count"],
                "latest_version": latest_version,
                "last_updated": datetime.datetime.now(),
            }
            self.collection.update_one({"name": package_name}, {"$set": update_fields})
            print(f"✓ Updated package: {package_name}")
            self.successful_in_current_batch += 1
        except Exception as e:
            error_msg = f"✗ Error updating {package_name}: {str(e)}"
            print(f"WARNING: {error_msg}")
            self.failed_updates.append(
                {
                    "package": package_name,
                    "error": str(e),
                    "timestamp": datetime.datetime.now().isoformat(),
                }
            )
            self.failed_in_current_batch += 1

    def print_batch_progress(self, current_batch: int, total_batches: int):
        if self.batch_start_time:
            elapsed = time.time() - self.batch_start_time
            success_rate = (
                (self.successful_in_current_batch / self.batch_size * 100)
                if self.batch_size > 0
                else 0
            )
            print(f"\n--- Batch {current_batch}/{total_batches} Progress ---")
            print(f"Successful in this batch: {self.successful_in_current_batch}")
            print(f"Failed in this batch: {self.failed_in_current_batch}")
            print(f"Success rate: {success_rate:.1f}%")
            print(f"Batch processing time: {elapsed:.1f} seconds")
            if self.successful_in_current_batch > 0:
                print(
                    f"Average time per successful update: {elapsed / self.successful_in_current_batch:.1f} seconds"
                )
            print(f"Total packages processed so far: {self.total_processed}")

    async def update_batch(
        self,
        session: aiohttp.ClientSession,
        batch: list,
        batch_num: int,
        total_batches: int,
    ):
        self.batch_start_time = time.time()
        self.successful_in_current_batch = 0
        self.failed_in_current_batch = 0

        print(f"\nStarting batch {batch_num}/{total_batches} ({len(batch)} packages)")
        tasks = [self.update_package_info(session, pkg) for pkg in batch]
        await asyncio.gather(*tasks)
        self.total_processed += len(batch)
        self.print_batch_progress(batch_num, total_batches)

    async def update_all_packages(self):
        packages = list(self.collection.find({}, {"name": 1}))
        total_packages = len(packages)
        print(f"Updating {total_packages} existing packages...")
        if total_packages == 0:
            print("No packages found to update!")
            return

        # Create batches based on the batch size.
        batches = [
            packages[i : i + self.batch_size]
            for i in range(0, total_packages, self.batch_size)
        ]
        total_batches = len(batches)

        async with aiohttp.ClientSession() as session:
            for batch_num, batch in enumerate(batches, 1):
                await self.update_batch(session, batch, batch_num, total_batches)

        if self.failed_updates:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = self.log_dir / f"failed_updates_{timestamp}.log"
            with open(log_file, "w") as f:
                json.dump(self.failed_updates, f, indent=2)
            print(f"Failed updates log saved to: {log_file}")

        total_failed = len(self.failed_updates)
        total_successful = total_packages - total_failed
        print("\nUpdate complete:")
        print(f"Total packages processed: {total_packages}")
        print(f"Successful: {total_successful}")
        print(f"Failed: {total_failed}")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Update existing npm packages in batches."
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of packages to update in each batch",
    )
    args = parser.parse_args()

    updater = NPMPackageUpdater(batch_size=args.batch_size)
    start_time = time.time()
    asyncio.run(updater.update_all_packages())
    elapsed = time.time() - start_time
    print(f"\nTotal execution time: {elapsed:.2f} seconds")


if __name__ == "__main__":
    main()
